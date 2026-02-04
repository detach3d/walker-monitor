import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import AddHostModal from './components/AddHostModal';
import HostInfoModal from './components/HostInfoModal';
import ProcessesView from './views/ProcessesView';
import FileDescriptorsView from './views/FileDescriptorsView';
import CPUView from './views/CPUView';
import { api } from './api/client';
import './styles/App.css';

function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHost, setSelectedHost] = useState(null);
  const [activeView, setActiveView] = useState('processes');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showAddHost, setShowAddHost] = useState(false);
  const [showHostInfo, setShowHostInfo] = useState(false);

  // Data states
  const [snapshotData, setSnapshotData] = useState(null);
  const [psData, setPsData] = useState(null);
  const [fdtData, setFdtData] = useState(null);
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

  const loadData = async (hostname) => {
    if (!hostname) return;

    setLoading(true);
    setError(null);

    try {
      // Load data based on active view
      if (activeView === 'processes') {
        const [snapshot, ps] = await Promise.all([
          api.getSnapshot(hostname),
          api.getPS(hostname)
        ]);
        setSnapshotData(snapshot);
        setPsData(ps);
      } else if (activeView === 'fdt') {
        const fdt = await api.getFDT(hostname);
        setFdtData(fdt);
      } else if (activeView === 'cpu') {
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

    setLoading(true);
    setError(null);

    try {
      if (activeView === 'processes') {
        const [snapshot, ps] = await Promise.all([
          api.refresh(selectedHost),
          api.getPS(selectedHost)
        ]);
        setSnapshotData(snapshot);
        setPsData(ps);
      } else if (activeView === 'fdt') {
        const fdt = await api.getFDT(selectedHost);
        setFdtData(fdt);
      } else if (activeView === 'cpu') {
        const cpu = await api.getCPU(selectedHost);
        setCpuData(cpu);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleHostSelect = (hostname) => {
    setSelectedHost(hostname);
    if (hostname) {
      loadData(hostname);
    }
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    if (selectedHost) {
      loadData(selectedHost);
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
    setCpuData(null);
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
              {activeView === 'processes' && (
                <ProcessesView
                  snapshotData={snapshotData}
                  psData={psData}
                  searchQuery={searchQuery}
                />
              )}

              {activeView === 'fdt' && (
                <FileDescriptorsView
                  fdtData={fdtData}
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
        />
      )}
    </div>
  );
}

export default App;
