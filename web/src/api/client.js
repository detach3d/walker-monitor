/**
 * API Client for Walker Monitor Server
 */

const API_BASE = '/api';

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

export const api = {
    // Host management
    getHosts: () => fetchJSON(`${API_BASE}/hosts`),

    addHost: (name, url, apiKey) =>
        fetchJSON(`${API_BASE}/hosts`, {
            method: 'POST',
            body: JSON.stringify({ name, url, apiKey }),
        }),

    updateHost: (hostname, name, url, apiKey) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}`, {
            method: 'PUT',
            body: JSON.stringify({ name, url, apiKey }),
        }),

    removeHost: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}`, {
            method: 'DELETE',
        }),

    getHostInfo: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/info`),

    // Host data
    getSnapshot: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/snapshot`),

    getPS: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/ps`),

    getFDT: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/fdt`),

    getCPU: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/cpu`),

    getNetwork: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/network`),

    refresh: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/refresh`),

    getRaw: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/raw`),

    getTreeAll: (hostname) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/tree`),

    getTree: (hostname, pid) =>
        fetchJSON(`${API_BASE}/hosts/${hostname}/tree/${pid}`),
};
