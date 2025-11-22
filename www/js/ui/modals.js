/**
 * Modal Management System
 * Centralized modal handling
 */

const ModalManager = {
    /**
     * Open modal with options
     * @param {string} modalId - Modal element ID
     * @param {Object} options - Optional configuration
     */
    open(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal not found: ${modalId}`);
            return;
        }

        // Set content if provided
        if (options.title) {
            const titleEl = modal.querySelector('[data-modal-title]');
            if (titleEl) titleEl.textContent = options.title;
        }

        if (options.content) {
            const contentEl = modal.querySelector('[data-modal-content]');
            if (contentEl) {
                if (typeof options.content === 'string') {
                    contentEl.innerHTML = options.content;
                } else {
                    contentEl.innerHTML = '';
                    contentEl.appendChild(options.content);
                }
            }
        }

        // Add backdrop click handler
        if (options.closeOnBackdrop !== false) {
            modal.addEventListener('click', this._handleBackdropClick);
        }

        // Add escape key handler
        if (options.closeOnEscape !== false) {
            document.addEventListener('keydown', this._handleEscapeKey);
        }

        // Show modal
        modal.classList.remove('hidden');

        // Callback
        if (options.onOpen) {
            options.onOpen(modal);
        }
    },

    /**
     * Close modal
     * @param {string} modalId - Modal element ID
     * @param {Function} callback - Optional callback after close
     */
    close(modalId, callback) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.add('hidden');

        // Remove event listeners
        modal.removeEventListener('click', this._handleBackdropClick);
        document.removeEventListener('keydown', this._handleEscapeKey);

        if (callback) {
            callback();
        }
    },

    /**
     * Toggle modal visibility
     * @param {string} modalId - Modal element ID
     */
    toggle(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (modal.classList.contains('hidden')) {
            this.open(modalId);
        } else {
            this.close(modalId);
        }
    },

    /**
     * Confirm dialog
     * @param {string} message - Confirmation message
     * @param {Object} options - Options {title, confirmText, cancelText, type}
     * @returns {Promise<boolean>} - Resolves to true if confirmed
     */
    async confirm(message, options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirm Action',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'warning' // warning, danger, info
            } = options;

            const modal = document.getElementById('custom-confirm-modal');
            if (!modal) {
                // Fallback to native confirm
                resolve(confirm(message));
                return;
            }

            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const confirmBtn = document.getElementById('confirm-modal-confirm');
            const cancelBtn = document.getElementById('confirm-modal-cancel');

            // Set content
            if (titleEl) titleEl.textContent = title;
            if (messageEl) messageEl.textContent = message;
            if (confirmBtn) confirmBtn.textContent = confirmText;
            if (cancelBtn) cancelBtn.textContent = cancelText;

            // Set button style based on type
            if (confirmBtn) {
                confirmBtn.className = 'flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-all duration-200 font-semibold';
                if (type === 'danger') {
                    confirmBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                } else if (type === 'warning') {
                    confirmBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
                } else {
                    confirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                }
            }

            // Show modal
            modal.classList.remove('hidden');

            // Handler for confirm
            const handleConfirm = () => {
                modal.classList.add('hidden');
                cleanup();
                resolve(true);
            };

            // Handler for cancel
            const handleCancel = () => {
                modal.classList.add('hidden');
                cleanup();
                resolve(false);
            };

            // Cleanup listeners
            const cleanup = () => {
                confirmBtn?.removeEventListener('click', handleConfirm);
                cancelBtn?.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleBackdropClick);
                document.removeEventListener('keydown', handleEscapeKey);
            };

            // Handle backdrop click
            const handleBackdropClick = (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            };

            // Handle escape key
            const handleEscapeKey = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                }
            };

            // Add event listeners
            confirmBtn?.addEventListener('click', handleConfirm);
            cancelBtn?.addEventListener('click', handleCancel);
            modal.addEventListener('click', handleBackdropClick);
            document.addEventListener('keydown', handleEscapeKey);
        });
    },

    /**
     * Alert dialog
     * @param {string} message - Alert message
     * @param {Object} options - Options {title, type}
     */
    async alert(message, options = {}) {
        const {
            title = 'Alert',
            type = 'info' // success, error, warning, info
        } = options;

        // Use toast for alerts
        if (window.Toast) {
            Toast.show(message, type);
        } else {
            alert(message);
        }
    },

    /**
     * Success message
     * @param {string} message - Success message
     */
    success(message) {
        this.alert(message, { type: 'success' });
    },

    /**
     * Error message
     * @param {string} message - Error message
     */
    error(message) {
        this.alert(message, { type: 'error' });
    },

    /**
     * Warning message
     * @param {string} message - Warning message
     */
    warning(message) {
        this.alert(message, { type: 'warning' });
    },

    /**
     * Info message
     * @param {string} message - Info message
     */
    info(message) {
        this.alert(message, { type: 'info' });
    },

    /**
     * Show animated success modal
     * @param {string} message - Success message (default: "Success")
     * @param {number} duration - Duration in milliseconds (default: 1000)
     * @param {Function} callback - Optional callback after close
     */
    showSuccess(message = 'Success', duration = 1000, callback) {
        const modal = document.getElementById('common-success-modal');
        if (!modal) {
            console.warn('Success modal not found, falling back to toast');
            if (window.Toast) {
                Toast.show(message, 'success');
            }
            if (callback) callback();
            return;
        }

        // Update message if element exists
        const messageEl = document.getElementById('success-modal-message');
        if (messageEl) {
            messageEl.innerHTML = message;
        }

        // Show modal
        modal.classList.remove('hidden');

        // Auto-close after duration
        setTimeout(() => {
            modal.classList.add('hidden');
            if (callback) {
                callback();
            }
        }, duration);
    },

    /**
     * Show animated error modal (stays open until user closes it)
     * @param {string} message - Error message to display
     * @param {Function} callback - Optional callback after close
     */
    showError(message, callback) {
        const modal = document.getElementById('common-error-modal');
        if (!modal) {
            console.warn('Error modal not found, falling back to toast');
            if (window.Toast) {
                Toast.show(message, 'error');
            }
            if (callback) callback();
            return;
        }

        // Update message
        const messageEl = document.getElementById('error-modal-message');
        if (messageEl) {
            messageEl.textContent = message;
        }

        // Show modal
        modal.classList.remove('hidden');

        // Store callback to be called when modal is closed
        if (callback) {
            modal._errorCallback = callback;
        }

        // Override hideModal to call callback
        const originalHide = this.hide;
        modal.addEventListener('hidden', function onHidden() {
            if (modal._errorCallback) {
                modal._errorCallback();
                modal._errorCallback = null;
            }
            modal.removeEventListener('hidden', onHidden);
        });
    },

    /**
     * Show animated info modal (stays open until user closes it)
     * @param {string} message - Info message to display
     * @param {Function} callback - Optional callback after close
     */
    showInfo(message, callback) {
        const modal = document.getElementById('common-info-modal');
        if (!modal) {
            console.warn('Info modal not found, falling back to toast');
            if (window.Toast) {
                Toast.show(message, 'info');
            }
            if (callback) callback();
            return;
        }

        // Update message
        const messageEl = document.getElementById('info-modal-message');
        if (messageEl) {
            messageEl.textContent = message;
        }

        // Show modal
        modal.classList.remove('hidden');

        // Store callback to be called when modal is closed
        if (callback) {
            modal._infoCallback = callback;
        }

        // Override hideModal to call callback
        modal.addEventListener('hidden', function onHidden() {
            if (modal._infoCallback) {
                modal._infoCallback();
                modal._infoCallback = null;
            }
            modal.removeEventListener('hidden', onHidden);
        });
    },

    /**
     * Handle backdrop click
     * @private
     */
    _handleBackdropClick(e) {
        if (e.target.classList.contains('modal') || 
            e.target.classList.contains('modal-overlay')) {
            const modal = e.target;
            modal.classList.add('hidden');
        }
    },

    /**
     * Handle escape key
     * @private
     */
    _handleEscapeKey(e) {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal:not(.hidden)');
            if (modals.length > 0) {
                modals[modals.length - 1].classList.add('hidden');
            }
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ModalManager = ModalManager;
}

