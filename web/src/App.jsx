import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiBell, FiX } from 'react-icons/fi';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import AddHostModal from './components/AddHostModal';
import HostInfoModal from './components/HostInfoModal';
import DashboardView from './views/DashboardView';
import ProcessesView from './views/ProcessesView';
import FileDescriptorsView from './views/FileDescriptorsView';
import NetworkView from './views/NetworkView';
import CPUView from './views/CPUView';
import MemoryView from './views/MemoryView';
import AnomaliesView from './views/AnomaliesView';
import { api } from './api/client';
import './styles/App.css';

const HOST_STATUS_POLL_MS = 15000;

function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHost, setSelectedHost] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Modal states
  const [showAddHost, setShowAddHost] = useState(false);
  const [showHostInfo, setShowHostInfo] = useState(false);

  // Data states
  const [snapshotData, setSnapshotData] = useState(null);
  const [psData, setPsData] = useState(null);
  const [fdtData, setFdtData] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [cpuData, setCpuData] = useState(null);
  const [memoryData, setMemoryData] = useState(null);
  const [anomaliesData, setAnomaliesData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hostStatusRef = useRef(new Map());
  const hostStatusInitializedRef = useRef(false);
  const pollErrorNotifiedRef = useRef(false);
  const notificationRef = useRef(null);

  const pushNotification = useCallback((type, message) => {
    setNotifications((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        message,
        timestamp: new Date().toISOString()
      },
      ...prev
    ].slice(0, 30));
    setUnreadNotifications((prev) => prev + 1);
  }, []);

  const dismissNotification = (id) => {
    setNotifications((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const summarizeHosts = useCallback((names = []) => {
    if (names.length <= 4) return names.join(', ');
    return `${names.slice(0, 4).join(', ')} +${names.length - 4} more`;
  }, []);

  const reconcileHostStatuses = useCallback((nextHosts) => {
    const nextMap = new Map(nextHosts.map((host) => [host.name, host.status || 'offline']));
    const previousMap = hostStatusRef.current;

    if (!hostStatusInitializedRef.current) {
      hostStatusInitializedRef.current = true;
      hostStatusRef.current = nextMap;

      const initiallyOffline = nextHosts
        .filter((host) => (host.status || 'offline') === 'offline')
        .map((host) => host.name);

      if (initiallyOffline.length > 0) {
        pushNotification(
          'warning',
          `Startup check: ${initiallyOffline.length} agent host(s) offline (${summarizeHosts(initiallyOffline)}).`
        );
      }
      return;
    }

    for (const [name, status] of nextMap.entries()) {
      const previousStatus = previousMap.get(name);

      if (!previousStatus) {
        if (status === 'offline') {
          pushNotification('warning', `Host "${name}" was added but is currently offline.`);
        } else {
          pushNotification('info', `Host "${name}" was added and is online.`);
        }
        continue;
      }

      if (previousStatus !== status) {
        if (status === 'offline') {
          pushNotification(
            'critical',
            `Agent "${name}" went offline. Validate service health and investigate potential compromise.`
          );
        } else {
          pushNotification('success', `Agent "${name}" is back online.`);
        }
      }
    }

    for (const name of previousMap.keys()) {
      if (!nextMap.has(name)) {
        pushNotification('warning', `Host "${name}" was removed from the registry.`);
      }
    }

    hostStatusRef.current = nextMap;
  }, [pushNotification, summarizeHosts]);

  const loadHosts = useCallback(async ({ notify = true } = {}) => {
    try {
      const data = await api.getHosts();
      const nextHosts = data.hosts || [];
      setHosts(nextHosts);

      if (notify) {
        if (pollErrorNotifiedRef.current) {
          pushNotification('success', 'Host status polling recovered.');
          pollErrorNotifiedRef.current = false;
        }
        reconcileHostStatuses(nextHosts);
      }

      return nextHosts;
    } catch (err) {
      console.error('Failed to load hosts:', err);
      if (notify && !pollErrorNotifiedRef.current) {
        pushNotification(
          'critical',
          `Host status polling failed: ${err.message}. Check server reachability.`
        );
        pollErrorNotifiedRef.current = true;
      }
      return [];
    }
  }, [pushNotification, reconcileHostStatuses]);

  // Load hosts on mount + keep polling status changes
  useEffect(() => {
    loadHosts({ notify: true });

    const timerId = setInterval(() => {
      loadHosts({ notify: true });
    }, HOST_STATUS_POLL_MS);

    return () => clearInterval(timerId);
  }, [loadHosts]);

  // Load cached host selection
  useEffect(() => {
    const cached = localStorage.getItem('selectedHost');
    if (cached && hosts.some((h) => h.name === cached)) {
      setSelectedHost(cached);
    }
  }, [hosts]);

  // Save host selection
  useEffect(() => {
    if (selectedHost) {
      localStorage.setItem('selectedHost', selectedHost);
    }
  }, [selectedHost]);

  useEffect(() => {
    if (!isNotificationOpen) return;
    setUnreadNotifications(0);
  }, [isNotificationOpen]);

  useEffect(() => {
    if (!isNotificationOpen) return undefined;

    const onPointerDown = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isNotificationOpen]);

  const loadData = async (hostname, viewOverride = activeView, useRefresh = false) => {
    if (!hostname) return;

    const view = viewOverride || activeView;
    setLoading(true);
    setError(null);

    try {
      if (view === 'dashboard') {
        const [snapshot, ps, fdt, cpu, memory, anomalies] = await Promise.all([
          useRefresh ? api.refresh(hostname) : api.getSnapshot(hostname),
          api.getPS(hostname),
          api.getFDT(hostname),
          api.getCPU(hostname),
          api.getMemory(hostname),
          api.getAnomalies(hostname)
        ]);
        setSnapshotData(snapshot);
        setPsData(ps);
        setFdtData(fdt);
        setCpuData(cpu);
        setMemoryData(memory);
        setAnomaliesData(anomalies);
      } else if (view === 'processes') {
        const [processTree, threadSnapshot] = await Promise.all([
          api.getTreeAll(hostname),
          useRefresh ? api.refresh(hostname) : api.getSnapshot(hostname)
        ]);
        setSnapshotData(processTree);
        setPsData(threadSnapshot);
      } else if (view === 'fdt') {
        const fdt = await api.getFDT(hostname);
        setFdtData(fdt);
      } else if (view === 'network') {
        const network = await api.getNetwork(hostname);
        setNetworkData(network);
      } else if (view === 'cpu') {
        const cpu = await api.getCPU(hostname);
        setCpuData(cpu);
      } else if (view === 'memory') {
        const memory = await api.getMemory(hostname);
        setMemoryData(memory);
      } else if (view === 'anomalies') {
        const anomalies = await api.getAnomalies(hostname);
        setAnomaliesData(anomalies);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!selectedHost) return;

    await loadData(selectedHost, activeView, true);
  };

  const handleHostSelect = (hostname) => {
    setSelectedHost(hostname);
    if (hostname) {
      loadData(hostname, activeView);
    }
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    if (selectedHost) {
      loadData(selectedHost, view);
    }
  };

  const handleHostAdded = () => {
    loadHosts({ notify: true });
  };

  const handleHostRemoved = () => {
    loadHosts({ notify: true });
    setSelectedHost(null);
    setSnapshotData(null);
    setPsData(null);
    setFdtData(null);
    setNetworkData(null);
    setCpuData(null);
    setMemoryData(null);
    setAnomaliesData(null);
  };

  const handleHostUpdated = async (oldName, newName) => {
    await loadHosts({ notify: true });

    if (selectedHost === oldName) {
      setSelectedHost(newName);
      loadData(newName, activeView);
    }
  };

  const offlineHosts = hosts.filter((host) => (host.status || 'offline') === 'offline');
  const attentionCount = unreadNotifications + offlineHosts.length;

  return (
    <div className="app">
      <Sidebar activeView={activeView} onViewChange={handleViewChange} />

      <div className="app-content">
        <TopBar
          hosts={hosts}
          selectedHost={selectedHost}
          onHostSelect={handleHostSelect}
          onRefresh={handleRefresh}
          onOpenHostInfo={() => setShowHostInfo(true)}
          onOpenAddHost={() => setShowAddHost(true)}
          activeView={activeView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="main-content">
          {loading && (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading data...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {activeView === 'dashboard' && (
                <DashboardView
                  hosts={hosts}
                  snapshotData={snapshotData}
                  psData={psData}
                  fdtData={fdtData}
                  cpuData={cpuData}
                  memoryData={memoryData}
                  anomaliesData={anomaliesData}
                  selectedHost={selectedHost}
                  loading={loading}
                  onRefresh={handleRefresh}
                />
              )}

              {activeView === 'processes' && (
                <ProcessesView
                  snapshotData={snapshotData}
                  threadsData={psData}
                  searchQuery={searchQuery}
                  hostname={selectedHost}
                />
              )}

              {activeView === 'fdt' && (
                <FileDescriptorsView
                  fdtData={fdtData}
                  searchQuery={searchQuery}
                />
              )}

              {activeView === 'network' && (
                <NetworkView
                  networkData={networkData}
                  searchQuery={searchQuery}
                />
              )}

              {activeView === 'cpu' && (
                <CPUView
                  cpuData={cpuData}
                  searchQuery={searchQuery}
                />
              )}

              {activeView === 'memory' && (
                <MemoryView
                  memoryData={memoryData}
                  searchQuery={searchQuery}
                />
              )}

              {activeView === 'anomalies' && (
                <AnomaliesView
                  anomaliesData={anomaliesData}
                  searchQuery={searchQuery}
                />
              )}
            </>
          )}
        </main>
      </div>

      <div className="notification-fab-wrap" ref={notificationRef}>
        <button
          type="button"
          className={`notification-fab ${offlineHosts.length > 0 ? 'alert' : ''}`}
          onClick={() => setIsNotificationOpen((prev) => !prev)}
          aria-label="Open notifications"
          aria-expanded={isNotificationOpen}
        >
          <FiBell />
          {attentionCount > 0 && (
            <span className="notification-fab-badge">{attentionCount > 99 ? '99+' : attentionCount}</span>
          )}
        </button>

        {isNotificationOpen && (
          <aside className="notification-hover-panel">
            <div className="notification-hover-header">
              <h3>Notifications</h3>
              <button
                type="button"
                className="notification-hover-close"
                onClick={() => setIsNotificationOpen(false)}
                aria-label="Close notifications"
              >
                <FiX />
              </button>
            </div>

            {offlineHosts.length > 0 && (
              <div className="notification-offline-alert">
                <div className="notification-offline-title">Offline Agents</div>
                <div className="notification-offline-text">
                  {offlineHosts.length} host{offlineHosts.length > 1 ? 's' : ''}: {summarizeHosts(offlineHosts.map((host) => host.name))}
                </div>
              </div>
            )}

            <div className="notification-hover-actions">
              <button
                type="button"
                className="notification-hover-clear"
                onClick={clearNotifications}
                disabled={notifications.length === 0}
              >
                Clear log
              </button>
            </div>

            <div className="notification-hover-list">
              {notifications.length === 0 && (
                <div className="notification-hover-empty">
                  No events yet.
                </div>
              )}

              {notifications.slice(0, 12).map((entry) => (
                <article
                  key={entry.id}
                  className={`notification-hover-item notification-${entry.type}`}
                >
                  <div className="notification-hover-item-body">
                    <div className="notification-hover-message">{entry.message}</div>
                    <div className="notification-hover-time">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="notification-hover-dismiss"
                    onClick={() => dismissNotification(entry.id)}
                    aria-label="Dismiss notification"
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
          </aside>
        )}
      </div>

      {showAddHost && (
        <AddHostModal
          onClose={() => setShowAddHost(false)}
          onHostAdded={handleHostAdded}
        />
      )}

      {showHostInfo && selectedHost && (
        <HostInfoModal
          hostname={selectedHost}
          onClose={() => setShowHostInfo(false)}
          onHostRemoved={handleHostRemoved}
          onHostUpdated={handleHostUpdated}
        />
      )}
    </div>
  );
}

export default App;
