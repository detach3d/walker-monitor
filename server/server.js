/**
 * Walker Monitor Server
 * 
 * Centralized server that aggregates data from multiple agent hosts
 * and serves the web UI
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Helper function to fetch from agent
async function fetchFromAgent(host, endpoint) {
    try {
        const url = `${host.url}${endpoint}`;
        const options = {};

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
        // Update host status to offline
        host.status = 'offline';
        return { success: false, error: error.message };
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

    if (!name || !url) {
        return res.status(400).json({ error: 'Name and URL are required' });
    }

    if (hosts.has(name)) {
        return res.status(409).json({ error: 'Host with this name already exists' });
    }

    const host = {
        name,
        url: url.replace(/\/$/, ''), // Remove trailing slash
        apiKey: apiKey || null,
        status: 'offline',
        lastSeen: null,
        lastSnapshot: null,
        reportedHostname: null
    };

    // Test connection
    const healthCheck = await fetchFromAgent(host, '/health');

    hosts.set(name, host);

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
