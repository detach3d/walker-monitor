import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { api } from '../api/client';

const AddHostModal = ({ onClose, onHostAdded }) => {
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        apiKey: '',
    });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await api.addHost(formData.name, formData.url, formData.apiKey || null);
            onHostAdded();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add New Host</h2>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="error-state mb-4">
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Host Name</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., production-server-01"
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
                            placeholder="http://192.168.1.100:5000"
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
                            placeholder="Enter API key if required"
                            value={formData.apiKey}
                            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Adding...' : 'Add Host'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddHostModal;
