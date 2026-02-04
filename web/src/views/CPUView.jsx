import React, { useState } from 'react';
import { FiArrowUp, FiArrowDown } from 'react-icons/fi';

const CPUView = ({ cpuData, searchQuery }) => {
    const [sortField, setSortField] = useState('pid');
    const [sortDirection, setSortDirection] = useState('asc');

    if (!cpuData) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">⚡</div>
                <div className="empty-state-title">No Data Available</div>
                <div className="empty-state-description">
                    Select a host and click refresh to view CPU data
                </div>
            </div>
        );
    }

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const filterProcesses = (processes) => {
        if (!searchQuery) return processes;
        return processes.filter(p =>
            p.pid.toString().includes(searchQuery) ||
            p.comm.toLowerCase().includes(searchQuery.toLowerCase())
        );
    };

    const formatTime = (ns) => {
        const ms = ns / 1000;
        if (ms < 1000) return `${ms.toFixed(0)} μs`;
        const sec = ms / 1000;
        if (sec < 60) return `${sec.toFixed(2)} s`;
        const min = sec / 60;
        return `${min.toFixed(2)} min`;
    };

    let processes = filterProcesses(cpuData.processes || []);

    // Sort processes
    processes = [...processes].sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (sortField === 'comm') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }

        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    const SortIcon = () => (
        sortDirection === 'asc' ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />
    );

    return (
        <div className="cpu-view">
            <div className="view-header">
                <h2 className="view-title">CPU Info</h2>
                <span className="timestamp">Last updated: {new Date(cpuData.timestamp).toLocaleString()}</span>
            </div>

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('pid')} style={{ cursor: 'pointer' }}>
                                PID {sortField === 'pid' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('comm')} style={{ cursor: 'pointer' }}>
                                Command {sortField === 'comm' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('cpu')} style={{ cursor: 'pointer' }}>
                                CPU {sortField === 'cpu' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('user_time_ns')} style={{ cursor: 'pointer' }}>
                                User Time {sortField === 'user_time_ns' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('system_time_ns')} style={{ cursor: 'pointer' }}>
                                System Time {sortField === 'system_time_ns' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('total_time_ns')} style={{ cursor: 'pointer' }}>
                                Total Time {sortField === 'total_time_ns' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('nice')} style={{ cursor: 'pointer' }}>
                                Nice {sortField === 'nice' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('current_priority')} style={{ cursor: 'pointer' }}>
                                Priority {sortField === 'current_priority' && <SortIcon />}
                            </th>
                            <th onClick={() => handleSort('policy')} style={{ cursor: 'pointer' }}>
                                Policy {sortField === 'policy' && <SortIcon />}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {processes.map(proc => (
                            <tr key={proc.pid}>
                                <td><span className="process-pid">{proc.pid}</span></td>
                                <td>{proc.comm}</td>
                                <td><span className="badge badge-primary">Core {proc.cpu}</span></td>
                                <td>{formatTime(proc.user_time_ns)}</td>
                                <td>{formatTime(proc.system_time_ns)}</td>
                                <td>{formatTime(proc.total_time_ns)}</td>
                                <td>{proc.nice}</td>
                                <td>{proc.current_priority} / {proc.base_priority}</td>
                                <td><span className="badge badge-secondary">{proc.policy}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CPUView;
