import React, { useEffect, useState, useCallback } from 'react';
import { FiX, FiTrash2, FiEdit2 } from 'react-icons/fi';
import { api } from '../api/client';

const HostInfoModal = ({ hostname, onClose, onHostRemoved, onHostUpdated }) => {
    const [hostInfo, setHostInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [editing, setEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        apiKey: '',
    });

    const loadHostInfo = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getHostInfo(hostname);
            setHostInfo(data);
            setFormData({
                name: data.name || '',
                url: data.url || '',
                apiKey: '',
            });
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [hostname]);

    useEffect(() => {
        loadHostInfo();
    }, [loadHostInfo]);

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

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const nextName = formData.name.trim();
            const nextURL = formData.url.trim();
            const apiKeyPayload = formData.apiKey.trim() === '' ? undefined : formData.apiKey.trim();
            const result = await api.updateHost(hostname, nextName, nextURL, apiKeyPayload);

            if (onHostUpdated) {
                onHostUpdated(hostname, result.host.name);
            }

            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
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
                        {editing ? (
                            <form onSubmit={handleSave}>
                                <div className="form-group">
                                    <label className="form-label">Host Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Agent URL</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        value={formData.url}
                                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">API Key (Optional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.apiKey}
                                        placeholder={hostInfo.apiKeyConfigured ? 'Leave blank to keep current key' : 'Enter API key if required'}
                                        onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                    />
                                </div>

                                <div className="flex gap-2 mt-4">
                                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <>
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
                                    <label className="form-label">API Key</label>
                                    <div className="text-sm">{hostInfo.apiKeyConfigured ? 'Configured' : 'Not configured'}</div>
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
                                    <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                                        <FiEdit2 /> Edit Host
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleRemove} style={{ marginLeft: 'auto' }}>
                                        <FiTrash2 /> Remove Host
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HostInfoModal;
