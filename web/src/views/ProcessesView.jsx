import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiGitBranch } from 'react-icons/fi';
import ProcessTreeModal from '../components/ProcessTreeModal';
import { api } from '../api/client';
import './ProcessesView.css';

const ProcessesView = ({ snapshotData, threadsData, searchQuery, hostname }) => {
    const [expandedProcesses, setExpandedProcesses] = useState(new Set());
    const [selectedProcess, setSelectedProcess] = useState(null);
    const [treeData, setTreeData] = useState(null);
    const [treeLoading, setTreeLoading] = useState(false);
    const [treeError, setTreeError] = useState(null);

    if (!snapshotData) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">No Data Available</div>
                <div className="empty-state-description">
                    Select a host and click refresh to view process data
                </div>
            </div>
        );
    }

    const toggleExpand = (pid) => {
        const next = new Set(expandedProcesses);
        if (next.has(pid)) {
            next.delete(pid);
        } else {
            next.add(pid);
        }
        setExpandedProcesses(next);
    };

    const threadMap = new Map();
    (threadsData?.processes || []).forEach((proc) => {
        threadMap.set(proc.pid, proc.threads || []);
    });

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const processes = (snapshotData.processes || [])
        .filter((proc) => {
            const threads = threadMap.get(proc.pid) || [];
            if (!normalizedQuery) return true;
            if (
                proc.pid.toString().includes(normalizedQuery) ||
                proc.comm.toLowerCase().includes(normalizedQuery)
            ) {
                return true;
            }
            return threads.some((thread) =>
                String(thread.tid).includes(normalizedQuery) ||
                (thread.comm || '').toLowerCase().includes(normalizedQuery)
            );
        })
        .sort((a, b) => {
            const threadDiff = (threadMap.get(b.pid)?.length || 0) - (threadMap.get(a.pid)?.length || 0);
            if (threadDiff !== 0) return threadDiff;
            return a.pid - b.pid;
        });

    const handleShowTree = async (proc) => {
        setSelectedProcess(proc);
        setTreeData(null);
        setTreeError(null);
        setTreeLoading(true);

        try {
            const data = await api.getTree(hostname, proc.pid);
            setTreeData(data.process);
        } catch (err) {
            setTreeError(err.message);
        } finally {
            setTreeLoading(false);
        }
    };

    const handleCloseTree = () => {
        setSelectedProcess(null);
        setTreeData(null);
        setTreeError(null);
    };

    return (
        <div className="processes-view">
            <div className="view-header">
                <h2 className="view-title">Walker Process Tree</h2>
                <div className="view-controls">
                    <span className="badge badge-primary">{processes.length} processes</span>
                    <span className="timestamp">Last updated: {new Date(snapshotData.timestamp).toLocaleString()}</span>
                </div>
            </div>

            <div className="processes-panel">
                <div className="process-list">
                    {processes.map((proc) => {
                        const threads = threadMap.get(proc.pid) || [];
                        const threadCount = threads.length;
                        const isExpanded = expandedProcesses.has(proc.pid);

                        return (
                            <div key={proc.pid} className="process-item">
                                <div className="process-row" onClick={() => toggleExpand(proc.pid)}>
                                    <button className="expand-btn">
                                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                    </button>
                                    <span className="process-pid">{proc.pid}</span>
                                    <span className="process-comm">{proc.comm}</span>
                                    <span className="badge badge-secondary">{threadCount} threads</span>
                                    <button
                                        className="btn-icon btn-tree"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleShowTree(proc);
                                        }}
                                        title="Open process tree modal"
                                    >
                                        <FiGitBranch />
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="thread-detail">
                                        <div className="relation-title">Threads from walker -t</div>
                                        {threadCount > 0 ? (
                                            <div className="thread-list">
                                                {threads.map((thread, idx) => (
                                                    <div key={`${proc.pid}-${thread.tid}-${idx}`} className="relation-item">
                                                        <span className="thread-tid">TID {thread.tid}</span>
                                                        <span className="thread-comm">{thread.comm}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="thread-item empty">No threads found</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedProcess && (
                <ProcessTreeModal
                    process={treeData || selectedProcess}
                    loading={treeLoading}
                    error={treeError}
                    onClose={handleCloseTree}
                />
            )}
        </div>
    );
};

export default ProcessesView;
