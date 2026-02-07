import React from 'react';
import { FiServer, FiFileText, FiCpu, FiGrid, FiWifi } from 'react-icons/fi';
import './Sidebar.css';

const Sidebar = ({ activeView, onViewChange }) => {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: FiGrid },
        { id: 'processes', label: 'Processes', icon: FiServer },
        { id: 'fdt', label: 'File Descriptors', icon: FiFileText },
        { id: 'network', label: 'Network', icon: FiWifi },
        { id: 'cpu', label: 'CPU', icon: FiCpu },
    ];

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <img src="/walker-logo.svg" alt="Walker Monitor" className="logo-icon" />
                    <h1 className="logo-text">Walker<br />Monitor</h1>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                            onClick={() => onViewChange(item.id)}
                        >
                            <Icon className="nav-icon" />
                            <span className="nav-label">{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default Sidebar;
