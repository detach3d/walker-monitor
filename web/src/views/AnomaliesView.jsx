import React, { useState } from 'react';
import {
    FiAlertTriangle,
    FiChevronDown,
    FiChevronRight,
    FiShield,
    FiCheckCircle
} from 'react-icons/fi';
import './AnomaliesView.css';

const FLAG_META = {
    deleted:          { label: 'Deleted Binary',      severity: 'critical', description: 'Executable was unlinked from disk while still running' },
    suspicious_path:  { label: 'Suspicious Path',     severity: 'high',     description: 'Executable loaded from /tmp, /dev/shm, or memfd' },
    kthread_imposter: { label: 'Kernel Imposter',     severity: 'critical', description: 'Process name mimics a kernel thread but has a userspace binary' },
    non_default_ns:   { label: 'Non-Default NS',      severity: 'medium',   description: 'Process is running in a non-default namespace (container or sandbox)' },
    privesc:          { label: 'Privilege Escalation', severity: 'critical', description: 'Process running as root was spawned by a non-root parent' },
    suspicious_vma:   { label: 'Suspicious VMA',      severity: 'critical', description: 'Writable + executable memory region detected (potential shellcode injection)' },
    recently_started: { label: 'Recently Started',    severity: 'low',      description: 'Process started within the last 5 minutes' },
    kernel_thread:    { label: 'Kernel Thread',       severity: 'info',     description: 'No executable path (expected for real kernel threads)' },
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const formatStartTime = (epochSec) => {
    if (!epochSec) return null;
    const d = new Date(epochSec * 1000);
    return d.toLocaleString();
};

const formatAge = (epochSec) => {
    if (!epochSec) return null;
    const ageSec = Math.floor(Date.now() / 1000 - epochSec);
    if (ageSec < 60) return `${ageSec}s ago`;
    if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
    if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
    return `${Math.floor(ageSec / 86400)}d ago`;
};

const formatVmaSize = (kb) => {
    if (kb < 1024) return `${kb} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
};

const VmaSection = ({ vmas }) => {
    const [showVmas, setShowVmas] = useState(false);
    if (!vmas || vmas.length === 0) return null;

    const execVmas = vmas.filter(v => v.perms.includes('x'));
    const wxVmas = vmas.filter(v => v.perms.includes('w') && v.perms.includes('x'));
    const totalSize = vmas.reduce((s, v) => s + (v.size_kb || 0), 0);

    return (
        <div className="vma-info">
            <button
                type="button"
                className="vma-toggle"
                onClick={(e) => { e.stopPropagation(); setShowVmas(!showVmas); }}
            >
                {showVmas ? <FiChevronDown /> : <FiChevronRight />}
                VMA Regions ({vmas.length})
                <span className="vma-summary-stats">
                    {formatVmaSize(totalSize)} total
                    {execVmas.length > 0 && <span className="vma-stat-exec">{execVmas.length} exec</span>}
                    {wxVmas.length > 0 && <span className="vma-stat-wx">{wxVmas.length} W+X</span>}
                </span>
            </button>
            {showVmas && (
                <div className="vma-table-wrapper">
                    <table className="vma-table">
                        <thead>
                            <tr>
                                <th>Address Range</th>
                                <th>Perms</th>
                                <th>Type</th>
                                <th>Size</th>
                                <th>File</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vmas.map((vma, idx) => {
                                const isWx = vma.perms.includes('w') && vma.perms.includes('x');
                                return (
                                    <tr key={idx} className={isWx ? 'vma-row-wx' : ''}>
                                        <td className="vma-addr">{vma.start}-{vma.end}</td>
                                        <td><span className={`vma-perms ${isWx ? 'wx' : ''}`}>{vma.perms}</span></td>
                                        <td>{vma.mapping}</td>
                                        <td>{formatVmaSize(vma.size_kb)}</td>
                                        <td className="vma-file">{vma.file || <span className="vma-anon">[anon]</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const AnomaliesView = ({ anomaliesData, searchQuery }) => {
    const [expandedPids, setExpandedPids] = useState(new Set());
    const [showClean, setShowClean] = useState(false);

    if (!anomaliesData) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon"><FiShield /></div>
                <div className="empty-state-title">No Data Available</div>
                <div className="empty-state-description">
                    Select a host and click refresh to scan for anomalies
                </div>
            </div>
        );
    }

    const allProcesses = anomaliesData.processes || [];

    const flaggedProcesses = allProcesses.filter(p =>
        p.flags && p.flags.length > 0 && !p.flags.every(f => f === 'kernel_thread')
    );

    const cleanProcesses = allProcesses.filter(p =>
        !p.flags || p.flags.length === 0 || p.flags.every(f => f === 'kernel_thread')
    );

    const worstSeverity = (flags) => {
        let worst = 99;
        for (const f of flags) {
            const meta = FLAG_META[f];
            if (meta) {
                const rank = SEVERITY_ORDER[meta.severity] ?? 99;
                if (rank < worst) worst = rank;
            }
        }
        return worst;
    };

    const sortedFlagged = [...flaggedProcesses].sort((a, b) =>
        worstSeverity(a.flags) - worstSeverity(b.flags) || a.pid - b.pid
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filterProc = (proc) => {
        if (!normalizedQuery) return true;
        return (
            proc.pid.toString().includes(normalizedQuery) ||
            proc.comm.toLowerCase().includes(normalizedQuery) ||
            (proc.flags || []).some(f => f.toLowerCase().includes(normalizedQuery)) ||
            (proc.threads || []).some(t =>
                (t.exe_path || '').toLowerCase().includes(normalizedQuery) ||
                t.comm.toLowerCase().includes(normalizedQuery)
            )
        );
    };

    const filteredFlagged = sortedFlagged.filter(filterProc);
    const filteredClean = cleanProcesses.filter(filterProc);

    const criticalCount = flaggedProcesses.filter(p => p.flags.includes('deleted') || p.flags.includes('kthread_imposter') || p.flags.includes('privesc') || p.flags.includes('suspicious_vma')).length;
    const suspiciousCount = flaggedProcesses.filter(p => p.flags.includes('suspicious_path')).length;

    const toggleExpand = (pid) => {
        const next = new Set(expandedPids);
        if (next.has(pid)) next.delete(pid);
        else next.add(pid);
        setExpandedPids(next);
    };

    return (
        <div className="anomalies-view">
            <div className="view-header">
                <h2 className="view-title">Anomalies</h2>
                <span className="timestamp">Last updated: {new Date(anomaliesData.timestamp).toLocaleString()}</span>
            </div>

            <div className="anomalies-summary">
                <div className={`summary-card ${criticalCount > 0 ? 'severity-critical' : ''}`}>
                    <span className="summary-label">Critical</span>
                    <span className="summary-value">{criticalCount}</span>
                    <span className="summary-hint">deleted / imposter / privesc</span>
                </div>
                <div className={`summary-card ${suspiciousCount > 0 ? 'severity-high' : ''}`}>
                    <span className="summary-label">Suspicious</span>
                    <span className="summary-value">{suspiciousCount}</span>
                    <span className="summary-hint">unusual exe paths</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Total Scanned</span>
                    <span className="summary-value">{allProcesses.length}</span>
                    <span className="summary-hint">processes + threads</span>
                </div>
                <div className="summary-card severity-ok">
                    <span className="summary-label">Clean</span>
                    <span className="summary-value">{cleanProcesses.length}</span>
                    <span className="summary-hint">no anomalies detected</span>
                </div>
            </div>

            {filteredFlagged.length === 0 && !showClean && (
                <div className="all-clear">
                    <FiCheckCircle className="all-clear-icon" />
                    <div className="all-clear-title">No anomalies detected</div>
                    <div className="all-clear-description">
                        All {allProcesses.length} processes have valid executable paths.
                    </div>
                </div>
            )}

            {filteredFlagged.length > 0 && (
                <div className="anomalies-section">
                    <h3 className="section-title">
                        <FiAlertTriangle /> Flagged Processes ({filteredFlagged.length})
                    </h3>
                    <div className="anomalies-list">
                        {filteredFlagged.map((proc) => {
                            const isExpanded = expandedPids.has(proc.pid);
                            const flags = proc.flags || [];

                            return (
                                <div key={proc.pid} className={`anomaly-card ${isExpanded ? 'expanded' : ''}`}>
                                    <button
                                        type="button"
                                        className="anomaly-summary"
                                        onClick={() => toggleExpand(proc.pid)}
                                    >
                                        <div className="anomaly-main">
                                            <span className="process-pid">{proc.pid}</span>
                                            <span className="process-comm">{proc.comm}</span>
                                            <div className="flag-badges">
                                                {flags.filter(f => f !== 'kernel_thread').map(f => {
                                                    const meta = FLAG_META[f] || { label: f, severity: 'medium' };
                                                    return (
                                                        <span key={f} className={`flag-badge severity-${meta.severity}`} title={meta.description}>
                                                            {meta.label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="anomaly-chevron">
                                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="anomaly-details">
                                            <table className="thread-table">
                                                <thead>
                                                    <tr>
                                                        <th>TID</th>
                                                        <th>Command</th>
                                                        <th>Executable Path</th>
                                                        <th>Flags</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(proc.threads || []).map((thread, idx) => (
                                                        <tr key={`${proc.pid}-${thread.tid}-${idx}`}>
                                                            <td className="tid-cell">{thread.tid}</td>
                                                            <td>{thread.comm}</td>
                                                            <td className="exe-path-cell">
                                                                {thread.exe_path ? (
                                                                    <span className={`exe-path ${(thread.flags || []).length > 0 ? 'flagged' : ''}`}>
                                                                        {thread.exe_path}
                                                                    </span>
                                                                ) : (
                                                                    <span className="no-exe">no executable (kernel thread)</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                {(thread.flags || []).map(f => {
                                                                    const meta = FLAG_META[f] || { label: f, severity: 'medium' };
                                                                    return (
                                                                        <span key={f} className={`flag-badge small severity-${meta.severity}`}>
                                                                            {meta.label}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {proc.namespaces && Object.keys(proc.namespaces).length > 0 && (
                                                <div className="namespace-info">
                                                    <div className="namespace-title">Namespace Info</div>
                                                    <div className="namespace-grid">
                                                        {Object.entries(proc.namespaces).map(([ns, inum]) => (
                                                            <div key={ns} className="namespace-item">
                                                                <span className="ns-name">{ns}</span>
                                                                <span className="ns-value">{inum}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {proc.privesc && (
                                                <div className="privesc-info">
                                                    <div className="privesc-title">Privilege Escalation Detected</div>
                                                    <div className="privesc-grid">
                                                        <div className="privesc-item parent">
                                                            <span className="privesc-label">Parent</span>
                                                            <span className="privesc-detail">
                                                                PID {proc.privesc.parent_pid} ({proc.privesc.parent_comm}) — UID {proc.privesc.parent_uid}
                                                            </span>
                                                        </div>
                                                        <div className="privesc-arrow">→</div>
                                                        <div className="privesc-item current">
                                                            <span className="privesc-label">Current</span>
                                                            <span className="privesc-detail">
                                                                PID {proc.pid} ({proc.comm}) — UID {proc.privesc.current_uid}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className={`privesc-ns-check ${proc.privesc.same_user_ns === false ? 'foreign-ns' : ''}`}>
                                                        Same user namespace as init: {proc.privesc.same_user_ns ? 'Yes' : 'No'}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="process-extra-info">
                                                {proc.start_realtime && (
                                                    <div className="extra-info-item">
                                                        <span className="extra-label">Start Time</span>
                                                        <span className="extra-value">
                                                            {formatStartTime(proc.start_realtime)}
                                                            <span className="extra-age">{formatAge(proc.start_realtime)}</span>
                                                        </span>
                                                    </div>
                                                )}
                                                {proc.cmdline && (
                                                    <div className="extra-info-item">
                                                        <span className="extra-label">Command Line</span>
                                                        <span className="extra-value cmdline">{proc.cmdline}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <VmaSection vmas={proc.vmas} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="clean-toggle">
                <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => setShowClean(!showClean)}
                >
                    {showClean ? <FiChevronDown /> : <FiChevronRight />}
                    {showClean ? 'Hide' : 'Show'} clean processes ({filteredClean.length})
                </button>
            </div>

            {showClean && (
                <div className="anomalies-section clean-section">
                    <div className="anomalies-list">
                        {filteredClean.map((proc) => {
                            const isExpanded = expandedPids.has(proc.pid);
                            return (
                                <div key={proc.pid} className={`anomaly-card clean ${isExpanded ? 'expanded' : ''}`}>
                                    <button
                                        type="button"
                                        className="anomaly-summary"
                                        onClick={() => toggleExpand(proc.pid)}
                                    >
                                        <div className="anomaly-main">
                                            <span className="process-pid">{proc.pid}</span>
                                            <span className="process-comm">{proc.comm}</span>
                                            {proc.flags && proc.flags.includes('kernel_thread') && (
                                                <span className="flag-badge severity-info">Kernel Thread</span>
                                            )}
                                        </div>
                                        <div className="anomaly-chevron">
                                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="anomaly-details">
                                            <table className="thread-table">
                                                <thead>
                                                    <tr>
                                                        <th>TID</th>
                                                        <th>Command</th>
                                                        <th>Executable Path</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(proc.threads || []).map((thread, idx) => (
                                                        <tr key={`${proc.pid}-${thread.tid}-${idx}`}>
                                                            <td className="tid-cell">{thread.tid}</td>
                                                            <td>{thread.comm}</td>
                                                            <td className="exe-path-cell">
                                                                {thread.exe_path ? (
                                                                    <span className="exe-path">{thread.exe_path}</span>
                                                                ) : (
                                                                    <span className="no-exe">no executable</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {proc.namespaces && Object.keys(proc.namespaces).length > 0 && (
                                                <div className="namespace-info">
                                                    <div className="namespace-title">Namespace Info</div>
                                                    <div className="namespace-grid">
                                                        {Object.entries(proc.namespaces).map(([ns, inum]) => (
                                                            <div key={ns} className="namespace-item">
                                                                <span className="ns-name">{ns}</span>
                                                                <span className="ns-value">{inum}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="process-extra-info">
                                                {proc.start_realtime && (
                                                    <div className="extra-info-item">
                                                        <span className="extra-label">Start Time</span>
                                                        <span className="extra-value">
                                                            {formatStartTime(proc.start_realtime)}
                                                            <span className="extra-age">{formatAge(proc.start_realtime)}</span>
                                                        </span>
                                                    </div>
                                                )}
                                                {proc.cmdline && (
                                                    <div className="extra-info-item">
                                                        <span className="extra-label">Command Line</span>
                                                        <span className="extra-value cmdline">{proc.cmdline}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <VmaSection vmas={proc.vmas} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnomaliesView;
