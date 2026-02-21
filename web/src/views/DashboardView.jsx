import React from 'react';
import {
    FiActivity,
    FiAlertTriangle,
    FiCpu,
    FiDatabase,
    FiHardDrive,
    FiServer,
    FiShield,
    FiRefreshCw
} from 'react-icons/fi';
import './DashboardView.css';

const formatNumber = (value = 0) => Number(value || 0).toLocaleString('en-US');

const formatTime = (ns = 0) => {
    const ms = ns / 1000;
    if (ms < 1000) return `${ms.toFixed(0)} us`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(2)} s`;
    const min = sec / 60;
    return `${min.toFixed(2)} min`;
};

const formatKB = (kb) => {
    if (!kb) return '0 KB';
    if (kb < 1024) return `${kb} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
};

const EmptyState = ({ onRefresh }) => (
    <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="empty-state-title">No telemetry yet</div>
        <div className="empty-state-description">
            Select a host and hit refresh to populate the dashboard.
        </div>
        <button className="btn btn-primary" onClick={onRefresh}>
            <FiRefreshCw /> Refresh data
        </button>
    </div>
);

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const FLAG_META = {
    deleted: { label: 'Deleted Binary', severity: 'critical' },
    kthread_imposter: { label: 'Kthread Imposter', severity: 'critical' },
    privesc: { label: 'Privilege Escalation', severity: 'critical' },
    suspicious_vma: { label: 'Suspicious VMA', severity: 'critical' },
    suspicious_path: { label: 'Suspicious Path', severity: 'high' },
    non_default_ns: { label: 'Non-default NS', severity: 'medium' },
    recently_started: { label: 'Recently Started', severity: 'low' },
    kernel_thread: { label: 'Kernel Thread', severity: 'info' },
};

