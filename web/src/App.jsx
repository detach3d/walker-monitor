import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import AddHostModal from './components/AddHostModal';
import HostInfoModal from './components/HostInfoModal';
import DashboardView from './views/DashboardView';
import ProcessesView from './views/ProcessesView';
import FileDescriptorsView from './views/FileDescriptorsView';
import NetworkView from './views/NetworkView';
import CPUView from './views/CPUView';
import { api } from './api/client';
import './styles/App.css';

function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHost, setSelectedHost] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showAddHost, setShowAddHost] = useState(false);
  const [showHostInfo, setShowHostInfo] = useState(false);

  // Data states
  const [snapshotData, setSnapshotData] = useState(null);
  const [psData, setPsData] = useState(null);
  const [fdtData, setFdtData] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [cpuData, setCpuData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load hosts on mount
  useEffect(() => {
    loadHosts();
  }, []);

  // Load cached host selection
  useEffect(() => {
    const cached = localStorage.getItem('selectedHost');
    if (cached && hosts.some(h => h.name === cached)) {
      setSelectedHost(cached);
    }
  }, [hosts]);

  // Save host selection
  useEffect(() => {
    if (selectedHost) {
      localStorage.setItem('selectedHost', selectedHost);
    }
  }, [selectedHost]);

  const loadHosts = async () => {
    try {
      const data = await api.getHosts();
      setHosts(data.hosts || []);
    } catch (err) {
      console.error('Failed to load hosts:', err);
    }
  };

  const loadData = async (hostname, viewOverride = activeView, useRefresh = false) => {
    if (!hostname) return;

    const view = viewOverride || activeView;
    setLoading(true);
    setError(null);

    try {
      if (view === 'dashboard') {
        const [snapshot, ps, fdt, cpu] = await Promise.all([
          useRefresh ? api.refresh(hostname) : api.getSnapshot(hostname),
          api.getPS(hostname),
          api.getFDT(hostname),
          api.getCPU(hostname)
        ]);
        setSnapshotData(snapshot);
        setPsData(ps);
        setFdtData(fdt);
        setCpuData(cpu);
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
    loadHosts();
  };

  const handleHostRemoved = () => {
    loadHosts();
    setSelectedHost(null);
    setSnapshotData(null);
    setPsData(null);
    setFdtData(null);
    setNetworkData(null);
    setCpuData(null);
  };

  const handleHostUpdated = async (oldName, newName) => {
    await loadHosts();

    if (selectedHost === oldName) {
      setSelectedHost(newName);
      loadData(newName, activeView);
    }
  };

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
            </>
          )}
        </main>
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
