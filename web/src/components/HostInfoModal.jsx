import React, { useEffect, useState } from 'react';
import { FiX, FiTrash2 } from 'react-icons/fi';
import { api } from '../api/client';

const HostInfoModal = ({ hostname, onClose, onHostRemoved }) => {
    const [hostInfo, setHostInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadHostInfo();
    }, [hostname]);

    const loadHostInfo = async () => {
        try {
            setLoading(true);
            const data = await api.getHostInfo(hostname);
            setHostInfo(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async () => {
        if (!confirm(`Are you sure you want to remove host "${hostname}"?`)) {
            return;
        }

        try {
            await api.removeHost(hostname);
            onHostRemoved();
            onClose();
        } catch (err) {
            alert(`Failed to remove host: ${err.message}`);
        }
    };

    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Host Information</h2>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                {loading && (
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                )}

                {error && (
                    <div className="error-state">
                        {error}
                    </div>
                )}

                {hostInfo && (
                    <div>
                        <div className="form-group">
                            <label className="form-label">Name</label>
                            <div className="text-sm">{hostInfo.name}</div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">URL</label>
                            <div className="text-sm font-mono">{hostInfo.url}</div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Reported Hostname</label>
                            <div className="text-sm">{hostInfo.reportedHostname || 'Unknown'}</div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Status</label>
                            <div className={`status-indicator status-${hostInfo.status}`}>
                                <span className="status-dot"></span>
                                {hostInfo.status}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Last Seen</label>
                            <div className="text-sm">{formatDate(hostInfo.lastSeen)}</div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Last Snapshot</label>
                            <div className="text-sm">{formatDate(hostInfo.lastSnapshot)}</div>
                        </div>

                        <div className="flex gap-2 mt-4">
                            <button className="btn btn-secondary" onClick={onClose}>
                                Close
                            </button>
                            <button className="btn btn-secondary" onClick={handleRemove} style={{ marginLeft: 'auto' }}>
                                <FiTrash2 /> Remove Host
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HostInfoModal;
