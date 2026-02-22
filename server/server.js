/**
 * Walker Monitor Server
 * 
 * Centralized server that aggregates data from multiple agent hosts
 * and serves the web UI
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const dns = require('dns').promises;
const net = require('net');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_FETCH_TIMEOUT_MS = Number.parseInt(process.env.AGENT_FETCH_TIMEOUT_MS || '10000', 10);
const ALLOW_LOOPBACK_AGENT = /^(1|true|yes|on)$/i.test(process.env.ALLOW_LOOPBACK_AGENT || 'false');
const ALLOW_LINK_LOCAL_AGENT = /^(1|true|yes|on)$/i.test(process.env.ALLOW_LINK_LOCAL_AGENT || 'false');
const RECENT_START_WINDOW_SEC = 300;
const SUSPICIOUS_PATH_PREFIXES = ['/tmp/', '/dev/shm/', '/var/tmp/', '/run/shm/'];
const KTHREAD_NAME_PREFIXES = ['kworker', 'migration', 'ksoftirqd', 'kdevtmpfs', 'rcu_'];

// Middleware
app.use(cors());
app.use(express.json());

// In-memory host registry
const hosts = new Map();

/**
 * Host structure:
 * {
 *   name: string,
 *   url: string,
 *   apiKey: string | null,
 *   status: 'online' | 'offline',
 *   lastSeen: Date | null,
 *   lastSnapshot: Date | null,
 *   reportedHostname: string | null
 * }
 */

function includeFlag(flags, flag) {
    if (!flags.includes(flag)) {
        flags.push(flag);
    }
}

function startsWithSuspiciousPath(pathValue) {
    if (typeof pathValue !== 'string' || !pathValue) {
        return false;
    }
    return pathValue.startsWith('memfd:') || SUSPICIOUS_PATH_PREFIXES.some((prefix) => pathValue.startsWith(prefix));
}

function isKernelThreadName(command) {
    if (typeof command !== 'string' || !command) {
        return false;
    }
    if (command.startsWith('[')) {
        return true;
    }
    return KTHREAD_NAME_PREFIXES.some((prefix) => command.startsWith(prefix));
}

function parseInitNamespaces(processes) {
    const initProcess = processes.find((proc) => proc.pid === 1 && proc.namespaces && typeof proc.namespaces === 'object');
    if (!initProcess) return null;

    const initNs = {};
    for (const [nsName, nsInum] of Object.entries(initProcess.namespaces)) {
        if (nsName !== 'depth') {
            initNs[nsName] = nsInum;
        }
    }
    return Object.keys(initNs).length ? initNs : null;
}

function normalizeAnomalyProcesses(processes) {
    if (!Array.isArray(processes)) {
        return [];
    }

    return processes.map((proc) => ({
        ...proc,
        flags: [],
        threads: Array.isArray(proc.threads)
            ? proc.threads.map((thread) => ({ ...thread, flags: [] }))
            : [],
        namespaces: proc.namespaces && typeof proc.namespaces === 'object'
            ? { ...proc.namespaces }
            : {},
        vmas: Array.isArray(proc.vmas)
            ? proc.vmas.map((vma) => ({ ...vma }))
            : [],
        privesc: proc.privesc && typeof proc.privesc === 'object'
            ? { ...proc.privesc }
            : proc.privesc ?? null,
    }));
}

