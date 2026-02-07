import React, { useMemo, useState } from 'react';
import { FiChevronDown, FiChevronRight, FiGitBranch, FiX } from 'react-icons/fi';
import ProcessTreeFlow from '../components/ProcessTreeFlow';
import { api } from '../api/client';
import './ProcessesView.css';

const buildProcessGraphData = (focusProcess) => {
    if (!focusProcess) return [];

    const nodeMap = new Map();
    const ensureNode = (pid, comm) => {
        const key = String(pid);
        if (!nodeMap.has(key)) {
            nodeMap.set(key, {
                pid,
                comm,
                parents: [],
                children: [],
            });
        } else if (comm && !nodeMap.get(key).comm) {
            nodeMap.get(key).comm = comm;
        }
        return nodeMap.get(key);
    };

    const center = ensureNode(focusProcess.pid, focusProcess.comm);
    center.parents = (focusProcess.parents || []).map((parent) => ({
        pid: parent.pid,
        comm: parent.comm,
    }));
    center.children = (focusProcess.children || []).map((child) => ({
        pid: child.pid,
        comm: child.comm,
    }));

    const parentChain = [...(focusProcess.parents || [])].reverse();
    parentChain.forEach((parent, index) => {
        const parentNode = ensureNode(parent.pid, parent.comm);
        const next =
            index === parentChain.length - 1
                ? { pid: focusProcess.pid, comm: focusProcess.comm }
                : parentChain[index + 1];
        parentNode.children = [{ pid: next.pid, comm: next.comm }];
    });

    (focusProcess.children || []).forEach((child) => {
        const childNode = ensureNode(child.pid, child.comm);
        if (!childNode.parents.length) {
            childNode.parents = [{ pid: focusProcess.pid, comm: focusProcess.comm }];
        }
    });

    return [...nodeMap.values()];
};

