import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiFile, FiFolder } from 'react-icons/fi';
import './FileDescriptorsView.css';

const FileDescriptorsView = ({ fdtData, searchQuery }) => {
    const [expandedProcesses, setExpandedProcesses] = useState(new Set());

    if (!fdtData) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📁</div>
                <div className="empty-state-title">No Data Available</div>
                <div className="empty-state-description">
                    Select a host and click refresh to view file descriptor data
                </div>
            </div>
        );
    }

    const toggleExpand = (pid) => {
        const newExpanded = new Set(expandedProcesses);
        if (newExpanded.has(pid)) {
            newExpanded.delete(pid);
        } else {
            newExpanded.add(pid);
        }
        setExpandedProcesses(newExpanded);
    };

    const filterProcesses = (processes) => {
        if (!searchQuery) return processes;
        return processes.filter(p =>
            p.pid.toString().includes(searchQuery) ||
            p.comm.toLowerCase().includes(searchQuery.toLowerCase())
        );
    };

    const processes = filterProcesses(fdtData.processes || []);

    // Helper to get file type icon
    const getFileIcon = (path) => {
        if (path.startsWith('/dev/') || path.includes('socket') || path.includes('pipe')) {
            return <FiFolder className="fd-icon special" />;
        }
        return <FiFile className="fd-icon" />;
    };

    // Helper to format path for display
    const formatPath = (path) => {
        if (path.length > 60) {
            return '...' + path.slice(-57);
        }
        return path;
    };

    return (
        <div className="fdt-view">
            <div className="view-header">
                <h2 className="view-title">File Descriptors</h2>
                <div className="view-meta">
                    <span className="process-count">{processes.length} processes</span>
                    <span className="timestamp">Last updated: {new Date(fdtData.timestamp).toLocaleString()}</span>
                </div>
            </div>

            <div className="fdt-container">
                {processes.map(proc => (
                    <div key={proc.pid} className={`fdt-card ${expandedProcesses.has(proc.pid) ? 'expanded' : ''}`}>
                        <div className="fdt-card-header" onClick={() => toggleExpand(proc.pid)}>
                            <div className="fdt-card-left">
                                <button className="expand-btn">
                                    {expandedProcesses.has(proc.pid) ? <FiChevronDown /> : <FiChevronRight />}
                                </button>
                                <div className="process-info">
                                    <span className="process-pid">{proc.pid}</span>
                                    <span className="process-comm">{proc.comm}</span>
                                </div>
                            </div>
                            <div className="fdt-card-right">
                                <span className="fd-count-badge">
                                    <FiFile className="badge-icon" />
                                    {proc.fds?.length || 0}
                                </span>
                            </div>
                        </div>

                        {expandedProcesses.has(proc.pid) && (
                            <div className="fd-table-container">
                                {proc.fds && proc.fds.length > 0 ? (
                                    <table className="fd-table">
                                        <thead>
                                            <tr>
                                                <th className="fd-col-num">FD</th>
                                                <th className="fd-col-path">Path</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {proc.fds.map((fd, idx) => (
                                                <tr key={idx} className="fd-row">
                                                    <td className="fd-num">
                                                        {getFileIcon(fd.path)}
                                                        <span>{fd.fd}</span>
                                                    </td>
                                                    <td className="fd-path" title={fd.path}>
                                                        {formatPath(fd.path)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="no-fds">
                                        <FiFolder className="no-fds-icon" />
                                        <span>No file descriptors</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FileDescriptorsView;