function applyAnomalyRules(processes) {
    const normalized = normalizeAnomalyProcesses(processes);
    const initNs = parseInitNamespaces(normalized);
    const nowSec = Date.now() / 1000;

    for (const proc of normalized) {
        for (const thread of proc.threads) {
            const exePath = thread.exe_path;
            if (typeof exePath !== 'string' || !exePath) {
                continue;
            }

            if (exePath.includes('(deleted)')) {
                includeFlag(thread.flags, 'deleted');
                includeFlag(proc.flags, 'deleted');
            }

            if (startsWithSuspiciousPath(exePath)) {
                includeFlag(thread.flags, 'suspicious_path');
                includeFlag(proc.flags, 'suspicious_path');
            }
        }

        if (proc.privesc && Number.isFinite(Number(proc.privesc.current_uid))) {
            includeFlag(proc.flags, 'privesc');
        }

        for (const vma of proc.vmas) {
            const perms = typeof vma.perms === 'string' ? vma.perms : '';
            const mapping = typeof vma.mapping === 'string' ? vma.mapping : '';
            const filePath = typeof vma.file === 'string' ? vma.file : '';

            if (perms.includes('w') && perms.includes('x') && mapping === 'private') {
                includeFlag(proc.flags, 'suspicious_vma');
            }

            if (filePath && perms.includes('x') && SUSPICIOUS_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
                includeFlag(proc.flags, 'suspicious_vma');
            }
        }

        const hasExe = proc.threads.some((thread) => Boolean(thread.exe_path));

        if (isKernelThreadName(proc.comm) && hasExe) {
            includeFlag(proc.flags, 'kthread_imposter');
        }
        if (!hasExe) {
            includeFlag(proc.flags, 'kernel_thread');
        }

        if (initNs && proc.namespaces && typeof proc.namespaces === 'object') {
            for (const [nsName, nsInum] of Object.entries(proc.namespaces)) {
                if (nsName === 'depth') {
                    continue;
                }

                if (Object.prototype.hasOwnProperty.call(initNs, nsName) && nsInum !== initNs[nsName]) {
                    includeFlag(proc.flags, 'non_default_ns');
                    break;
                }
            }
        }

        const startRealtime = Number(proc.start_realtime);
        if (Number.isFinite(startRealtime) && Number(proc.pid) > 2) {
            const ageSec = nowSec - startRealtime;
            if (ageSec < RECENT_START_WINDOW_SEC) {
                includeFlag(proc.flags, 'recently_started');
            }
        }
    }

    return normalized;
}

function disallowedAddressReason(address) {
    const family = net.isIP(address);
    if (!family) {
        return 'invalid IP address';
    }

    if (family === 4) {
        const octets = address.split('.').map((item) => Number(item));
        if (octets.length !== 4 || octets.some((item) => Number.isNaN(item) || item < 0 || item > 255)) {
            return 'invalid IPv4 address';
        }

        if (octets[0] === 0) return 'unspecified IPv4 address';
        if (octets[0] >= 224 && octets[0] <= 239) return 'multicast IPv4 address';
        if (octets[0] === 255 && octets.slice(1).every((part) => part === 255)) return 'broadcast IPv4 address';
        if (!ALLOW_LOOPBACK_AGENT && octets[0] === 127) return 'loopback IPv4 address';
        if (!ALLOW_LINK_LOCAL_AGENT && octets[0] === 169 && octets[1] === 254) return 'link-local IPv4 address';

        return null;
    }

    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
        return disallowedAddressReason(normalized.substring('::ffff:'.length));
    }

    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return 'unspecified IPv6 address';
    if (!ALLOW_LOOPBACK_AGENT && (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1')) {
        return 'loopback IPv6 address';
    }
    if (!ALLOW_LINK_LOCAL_AGENT && (/^fe[89ab]/).test(normalized)) return 'link-local IPv6 address';
    if ((/^ff/).test(normalized)) return 'multicast IPv6 address';

    return null;
}

async function normalizeAndValidateAgentUrl(candidateUrl) {
    if (!candidateUrl || typeof candidateUrl !== 'string') {
        throw new Error('Agent URL is required');
    }

    let parsed;
    try {
        parsed = new URL(candidateUrl.trim());
    } catch {
        throw new Error('Agent URL is invalid');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Agent URL protocol must be http or https');
    }
    if (!parsed.hostname) {
        throw new Error('Agent URL must include a hostname');
    }
    if (parsed.username || parsed.password) {
        throw new Error('Agent URL must not include credentials');
    }
    if (parsed.search || parsed.hash) {
        throw new Error('Agent URL must not include query strings or fragments');
    }
    if (parsed.pathname && parsed.pathname !== '/') {
        throw new Error('Agent URL path must be empty (example: http://host:5000)');
    }

    const resolved = net.isIP(parsed.hostname)
        ? [{ address: parsed.hostname }]
        : await dns.lookup(parsed.hostname, { all: true, verbatim: true });

    if (!resolved.length) {
        throw new Error('Agent hostname did not resolve to any IP address');
    }

    for (const entry of resolved) {
        const reason = disallowedAddressReason(entry.address);
        if (reason) {
            throw new Error(
                `Agent URL resolves to disallowed address ${entry.address} (${reason}). ` +
                `Use ALLOW_LOOPBACK_AGENT/ALLOW_LINK_LOCAL_AGENT only if intentional.`
            );
        }
    }

    return parsed.origin;
}

