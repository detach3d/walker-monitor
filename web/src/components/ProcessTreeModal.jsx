import React from 'react';
import { FiX } from 'react-icons/fi';
import './ProcessTreeModal.css';

const ProcessTreeModal = ({ process, allProcesses, onClose }) => {
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
                        <div className="empty-state-description">No parent processes</div>
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
                        <div className="empty-state-description">No child processes</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProcessTreeModal;
