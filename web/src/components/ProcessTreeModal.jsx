import React from 'react';
import { FiX } from 'react-icons/fi';
import './ProcessTreeModal.css';

const ProcessTreeModal = ({ process, loading, error, onClose }) => {
    // Filter out ps and walker commands from children
    const filteredChildren = (process.children || []).filter(
        child => !['ps', 'walker'].includes(child.comm)
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal process-tree-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Process Tree</h2>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                {loading && (
                    <div className="tree-loading">
                        <div className="spinner"></div>
                        <p>Loading process tree...</p>
                    </div>
                )}

                {error && (
                    <div className="tree-error">
                        <p>Failed to load process tree: {error}</p>
                    </div>
                )}

                {!loading && !error && (
                    <>
                        <div className="tree-section">
                            <h3 className="tree-section-title">Parent Chain</h3>
                            {(process.parents || []).length > 0 ? (
                                <div className="tree-chain">
                                    {[...(process.parents || [])].reverse().map((parent, idx) => (
                                        <div key={idx} className="tree-item">
                                            <div className="tree-arrow">↓</div>
                                            <div className="tree-node">
                                                <span className="tree-pid">{parent.pid}</span>
                                                <span className="tree-comm">{parent.comm}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="tree-empty">No parent processes found</div>
                            )}
                        </div>

                        <div className="tree-section">
                            <h3 className="tree-section-title">Selected Process</h3>
                            <div className="tree-current">
                                <span className="tree-pid highlighted">{process.pid}</span>
                                <span className="tree-comm highlighted">{process.comm}</span>
                            </div>
                        </div>

                        <div className="tree-section">
                            <h3 className="tree-section-title">Direct Children</h3>
                            {filteredChildren.length > 0 ? (
                                <div className="tree-children">
                                    {filteredChildren.map((child, idx) => (
                                        <div key={idx} className="tree-node">
                                            <span className="tree-pid">{child.pid}</span>
                                            <span className="tree-comm">{child.comm}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="tree-empty">No child processes found</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ProcessTreeModal;