const DashboardView = ({
    hosts = [],
    snapshotData,
    psData,
    fdtData,
    cpuData,
    memoryData,
    anomaliesData,
    selectedHost,
    loading,
    onRefresh
}) => {
    const hostMeta = hosts.find((h) => h.name === selectedHost) || {};
    const snapshotProcesses = snapshotData?.processes || [];
    const psProcesses = psData?.processes || [];
    const fdtProcesses = fdtData?.processes || [];
    const cpuProcesses = cpuData?.processes || [];
    const memProcesses = memoryData?.processes || [];
    const anomProcesses = anomaliesData?.processes || [];

    const uniquePIDs = new Set([
        ...snapshotProcesses.map((p) => p.pid),
        ...psProcesses.map((p) => p.pid)
    ]);

    const threadsTotal = snapshotProcesses.reduce(
        (sum, p) => sum + (p.threads?.length || 0),
        0
    ) || psProcesses.reduce((sum, p) => sum + (p.threads?.length || 0), 0);

    const fdTotal = fdtProcesses.reduce(
        (sum, p) => sum + (p.fds?.length || 0),
        0
    );

    // Anomalies breakdown - only count real anomalies (not info/low flags like kernel_thread, recently_started)
    const ALERT_SEVERITIES = new Set(['critical', 'high', 'medium']);
    const flaggedProcesses = anomProcesses.filter(p =>
        p.flags && p.flags.some(f => ALERT_SEVERITIES.has(FLAG_META[f]?.severity))
    );
    const cleanProcesses = anomProcesses.length - flaggedProcesses.length;
    const criticalCount = anomProcesses.filter(p =>
        p.flags?.some(f => FLAG_META[f]?.severity === 'critical')
    ).length;
    const highCount = anomProcesses.filter(p =>
        p.flags?.some(f => FLAG_META[f]?.severity === 'high') &&
        !p.flags?.some(f => FLAG_META[f]?.severity === 'critical')
    ).length;

    // Flag frequency
    const flagCounts = {};
    flaggedProcesses.forEach(p => {
        (p.flags || []).forEach(f => {
            flagCounts[f] = (flagCounts[f] || 0) + 1;
        });
    });
    const flagEntries = Object.entries(flagCounts)
        .sort(([a], [b]) => (SEVERITY_ORDER[FLAG_META[a]?.severity] ?? 9) - (SEVERITY_ORDER[FLAG_META[b]?.severity] ?? 9));

    // Memory top consumers
    const topMem = [...memProcesses]
        .sort((a, b) => (b.resident_kb || 0) - (a.resident_kb || 0))
        .slice(0, 6);
    const memMax = Math.max(...topMem.map(p => p.resident_kb || 0), 1);
    const totalResident = memProcesses.reduce((s, p) => s + (p.resident_kb || 0), 0);

    const coreDistribution = cpuProcesses.reduce((acc, proc) => {
        const core = proc.cpu ?? 'N/A';
        acc[core] = (acc[core] || 0) + 1;
        return acc;
    }, {});
    const coreEntries = Object.entries(coreDistribution).sort(([a], [b]) => {
        const numA = Number(a);
        const numB = Number(b);
        const safeA = Number.isNaN(numA) ? Number.MAX_SAFE_INTEGER : numA;
        const safeB = Number.isNaN(numB) ? Number.MAX_SAFE_INTEGER : numB;
        return safeA - safeB;
    });

    const topCpu = [...cpuProcesses]
        .sort((a, b) => (b.total_time_ns || 0) - (a.total_time_ns || 0))
        .slice(0, 6);
    const cpuMax = Math.max(...topCpu.map((p) => p.total_time_ns || 0), 1);

    const topFd = [...fdtProcesses]
        .sort((a, b) => (b.fds?.length || 0) - (a.fds?.length || 0))
        .slice(0, 6);
    const fdMax = Math.max(...topFd.map((p) => (p.fds?.length || 0)), 1);

    const lastUpdated =
        snapshotData?.timestamp ||
        psData?.timestamp ||
        fdtData?.timestamp ||
        cpuData?.timestamp;

    const hasData =
        snapshotProcesses.length ||
        psProcesses.length ||
        fdtProcesses.length ||
        cpuProcesses.length ||
        memProcesses.length ||
        anomProcesses.length;

    if (!selectedHost) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🛰️</div>
                <div className="empty-state-title">Pick a host to begin</div>
                <div className="empty-state-description">
                    Choose a registered host from the selector to light up the dashboard.
                </div>
            </div>
        );
    }

    if (!hasData) {
        return <EmptyState onRefresh={onRefresh} />;
    }

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div className="eyebrow">Overview</div>
                <div className="header-row">
                    <div>
                        <h2>Operations Pulse</h2>
                        <p className="lede">
                            Process forensics, anomaly detection, memory, CPU, and file handles
                            merged into a single high-signal console.
                        </p>
                        <div className="meta-row">
                            <span className={`pill status-${hostMeta.status || 'offline'}`}>
                                <span className="pill-dot" /> {hostMeta.status || 'offline'}
                            </span>
                            <span className="pill">
                                {formatNumber(uniquePIDs.size)} processes observed
                            </span>
                            {criticalCount > 0 && (
                                <span className="pill pill-critical">
                                    <FiAlertTriangle /> {criticalCount} critical
                                </span>
                            )}
                            {lastUpdated && (
                                <span className="pill subtle">
                                    Last data · {new Date(lastUpdated).toLocaleString()}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        <FiRefreshCw /> {loading ? 'Syncing...' : 'Sync data'}
                    </button>
                </div>
            </div>

            {/* Security Summary - top priority */}
            {anomProcesses.length > 0 && (
                <div className="security-strip">
                    <div className="security-card">
                        <div className="security-icon critical">
                            <FiAlertTriangle />
                        </div>
                        <div className="security-body">
                            <span className="security-label">Critical</span>
                            <span className="security-count">{criticalCount}</span>
                        </div>
                    </div>
                    <div className="security-card">
                        <div className="security-icon high">
                            <FiShield />
                        </div>
                        <div className="security-body">
                            <span className="security-label">High</span>
                            <span className="security-count">{highCount}</span>
                        </div>
                    </div>
                    <div className="security-card">
                        <div className="security-icon flagged">
                            <FiActivity />
                        </div>
                        <div className="security-body">
                            <span className="security-label">Flagged</span>
                            <span className="security-count">{flaggedProcesses.length}</span>
                        </div>
                    </div>
                    <div className="security-card">
                        <div className="security-icon clean">
                            <FiShield />
                        </div>
                        <div className="security-body">
                            <span className="security-label">Clean</span>
                            <span className="security-count">{cleanProcesses}</span>
                        </div>
                    </div>
                    <div className="security-card">
                        <div className="security-icon total">
                            <FiServer />
                        </div>
                        <div className="security-body">
                            <span className="security-label">Scanned</span>
                            <span className="security-count">{anomProcesses.length}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Metric cards */}
            <div className="metric-grid">
                <div className="metric-card primary">
                    <div className="metric-icon">
                        <FiActivity />
                    </div>
                    <div className="metric-body">
                        <p className="metric-label">Processes</p>
                        <div className="metric-value">
                            {formatNumber(uniquePIDs.size)}
                            <span className="metric-sub">
                                {formatNumber(threadsTotal)} threads
                            </span>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon accent">
                        <FiDatabase />
                    </div>
                    <div className="metric-body">
                        <p className="metric-label">Total Resident Memory</p>
                        <div className="metric-value">
                            {formatKB(totalResident)}
                            <span className="metric-sub">
                                {formatNumber(memProcesses.length)} processes
                            </span>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon accent">
                        <FiHardDrive />
                    </div>
                    <div className="metric-body">
                        <p className="metric-label">Open file handles</p>
                        <div className="metric-value">
                            {formatNumber(fdTotal)}
                            <span className="metric-sub">
                                {formatNumber(fdtProcesses.length)} processes reporting
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Anomalies + Memory panels - security first */}
            <div className="panel-grid">
                <section className="panel list-panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">Anomaly detection</p>
                            <h3>Flag Breakdown</h3>
                        </div>
                        <span className={`delta-badge ${criticalCount > 0 ? 'negative' : 'neutral'}`}>
                            {flaggedProcesses.length} flagged
                        </span>
                    </div>
                    {flagEntries.length === 0 ? (
                        <div className="muted">No anomalies detected. All clear.</div>
                    ) : (
                        <ul className="entity-list">
                            {flagEntries.map(([flag, count]) => {
                                const meta = FLAG_META[flag] || { label: flag, severity: 'info' };
                                return (
                                    <li key={flag} className="entity-row">
                                        <div className="entity-main">
                                            <span className={`entity-pill severity-${meta.severity}`}>
                                                {meta.label}
                                            </span>
                                        </div>
                                        <div className="entity-meta">
                                            <span className="entity-sub">{count} process{count !== 1 ? 'es' : ''}</span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="panel list-panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">Memory pressure</p>
                            <h3>Top Memory Consumers</h3>
                        </div>
                    </div>
                    {topMem.length === 0 ? (
                        <div className="muted">No memory data available.</div>
                    ) : (
                        <ul className="entity-list">
                            {topMem.map((proc) => {
                                const pct = Math.round(((proc.resident_kb || 0) / memMax) * 100);
                                return (
                                    <li key={proc.pid} className="entity-row">
                                        <div className="entity-main">
                                            <span className="entity-pill">PID {proc.pid}</span>
                                            <span className="entity-name">{proc.comm}</span>
                                        </div>
                                        <div className="entity-meta">
                                            <span className="entity-sub">
                                                {formatKB(proc.resident_kb)}
                                            </span>
                                            <div className="progress skinny">
                                                <div
                                                    className="progress-value"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

            {/* CPU distribution */}
            <section className="panel">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Scheduling surface</p>
                        <h3>CPU core distribution</h3>
                    </div>
                </div>
                <div className="core-grid">
                    {coreEntries.length === 0 && (
                        <div className="muted">No CPU data available.</div>
                    )}
                    {coreEntries.map(([core, count]) => {
                        const pct = Math.round(
                            (count / Math.max(...Object.values(coreDistribution))) * 100
                        );
                        return (
                            <div key={core} className="core-card">
                                <div className="core-top">
                                    <span className="core-label">Core {core}</span>
                                    <span className="core-count">{count}</span>
                                </div>
                                <div className="progress">
                                    <div
                                        className="progress-value"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* CPU + FD panels */}
            <div className="panel-grid">
                <section className="panel list-panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">CPU heavy hitters</p>
                            <h3>Top processes by runtime</h3>
                        </div>
                    </div>
                    {topCpu.length === 0 ? (
                        <div className="muted">No CPU data available.</div>
                    ) : (
                        <ul className="entity-list">
                            {topCpu.map((proc) => {
                                const pct = Math.round(
                                    ((proc.total_time_ns || 0) / cpuMax) * 100
                                );
                                return (
                                    <li key={proc.pid} className="entity-row">
                                        <div className="entity-main">
                                            <span className="entity-pill">PID {proc.pid}</span>
                                            <span className="entity-name">{proc.comm}</span>
                                        </div>
                                        <div className="entity-meta">
                                            <span className="entity-sub">
                                                {formatTime(proc.total_time_ns)}
                                            </span>
                                            <div className="progress skinny">
                                                <div
                                                    className="progress-value alt"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="panel list-panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">Noisy file handles</p>
                            <h3>Top FD consumers</h3>
                        </div>
                    </div>
                    {topFd.length === 0 ? (
                        <div className="muted">No file descriptor data available.</div>
                    ) : (
                        <ul className="entity-list">
                            {topFd.map((proc) => {
                                const count = proc.fds?.length || 0;
                                const pct = Math.round((count / fdMax) * 100);
                                return (
                                    <li key={proc.pid} className="entity-row">
                                        <div className="entity-main">
                                            <span className="entity-pill warn">
                                                <FiDatabase /> PID {proc.pid}
                                            </span>
                                            <span className="entity-name">{proc.comm}</span>
                                        </div>
                                        <div className="entity-meta">
                                            <span className="entity-sub">{formatNumber(count)} fds</span>
                                            <div className="progress skinny">
                                                <div
                                                    className="progress-value warning"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default DashboardView;
