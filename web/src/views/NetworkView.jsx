import React, { useState } from 'react';
import {
    FiChevronDown,
    FiChevronRight,
    FiWifi,
    FiLink2,
    FiActivity,
    FiArrowRight
} from 'react-icons/fi';
import './NetworkView.css';

const NetworkView = ({ networkData, searchQuery }) => {
    const [expandedConnections, setExpandedConnections] = useState(new Set());

    if (!networkData) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🌐</div>
                <div className="empty-state-title">No Data Available</div>
                <div className="empty-state-description">
                    Select a host and click refresh to view socket activity
                </div>
            </div>
        );
    }

    const allProcesses = networkData.processes || [];
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const allConnections = allProcesses
        .flatMap((proc) =>
            (proc.sockets || []).map((sock, idx) => ({
                id: `${proc.pid}-${sock.fd}-${idx}-${sock.local || ''}-${sock.remote || ''}`,
                pid: proc.pid,
                comm: proc.comm,
                fd: sock.fd,
                family: sock.family || 'Unknown',
                state: sock.state || 'unknown',
                local: sock.local || '-',
                remote: sock.remote || '-',
                localAddress: sock.local_address || '-',
                localPort: sock.local_port,
                remoteAddress: sock.remote_address || '-',
                remotePort: sock.remote_port,
            }))
        )
        .sort((a, b) => a.pid - b.pid || (a.fd || 0) - (b.fd || 0));

    const groupedByConnection = new Map();
    allConnections.forEach((conn) => {
        const groupKey = `${conn.family}|${conn.state}|${conn.local}|${conn.remote}`;
        if (!groupedByConnection.has(groupKey)) {
            groupedByConnection.set(groupKey, {
                id: groupKey,
                family: conn.family,
                state: conn.state,
                local: conn.local,
                remote: conn.remote,
                localAddress: conn.localAddress,
                localPort: conn.localPort,
                remoteAddress: conn.remoteAddress,
                remotePort: conn.remotePort,
                owners: [],
            });
        }

        groupedByConnection.get(groupKey).owners.push({
            pid: conn.pid,
            comm: conn.comm,
            fd: conn.fd,
        });
    });

    const groupedConnections = [...groupedByConnection.values()].sort((a, b) => {
        const stateRank = { connected: 0, listening: 1, unknown: 2 };
        const byState = (stateRank[a.state] ?? 9) - (stateRank[b.state] ?? 9);
        if (byState !== 0) return byState;
        const byOwners = b.owners.length - a.owners.length;
        if (byOwners !== 0) return byOwners;
        return a.local.localeCompare(b.local);
    });

    const filteredConnections = groupedConnections.filter((conn) => {
        if (!normalizedQuery) return true;

        return (
            conn.local.toLowerCase().includes(normalizedQuery) ||
            conn.remote.toLowerCase().includes(normalizedQuery) ||
            conn.family.toLowerCase().includes(normalizedQuery) ||
            conn.state.toLowerCase().includes(normalizedQuery) ||
            conn.owners.some((owner) =>
                owner.pid.toString().includes(normalizedQuery) ||
                String(owner.fd).includes(normalizedQuery) ||
                owner.comm.toLowerCase().includes(normalizedQuery)
            )
        );
    });

    const totalConnections = allConnections.length;
    const uniqueConnections = groupedConnections.length;
    const collapsedDuplicates = Math.max(totalConnections - uniqueConnections, 0);
    const activeProcesses = new Set(allConnections.map((conn) => conn.pid)).size;

    const toggleExpand = (connectionId) => {
        const next = new Set(expandedConnections);
        if (next.has(connectionId)) {
            next.delete(connectionId);
        } else {
            next.add(connectionId);
        }
        setExpandedConnections(next);
    };

    return (
        <div className="network-view">
            <div className="view-header">
                <h2 className="view-title">Network Sockets</h2>
                <span className="timestamp">Last updated: {new Date(networkData.timestamp).toLocaleString()}</span>
            </div>

            <div className="network-metrics">
                <div className="network-metric-card">
                    <FiWifi className="metric-icon" />
                    <div>
                        <div className="metric-label">Active Processes</div>
                        <div className="metric-value">{activeProcesses}</div>
                    </div>
                </div>
                <div className="network-metric-card">
                    <FiLink2 className="metric-icon" />
                    <div>
                        <div className="metric-label">Observed Sockets</div>
                        <div className="metric-value">{totalConnections}</div>
                    </div>
                </div>
                <div className="network-metric-card">
                    <FiActivity className="metric-icon" />
                    <div>
                        <div className="metric-label">Unique Connections</div>
                        <div className="metric-value">{uniqueConnections}</div>
                    </div>
                </div>
                <div className="network-metric-card">
                    <FiActivity className="metric-icon" />
                    <div>
                        <div className="metric-label">Duplicates Collapsed</div>
                        <div className="metric-value">{collapsedDuplicates}</div>
                    </div>
                </div>
            </div>

            <div className="network-container">
                {filteredConnections.length === 0 ? (
                    <div className="empty-state compact">
                        <div className="empty-state-title">No connection matches found</div>
                        <div className="empty-state-description">
                            Try searching by PID, command, endpoint, state, or address family.
                        </div>
                    </div>
                ) : (
                    filteredConnections.map((conn) => {
                        const isExpanded = expandedConnections.has(conn.id);
                        const isListening = conn.state === 'listening' || conn.remotePort === 0;
                        const ownerCount = conn.owners.length;
                        const leadOwner = conn.owners[0];

                        return (
                            <div
                                key={conn.id}
                                className={`connection-card ${isExpanded ? 'expanded' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="connection-summary"
                                    onClick={() => toggleExpand(conn.id)}
                                >
                                    <div className="connection-main">
                                        <span className={`socket-state ${conn.state || 'unknown'}`}>
                                            {conn.state || 'unknown'}
                                        </span>
                                        <span className="connection-endpoint">
                                            {conn.local}
                                            <FiArrowRight className="connection-arrow" />
                                            {conn.remote}
                                        </span>
                                    </div>
                                    <div className="connection-meta">
                                        <span className="badge badge-secondary">{conn.family}</span>
                                        <span className="badge badge-primary">{ownerCount} owner{ownerCount > 1 ? 's' : ''}</span>
                                        {leadOwner && <span className="badge badge-secondary">PID {leadOwner.pid}</span>}
                                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="connection-details">
                                        <div className="detail-grid">
                                            <div className="detail-item">
                                                <span className="detail-label">Owner Count</span>
                                                <span className="detail-value">{ownerCount}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Primary Owner</span>
                                                <span className="detail-value">{leadOwner ? `${leadOwner.comm} (${leadOwner.pid})` : '-'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Family</span>
                                                <span className="detail-value">{conn.family}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">State</span>
                                                <span className="detail-value">{isListening ? 'listening' : conn.state}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Local Address</span>
                                                <span className="detail-value">{conn.localAddress}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Local Port</span>
                                                <span className="detail-value">{conn.localPort ?? '-'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Remote Address</span>
                                                <span className="detail-value">{conn.remoteAddress}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Remote Port</span>
                                                <span className="detail-value">{conn.remotePort ?? '-'}</span>
                                            </div>
                                        </div>

                                        <div className="owner-table-wrap">
                                            <table className="owner-table">
                                                <thead>
                                                    <tr>
                                                        <th>Process</th>
                                                        <th>PID</th>
                                                        <th>FD</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {conn.owners.map((owner, index) => (
                                                        <tr key={`${conn.id}-${owner.pid}-${owner.fd}-${index}`}>
                                                            <td>{owner.comm}</td>
                                                            <td className="owner-pid">{owner.pid}</td>
                                                            <td className="owner-fd">{owner.fd}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default NetworkView;