const ProcessesView = ({ snapshotData, threadsData, searchQuery, hostname }) => {
    const [expandedProcesses, setExpandedProcesses] = useState(new Set());
    const [graphModalOpen, setGraphModalOpen] = useState(false);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphError, setGraphError] = useState(null);
    const [graphProcess, setGraphProcess] = useState(null);
    const [graphSelectedProcess, setGraphSelectedProcess] = useState(null);

    const threadMap = useMemo(() => {
        const map = new Map();
        (threadsData?.processes || []).forEach((proc) => {
            map.set(proc.pid, proc.threads || []);
        });
        return map;
    }, [threadsData]);

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const processes = useMemo(
        () =>
            (snapshotData?.processes || [])
                .filter((proc) => {
                    const threads = threadMap.get(proc.pid) || [];
                    if (!normalizedQuery) return true;
                    if (
                        proc.pid.toString().includes(normalizedQuery) ||
                        (proc.comm || '').toLowerCase().includes(normalizedQuery)
                    ) {
                        return true;
                    }
                    return threads.some((thread) =>
                        String(thread.tid).includes(normalizedQuery) ||
                        (thread.comm || '').toLowerCase().includes(normalizedQuery)
                    );
                })
                .sort((a, b) => {
                    const threadDiff =
                        (threadMap.get(b.pid)?.length || 0) - (threadMap.get(a.pid)?.length || 0);
                    if (threadDiff !== 0) return threadDiff;
                    return a.pid - b.pid;
                }),
        [snapshotData, threadMap, normalizedQuery]
    );

    const graphProcesses = useMemo(
        () => buildProcessGraphData(graphProcess),
        [graphProcess]
    );

    const formattedTimestamp = useMemo(() => {
        if (!snapshotData?.timestamp) return null;
        const parsed = new Date(snapshotData.timestamp);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString();
    }, [snapshotData?.timestamp]);

    const selectedGraphThreads = graphSelectedProcess
        ? (threadMap.get(graphSelectedProcess.pid) || [])
        : [];

    const toggleExpand = (pid) => {
        setExpandedProcesses((prev) => {
            const next = new Set(prev);
            if (next.has(pid)) {
                next.delete(pid);
            } else {
                next.add(pid);
            }
            return next;
        });
    };

    const handleOpenGraph = async (proc) => {
        setGraphModalOpen(true);
        setGraphLoading(true);
        setGraphError(null);
        setGraphProcess(null);
        setGraphSelectedProcess(null);

        try {
            const data = await api.getTree(hostname, proc.pid);
            setGraphProcess(data.process);
            setGraphSelectedProcess(data.process);
        } catch (err) {
            setGraphError(err.message);
        } finally {
            setGraphLoading(false);
        }
    };

    const handleCloseGraph = () => {
        setGraphModalOpen(false);
        setGraphLoading(false);
        setGraphError(null);
        setGraphProcess(null);
        setGraphSelectedProcess(null);
    };

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

    return (
        <div className="processes-view">
            <div className="view-header">
                <h2 className="view-title">Walker Processes</h2>
                <div className="view-controls">
                    <span className="badge badge-primary">{processes.length} processes</span>
                    <span className="timestamp">
                        Last updated: {formattedTimestamp || 'N/A'}
                    </span>
                </div>
            </div>

            <div className="processes-panel">
                <div className="process-list">
                    {processes.length === 0 && (
                        <div className="empty-state compact">
                            <div className="empty-state-icon">🔎</div>
                            <div className="empty-state-title">No matching process</div>
                            <div className="empty-state-description">
                                Try a different PID or command name in search.
                            </div>
                        </div>
                    )}
                    {processes.map((proc) => {
                        const threads = threadMap.get(proc.pid) || [];
                        const isExpanded = expandedProcesses.has(proc.pid);
                        return (
                            <div key={proc.pid} className="process-item">
                                <div className="process-row" onClick={() => toggleExpand(proc.pid)}>
                                    <button type="button" className="expand-btn">
                                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                    </button>
                                    <span className="process-pid">{proc.pid}</span>
                                    <span className="process-comm">{proc.comm}</span>
                                    <span className="badge badge-secondary">{threads.length} threads</span>
                                    <button
                                        type="button"
                                        className="btn btn-secondary process-graph-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenGraph(proc);
                                        }}
                                    >
                                        <FiGitBranch /> View Graph
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="thread-detail">
                                        <div className="relation-title">Threads from walker -t</div>
                                        {threads.length > 0 ? (
                                            <div className="thread-list">
                                                {threads.map((thread, idx) => (
                                                    <div
                                                        key={`${proc.pid}-${thread.tid}-${idx}`}
                                                        className="relation-item"
                                                    >
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

            {graphModalOpen && (
                <div className="modal-overlay" onClick={handleCloseGraph}>
                    <div className="modal process-graph-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                Process Graph {graphProcess ? `(PID ${graphProcess.pid})` : ''}
                            </h2>
                            <button type="button" className="modal-close" onClick={handleCloseGraph}>
                                <FiX />
                            </button>
                        </div>

                        {graphLoading && (
                            <div className="loading">
                                <div className="spinner"></div>
                                <p>Loading process graph...</p>
                            </div>
                        )}

                        {graphError && (
                            <div className="error-state">
                                <strong>Error:</strong> {graphError}
                            </div>
                        )}

                        {!graphLoading && !graphError && graphProcess && (
                            <div className="process-graph-layout">
                                <div className="process-graph-canvas">
                                    <ProcessTreeFlow
                                        processes={graphProcesses}
                                        direction="LR"
                                        edgeType="smoothstep"
                                        onNodeClick={setGraphSelectedProcess}
                                    />
                                </div>
                                <aside className="process-graph-sidebar">
                                    {graphSelectedProcess ? (
                                        <>
                                            <div className="details-label">Selected Node</div>
                                            <div className="details-title">
                                                <span className="process-pid">PID {graphSelectedProcess.pid}</span>
                                                <span className="process-comm">{graphSelectedProcess.comm}</span>
                                            </div>
                                            <div className="details-meta">
                                                <span className="badge badge-secondary">
                                                    {graphSelectedProcess.parents?.length || 0} parents
                                                </span>
                                                <span className="badge badge-secondary">
                                                    {graphSelectedProcess.children?.length || 0} children
                                                </span>
                                                <span className="badge badge-secondary">
                                                    {selectedGraphThreads.length} threads
                                                </span>
                                            </div>
                                            <div className="details-section">
                                                <div className="details-label">Threads from walker -t</div>
                                                {selectedGraphThreads.length > 0 ? (
                                                    <div className="thread-list">
                                                        {selectedGraphThreads.map((thread, idx) => (
                                                            <div
                                                                key={`${graphSelectedProcess.pid}-${thread.tid}-${idx}`}
                                                                className="thread-row"
                                                            >
                                                                <span className="thread-tid">TID {thread.tid}</span>
                                                                <span className="thread-comm">{thread.comm}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="thread-empty">No threads for this PID.</div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="thread-empty">
                                            Click a node in the graph to see details.
                                        </div>
                                    )}
                                </aside>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcessesView;