// Helper function to fetch from agent
async function fetchFromAgent(host, endpoint) {
    try {
        const safeBaseUrl = await normalizeAndValidateAgentUrl(host.url);
        const url = `${safeBaseUrl}${endpoint}`;
        const options = { timeout: AGENT_FETCH_TIMEOUT_MS };

        if (host.apiKey) {
            options.headers = {
                'Authorization': `Bearer ${host.apiKey}`
            };
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Update host status
        host.status = 'online';
        host.lastSeen = new Date();
        if (data.hostname) {
            host.reportedHostname = data.hostname;
        }

        return { success: true, data };
    } catch (error) {
        const timeoutError = error.type === 'request-timeout'
            ? `Agent request timed out after ${AGENT_FETCH_TIMEOUT_MS}ms`
            : error.message;

        // Update host status to offline
        host.status = 'offline';
        return { success: false, error: timeoutError };
    }
}

// Background health check (every 30 seconds)
setInterval(async () => {
    for (const [name, host] of hosts.entries()) {
        const result = await fetchFromAgent(host, '/health');
        if (result.success) {
            console.log(`[Health Check] ${name}: online`);
        } else {
            console.log(`[Health Check] ${name}: offline - ${result.error}`);
        }
    }
}, 30000);

// API Routes

/**
 * GET /api/hosts
 * List all registered hosts with their status
 */
app.get('/api/hosts', (req, res) => {
    const hostList = Array.from(hosts.entries()).map(([name, host]) => ({
        name,
        url: host.url,
        apiKeyConfigured: Boolean(host.apiKey),
        status: host.status,
        lastSeen: host.lastSeen,
        lastSnapshot: host.lastSnapshot,
        reportedHostname: host.reportedHostname
    }));

    res.json({
        hosts: hostList,
        count: hostList.length
    });
});

/**
 * POST /api/hosts
 * Add a new host
 * Body: { name, url, apiKey? }
 */
app.post('/api/hosts', async (req, res) => {
    const { name, url, apiKey } = req.body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName || !url) {
        return res.status(400).json({ error: 'Name and URL are required' });
    }

    if (hosts.has(normalizedName)) {
        return res.status(409).json({ error: 'Host with this name already exists' });
    }

    let normalizedUrl;
    try {
        normalizedUrl = await normalizeAndValidateAgentUrl(url);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const host = {
        name: normalizedName,
        url: normalizedUrl,
        apiKey: typeof apiKey === 'string' ? (apiKey.trim() || null) : null,
        status: 'offline',
        lastSeen: null,
        lastSnapshot: null,
        reportedHostname: null
    };

    // Test connection
    const healthCheck = await fetchFromAgent(host, '/health');

    hosts.set(normalizedName, host);

    res.status(201).json({
        message: 'Host added successfully',
        host: {
            name: host.name,
            url: host.url,
            status: host.status,
            healthy: healthCheck.success
        }
    });
});

/**
 * PUT /api/hosts/:hostname
 * Update host settings
 * Body: { name, url, apiKey? }
 */
app.put('/api/hosts/:hostname', async (req, res) => {
    const { hostname } = req.params;
    const { name, url, apiKey } = req.body;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const nextName = (name ?? hostname).trim();
    const rawNextUrl = (url ?? host.url).trim();

    if (!nextName || !rawNextUrl) {
        return res.status(400).json({ error: 'Name and URL are required' });
    }

    if (nextName !== hostname && hosts.has(nextName)) {
        return res.status(409).json({ error: 'Host with this name already exists' });
    }

    let nextUrl;
    try {
        nextUrl = await normalizeAndValidateAgentUrl(rawNextUrl);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const nextApiKey = typeof apiKey === 'undefined'
        ? host.apiKey
        : ((typeof apiKey === 'string' ? apiKey.trim() : '') || null);

    const updatedHost = {
        ...host,
        name: nextName,
        url: nextUrl,
        apiKey: nextApiKey
    };

    if (nextName !== hostname) {
        hosts.delete(hostname);
    }
    hosts.set(nextName, updatedHost);

    const healthCheck = await fetchFromAgent(updatedHost, '/health');

    res.json({
        message: 'Host updated successfully',
        previousName: hostname,
        host: {
            name: nextName,
            url: updatedHost.url,
            apiKeyConfigured: Boolean(updatedHost.apiKey),
            status: updatedHost.status,
            healthy: healthCheck.success
        }
    });
});

/**
 * DELETE /api/hosts/:hostname
 * Remove a host
 */
app.delete('/api/hosts/:hostname', (req, res) => {
    const { hostname } = req.params;

    if (!hosts.has(hostname)) {
        return res.status(404).json({ error: 'Host not found' });
    }

    hosts.delete(hostname);

    res.json({ message: 'Host removed successfully' });
});

/**
 * GET /api/hosts/:hostname/info
 * Get detailed info about a host
 */
app.get('/api/hosts/:hostname/info', (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    res.json({
        name: hostname,
        url: host.url,
        apiKeyConfigured: Boolean(host.apiKey),
        status: host.status,
        lastSeen: host.lastSeen,
        lastSnapshot: host.lastSnapshot,
        reportedHostname: host.reportedHostname
    });
});

/**
 * GET /api/hosts/:hostname/snapshot
 * Get process snapshot from host
 */
app.get('/api/hosts/:hostname/snapshot', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/snapshot');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    host.lastSnapshot = new Date();

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/ps
 * Get process/thread list from host
 */
app.get('/api/hosts/:hostname/ps', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/ps');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/fdt
 * Get file descriptor table from host
 */
app.get('/api/hosts/:hostname/fdt', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/fdt');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/cpu
 * Get CPU info from host
 */
app.get('/api/hosts/:hostname/cpu', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/cpu');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/network
 * Get socket info from host
 */
app.get('/api/hosts/:hostname/network', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/network');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/memory
 * Get memory info from host
 */
app.get('/api/hosts/:hostname/memory', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/memory');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/anomalies
 * Get anomalies info from host
 */
app.get('/api/hosts/:hostname/anomalies', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/anomalies');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    const detectedProcesses = applyAnomalyRules(result.data?.processes);

    res.json({
        ...result.data,
        processes: detectedProcesses
    });
});

/**
 * GET /api/hosts/:hostname/refresh
 * Trigger fresh snapshot on host
 */
app.get('/api/hosts/:hostname/refresh', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/refresh');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    host.lastSnapshot = new Date();

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/tree
 * Get full process tree (parents/children)
 */
app.get('/api/hosts/:hostname/tree', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/tree');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/tree/:pid
 * Get process tree (parents/children) for a specific PID
 */
app.get('/api/hosts/:hostname/tree/:pid', async (req, res) => {
    const { hostname, pid } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, `/tree/${pid}`);

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

/**
 * GET /api/hosts/:hostname/raw
 * Get raw walker output from host
 */
app.get('/api/hosts/:hostname/raw', async (req, res) => {
    const { hostname } = req.params;

    const host = hosts.get(hostname);
    if (!host) {
        return res.status(404).json({ error: 'Host not found' });
    }

    const result = await fetchFromAgent(host, '/raw');

    if (!result.success) {
        return res.status(503).json({ error: result.error });
    }

    res.json(result.data);
});

// Serve static files from web UI (in production)
app.use(express.static(path.join(__dirname, '../web/dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Walker Monitor Server running on http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
});
