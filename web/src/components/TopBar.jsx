import React from 'react';
import { FiRefreshCw, FiInfo, FiPlus, FiSearch, FiChevronDown } from 'react-icons/fi';
import './TopBar.css';

const TopBar = ({
    hosts,
    selectedHost,
    onHostSelect,
    onRefresh,
    onOpenHostInfo,
    onOpenAddHost,
    activeView,
    searchQuery,
    onSearchChange
}) => {
    const getSearchPlaceholder = () => {
        switch (activeView) {
            case 'fdt':
                return 'Search by PID, command, or file path...';
            case 'network':
                return 'Search by PID, command, endpoint, or state...';
            case 'cpu':
                return 'Search by PID or command...';
            default:
                return 'Search by PID or command...';
        }
    };

    return (
        <div className="topbar">
            <div className="topbar-section">
                <div className="host-selector-wrapper">
                    <select
                        className="host-selector"
                        value={selectedHost || ''}
                        onChange={(e) => onHostSelect(e.target.value)}
                    >
                        <option value="">Select a host...</option>
                        {hosts.map((host) => (
                            <option key={host.name} value={host.name}>
                                {host.name} {host.status === 'offline' ? '(offline)' : ''}
                            </option>
                        ))}
                    </select>
                    <FiChevronDown className="selector-icon" />
                </div>

                {selectedHost && (
                    <div className="host-status">
                        <span className={`status-indicator status-${hosts.find(h => h.name === selectedHost)?.status || 'offline'}`}>
                            <span className="status-dot"></span>
                            {hosts.find(h => h.name === selectedHost)?.status || 'offline'}
                        </span>
                    </div>
                )}
            </div>

            <div className="topbar-section">
                <div className="search-box">
                    <FiSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder={getSearchPlaceholder()}
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="search-input"
                    />
                </div>

                <button
                    className="btn-icon"
                    onClick={onRefresh}
                    title="Refresh data"
                    disabled={!selectedHost}
                >
                    <FiRefreshCw />
                </button>

                <button
                    className="btn-icon"
                    onClick={onOpenHostInfo}
                    title="Host info"
                    disabled={!selectedHost}
                >
                    <FiInfo />
                </button>

                <button
                    className="btn btn-primary"
                    onClick={onOpenAddHost}
                >
                    <FiPlus /> Add Host
                </button>
            </div>
        </div>
    );
};

export default TopBar;
