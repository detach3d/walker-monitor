import React, { useState } from 'react';
import { FiArrowUp, FiArrowDown } from 'react-icons/fi';
import './MemoryView.css';

const MemoryView = ({ memoryData, searchQuery }) => {
    const [sortField, setSortField] = useState('resident_kb');
    const [sortDirection, setSortDirection] = useState('desc');

    if (!memoryData) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🧠</div>
                <div className="empty-state-title">No Data Available</div>
                <div className="empty-state-description">
                    Select a host and click refresh to view memory data
                </div>
            </div>
        );
    }

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const filterProcesses = (processes) => {
        if (!searchQuery) return processes;
        return processes.filter(p =>
            p.pid.toString().includes(searchQuery) ||
            p.comm.toLowerCase().includes(searchQuery.toLowerCase())
        );
    };

    const formatKB = (kb) => {
        if (kb === undefined || kb === null) return 'N/A';
        if (kb < 1024) return `${kb} KB`;
        const mb = kb / 1024;
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        const gb = mb / 1024;
        return `${gb.toFixed(2)} GB`;
    };

    const stateLabel = (s) => {
        switch (s) {
            case 'R': return 'Running';
            case 'S': return 'Sleeping';
            case 'D': return 'Disk Sleep';
            case 'T': return 'Stopped';
            case 'Z': return 'Zombie';
            case 'X': return 'Dead';
            case 'I': return 'Idle';
            default: return s || '?';
        }
    };

    const stateClass = (s) => {
        switch (s) {
            case 'R': return 'state-running';
            case 'S': return 'state-sleeping';
            case 'D': return 'state-disk';
            case 'T': return 'state-stopped';
            case 'Z': return 'state-zombie';
            default: return 'state-other';
        }
    };

    let processes = filterProcesses(memoryData.processes || []);

    processes = [...processes].sort((a, b) => {
        let aVal = a[sortField] ?? '';
        let bVal = b[sortField] ?? '';

        if (sortField === 'comm' || sortField === 'state') {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        } else {
            aVal = Number(aVal || 0);
            bVal = Number(bVal || 0);
        }

        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    const totalResident = (memoryData.processes || []).reduce((s, p) => s + (p.resident_kb || 0), 0);
    const totalVirtual = (memoryData.processes || []).reduce((s, p) => s + (p.virtual_kb || 0), 0);
    const totalShared = (memoryData.processes || []).reduce((s, p) => s + (p.shared_kb || 0), 0);
    const maxResident = Math.max(...(memoryData.processes || []).map(p => p.resident_kb || 0), 1);

    const renderSortIcon = (field) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />;
    };

    return (
        <div className="memory-view">
            <div className="view-header">
                <h2 className="view-title">Memory</h2>
                <span className="timestamp">Last updated: {new Date(memoryData.timestamp).toLocaleString()}</span>
            </div>

            <div className="memory-summary">
                <div className="summary-card">
                    <span className="summary-label">Total Resident</span>
                    <span className="summary-value">{formatKB(totalResident)}</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Total Virtual</span>
                    <span className="summary-value">{formatKB(totalVirtual)}</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Total Shared</span>
                    <span className="summary-value">{formatKB(totalShared)}</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Processes</span>
                    <span className="summary-value">{processes.length}</span>
                </div>
            </div>

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('pid')} style={{ cursor: 'pointer' }}>
                                PID {renderSortIcon('pid')}
                            </th>
                            <th onClick={() => handleSort('comm')} style={{ cursor: 'pointer' }}>
                                Command {renderSortIcon('comm')}
                            </th>
                            <th onClick={() => handleSort('state')} style={{ cursor: 'pointer' }}>
                                State {renderSortIcon('state')}
                            </th>
                            <th onClick={() => handleSort('resident_kb')} style={{ cursor: 'pointer' }}>
                                Resident {renderSortIcon('resident_kb')}
                            </th>
                            <th onClick={() => handleSort('virtual_kb')} style={{ cursor: 'pointer' }}>
                                Virtual {renderSortIcon('virtual_kb')}
                            </th>
                            <th onClick={() => handleSort('shared_kb')} style={{ cursor: 'pointer' }}>
                                Shared {renderSortIcon('shared_kb')}
                            </th>
                            <th>Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processes.map(proc => {
                            const pct = Math.round(((proc.resident_kb || 0) / maxResident) * 100);
                            return (
                                <tr key={proc.pid}>
                                    <td><span className="process-pid">{proc.pid}</span></td>
                                    <td>{proc.comm}</td>
                                    <td>
                                        <span className={`state-badge ${stateClass(proc.state)}`}>
                                            {proc.state} {stateLabel(proc.state)}
                                        </span>
                                    </td>
                                    <td className="mem-value">{formatKB(proc.resident_kb)}</td>
                                    <td className="mem-value">{formatKB(proc.virtual_kb)}</td>
                                    <td className="mem-value">{formatKB(proc.shared_kb)}</td>
                                    <td className="usage-cell">
                                        <div className="mem-bar">
                                            <div className="mem-bar-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MemoryView;
