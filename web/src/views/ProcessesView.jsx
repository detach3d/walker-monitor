import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiGitBranch } from 'react-icons/fi';
import ProcessTreeModal from '../components/ProcessTreeModal';
import './ProcessesView.css';

const ProcessesView = ({ snapshotData, psData, searchQuery }) => {
    const [expandedProcesses, setExpandedProcesses] = useState(new Set());
    const [showDiff, setShowDiff] = useState(false);
    const [selectedProcess, setSelectedProcess] = useState(null);

    if (!snapshotData || !psData) {
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

    // Create a map of PID -> threads from psData (which uses walker -t)
    const threadMap = new Map();
    (psData.processes || []).forEach(proc => {
        threadMap.set(proc.pid, proc.threads || []);
    });

    // Merge thread data into snapshot processes for the Walker Snapshot column
    const snapshotProcessesWithThreads = (snapshotData.processes || []).map(proc => ({
        ...proc,
        threads: threadMap.get(proc.pid) || []
    }));

    const snapshotProcesses = filterProcesses(snapshotProcessesWithThreads);
    const psProcesses = filterProcesses(psData.processes || []);

    const snapshotPIDs = new Set(snapshotProcesses.map(p => p.pid));
    const psPIDs = new Set(psProcesses.map(p => p.pid));

    const displaySnapshot = showDiff
        ? snapshotProcesses.filter(p => !psPIDs.has(p.pid))
        : snapshotProcesses;

    const displayPS = showDiff
        ? psProcesses.filter(p => !snapshotPIDs.has(p.pid))
        : psProcesses;

    return (
        <div className="processes-view">
            <div className="view-header">
                <h2 className="view-title">Process Comparison</h2>
                <div className="view-controls">
                    <label className="diff-toggle">
                        <input
                            type="checkbox"
                            checked={showDiff}
                            onChange={(e) => setShowDiff(e.target.checked)}
                        />
                        <span>Show differences only</span>
                    </label>
                    <span className="timestamp">Last updated: {new Date(snapshotData.timestamp).toLocaleString()}</span>
                </div>
            </div>

            <div className="comparison-grid">
                <div className="comparison-column">
                    <div className="column-header">
                        <h3>Walker Snapshot</h3>
                        <span className="badge badge-primary">{displaySnapshot.length} processes</span>
                    </div>
                    <div className="process-list">
                        {displaySnapshot.map(proc => (
                            <div key={proc.pid} className="process-item">
                                <div className="process-row" onClick={() => toggleExpand(proc.pid)}>
                                    <button className="expand-btn">
                                        {expandedProcesses.has(proc.pid) ? <FiChevronDown /> : <FiChevronRight />}
                                    </button>
                                    <span className="process-pid">{proc.pid}</span>
                                    <span className="process-comm">{proc.comm}</span>
                                    <span className="badge badge-secondary">{proc.threads?.length || 0} threads</span>
                                    <button
                                        className="btn-icon btn-tree"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProcess(proc);
                                        }}
                                        title="Show process tree"
                                    >
                                        <FiGitBranch />
                                    </button>
                                </div>
                                {expandedProcesses.has(proc.pid) && proc.threads && proc.threads.length > 0 && (
                                    <div className="thread-list">
                                        {proc.threads.map(thread => (
                                            <div key={thread.tid} className="thread-item">
                                                <span className="thread-tid">TID: {thread.tid}</span>
                                                <span className="thread-comm">{thread.comm}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {expandedProcesses.has(proc.pid) && (!proc.threads || proc.threads.length === 0) && (
                                    <div className="thread-list">
                                        <div className="thread-item empty">No threads found</div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="comparison-column">
                    <div className="column-header">
                        <h3>PS Output</h3>
                        <span className="badge badge-primary">{displayPS.length} processes</span>
                    </div>
                    <div className="process-list">
                        {displayPS.map(proc => (
                            <div key={proc.pid} className="process-item">
                                <div className="process-row" onClick={() => toggleExpand(`ps-${proc.pid}`)}>
                                    <button className="expand-btn">
                                        {expandedProcesses.has(`ps-${proc.pid}`) ? <FiChevronDown /> : <FiChevronRight />}
                                    </button>
                                    <span className="process-pid">{proc.pid}</span>
                                    <span className="process-comm">{proc.comm}</span>
                                    <span className="badge badge-secondary">{proc.threads?.length || 0} threads</span>
                                </div>
                                {expandedProcesses.has(`ps-${proc.pid}`) && proc.threads && proc.threads.length > 0 && (
                                    <div className="thread-list">
                                        {proc.threads.map(thread => (
                                            <div key={thread.tid} className="thread-item">
                                                <span className="thread-tid">TID: {thread.tid}</span>
                                                <span className="thread-comm">{thread.comm}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {expandedProcesses.has(`ps-${proc.pid}`) && (!proc.threads || proc.threads.length === 0) && (
                                    <div className="thread-list">
                                        <div className="thread-item empty">No threads found</div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {selectedProcess && (
                <ProcessTreeModal
                    process={selectedProcess}
                    allProcesses={snapshotData.processes}
                    onClose={() => setSelectedProcess(null)}
                />
            )}
        </div>
    );
};

export default ProcessesView;
