import React from 'react';
import {
    FiActivity,
    FiCpu,
    FiDatabase,
    FiHardDrive,
    FiServer,
    FiRefreshCw
} from 'react-icons/fi';
import './DashboardView.css';

const formatNumber = (value = 0) => Number(value || 0).toLocaleString('en-US');

const formatTime = (ns = 0) => {
    const ms = ns / 1000;
    if (ms < 1000) return `${ms.toFixed(0)} μs`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(2)} s`;
    const min = sec / 60;
    return `${min.toFixed(2)} min`;
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

const DashboardView = ({
    hosts = [],
    snapshotData,
    psData,
    fdtData,
    cpuData,
    selectedHost,
    loading,
    onRefresh
}) => {
    const hostMeta = hosts.find((h) => h.name === selectedHost) || {};
    const snapshotProcesses = snapshotData?.processes || [];
    const psProcesses = psData?.processes || [];
    const fdtProcesses = fdtData?.processes || [];
    const cpuProcesses = cpuData?.processes || [];

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

    const processDelta = snapshotProcesses.length - psProcesses.length;
    const deltaLabel =
        processDelta === 0
            ? 'Parity'
            : processDelta > 0
                ? `${processDelta} only in snapshot`
                : `${Math.abs(processDelta)} only in ps`;
    const processTotal = snapshotProcesses.length + psProcesses.length;
    const snapshotPct = processTotal ? (snapshotProcesses.length / processTotal) * 100 : 50;
    const psPct = 100 - snapshotPct;

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
        cpuProcesses.length;

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
                            Snapshot, ps, file handles, and CPU views merged into a single,
                            high-signal console.
                        </p>
                        <div className="meta-row">
                            <span className={`pill status-${hostMeta.status || 'offline'}`}>
                                <span className="pill-dot" /> {hostMeta.status || 'offline'}
                            </span>
                            <span className="pill">
                                {formatNumber(uniquePIDs.size)} processes observed
                            </span>
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
                        <FiRefreshCw /> {loading ? 'Syncing…' : 'Sync data'}
                    </button>
                </div>
            </div>

            <div className="metric-grid">
                <div className="metric-card primary">
                    <div className="metric-icon">
                        <FiServer />
                    </div>
                    <div className="metric-body">
                        <p className="metric-label">Hosts</p>
                        <div className="metric-value">
                            {formatNumber(hosts.length)}
                            <span className="metric-sub">
                                {formatNumber(
                                    hosts.filter((h) => h.status === 'online').length
                                )}{' '}
                                online
                            </span>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon accent">
                        <FiActivity />
                    </div>
                    <div className="metric-body">
                        <p className="metric-label">Processes (unique)</p>
                        <div className="metric-value">
                            {formatNumber(uniquePIDs.size)}
                            <span className="metric-sub">
                                {formatNumber(snapshotProcesses.length)} snapshot ·{' '}
                                {formatNumber(psProcesses.length)} ps
                            </span>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon accent">
                        <FiCpu />
                    </div>
                    <div className="metric-body">
                        <p className="metric-label">Threads observed</p>
                        <div className="metric-value">
                            {formatNumber(threadsTotal)}
                            <span className="metric-sub">across tracked processes</span>
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

            <div className="panel-grid">
                <section className="panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">Process footprint</p>
                            <h3>Snapshot vs ps</h3>
                        </div>
                        <span className={`delta-badge ${processDelta === 0 ? 'neutral' : processDelta > 0 ? 'positive' : 'negative'}`}>
                            {deltaLabel}
                        </span>
                    </div>
                    <div className="bar-compare">
                        <div
                            className="bar-slice snapshot"
                            style={{
                                width: `${snapshotPct}%`
                            }}
                        >
                            <span>{formatNumber(snapshotProcesses.length)} snapshot</span>
                        </div>
                        <div
                            className="bar-slice ps"
                            style={{
                                width: `${psPct}%`
                            }}
                        >
                            <span>{formatNumber(psProcesses.length)} ps</span>
                        </div>
                    </div>
                    <div className="legend">
                        <span className="legend-dot snapshot" /> Snapshot
                        <span className="legend-dot ps" /> ps listing
                    </div>
                </section>

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
            </div>

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
