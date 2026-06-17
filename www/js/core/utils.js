/**
 * Utility Functions
 * Common helper functions used across the app
 */

const Utils = {
    /**
     * Escape HTML to prevent XSS attacks
     */
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * Hash password using SHA-256
     */
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    /**
     * Format currency in Indian Rupees
     */
    formatCurrency(amount) {
        return `₹${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    },

    /**
     * Format number with Indian style commas (lakhs, crores) with decimals
     * Complete rewrite for reliability
     */
    formatIndianNumber(num) {
        // Handle null/undefined/NaN
        if (num === null || num === undefined || num === '') return '0';
        
        // Convert to number
        const number = typeof num === 'string' ? parseFloat(num) : Number(num);
        
        // Check if valid number
        if (isNaN(number)) return '0';
        
        // Handle negative numbers
        const isNegative = number < 0;
        const absNumber = Math.abs(number);
        
        // Split into integer and decimal parts
        let [integerPart, decimalPart] = absNumber.toFixed(2).split('.');
        
        // Remove leading zeros but keep at least one digit
        integerPart = integerPart.replace(/^0+/, '') || '0';
        
        // Format integer part with Indian grouping
        // Indian format: X,XX,XX,XXX (rightmost 3 digits, then groups of 2)
        let result = '';
        let count = 0;
        
        // Process from right to left
        for (let i = integerPart.length - 1; i >= 0; i--) {
            if (count === 3 || (count > 3 && (count - 3) % 2 === 0)) {
                result = ',' + result;
            }
            result = integerPart[i] + result;
            count++;
        }
        
        // Add decimal part if not .00
        if (decimalPart && decimalPart !== '00') {
            result += '.' + decimalPart;
        }
        
        // Add negative sign back if needed
        return isNegative ? '-' + result : result;
    },

    /**
     * Format date as YYYY-MM-DD in local timezone (IST)
     */
    formatLocalDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Format datetime as YYYY-MM-DDTHH:MM:SS in local timezone (IST)
     */
    formatLocalDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    },

    /**
     * Format date
     */
    formatDate(date) {
        return new Date(date).toLocaleDateString();
    },

    /**
     * Format datetime
     */
    formatDateTime(datetime) {
        return new Date(datetime).toLocaleString();
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now();
    },

    /**
     * Get current timestamp in IST (local timezone format)
     */
    getCurrentTimestamp() {
        return this.formatLocalDateTime(new Date());
    },

    /**
     * Custom confirm dialog (replaces native confirm)
     * @param {string} message - The confirmation message
     * @param {string} title - Optional title (default: "Confirm Action")
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
     */
    async confirm(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const confirmBtn = document.getElementById('confirm-modal-confirm');
            const cancelBtn = document.getElementById('confirm-modal-cancel');
            
            // Set content
            titleEl.textContent = title;
            messageEl.textContent = message;
            
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
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleBackdropClick);
            };
            
            // Handle backdrop click
            const handleBackdropClick = (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            };
            
            // Add event listeners
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            modal.addEventListener('click', handleBackdropClick);
        });
    },

    // ==================== MODAL MANAGEMENT ====================
    
    /**
     * Show modal by ID
     * @param {string} modalId - The modal element ID
     */
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    /**
     * Hide modal by ID
     * @param {string} modalId - The modal element ID
     */
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    /**
     * Toggle modal visibility
     * @param {string} modalId - The modal element ID
     */
    toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.toggle('hidden');
        }
    },

    // ==================== DATA ACCESS HELPERS ====================
    
    /**
     * Safely get array from database
     * @param {string} key - The database key
     * @returns {Array} - The array or empty array if not found
     */
    getDBArray(key) {
        return window.DB[key] || [];
    },

    /**
     * Safely get value from database
     * @param {string} key - The database key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} - The value or default value
     */
    getDBValue(key, defaultValue = null) {
        return window.DB[key] !== undefined ? window.DB[key] : defaultValue;
    },

    // ==================== NUMBER UTILITIES ====================
    
    /**
     * Safely parse float with default value
     * @param {*} value - Value to parse
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} - Parsed number or default
     */
    safeParseFloat(value, defaultValue = 0) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    },

    /**
     * Safely parse integer with default value
     * @param {*} value - Value to parse
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} - Parsed integer or default
     */
    safeParseInt(value, defaultValue = 0) {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    },

    /**
     * Calculate percentage
     * @param {number} value - The value
     * @param {number} total - The total
     * @param {number} decimals - Decimal places (default 1)
     * @returns {number} - Percentage value
     */
    calculatePercentage(value, total, decimals = 1) {
        if (total === 0 || isNaN(value) || isNaN(total)) return 0;
        return parseFloat(((value / total) * 100).toFixed(decimals));
    },

    /**
     * Format as percentage string
     * @param {number} value - The value
     * @param {number} total - The total
     * @param {number} decimals - Decimal places (default 1)
     * @returns {string} - Formatted percentage (e.g., "25.5%")
     */
    formatPercentage(value, total, decimals = 1) {
        const percent = this.calculatePercentage(value, total, decimals);
        return `${percent}%`;
    },

    // ==================== DATE UTILITIES ====================
    
    /**
     * Get month name from number
     * @param {number} monthNumber - Month number (1-12)
     * @param {boolean} short - Use short format (default true)
     * @returns {string} - Month name
     */
    getMonthName(monthNumber, short = true) {
        const months = short 
            ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return months[monthNumber - 1] || '';
    },

    /**
     * Get formatted month and year
     * @param {Date|string} date - Date object or date string
     * @returns {string} - Formatted as "Nov 2024"
     */
    getMonthYear(date) {
        const d = typeof date === 'string' ? new Date(date) : date;
        const month = this.getMonthName(d.getMonth() + 1, true);
        const year = d.getFullYear();
        return `${month} ${year}`;
    },

    /**
     * Parse month value (YYYY-MM format)
     * @param {string} monthValue - Month in YYYY-MM format
     * @returns {Object} - {year, month, monthName}
     */
    parseMonthValue(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        return {
            year,
            month,
            monthName: this.getMonthName(month, false)
        };
    },

    /**
     * Get current month value for input (YYYY-MM)
     * @returns {string} - Current month in YYYY-MM format
     */
    getCurrentMonthValue() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },

    // ==================== VALIDATION UTILITIES ====================
    
    /**
     * Validate amount
     * @param {*} value - Value to validate
     * @returns {boolean} - True if valid amount
     */
    isValidAmount(value) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= 0;
    },

    /**
     * Validate date string
     * @param {string} dateString - Date string to validate
     * @returns {boolean} - True if valid date
     */
    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    },

    /**
     * Validate email
     * @param {string} email - Email to validate
     * @returns {boolean} - True if valid email
     */
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    // ==================== ARRAY UTILITIES ====================
    
    /**
     * Group array by key
     * @param {Array} array - Array to group
     * @param {string|Function} key - Key or function to group by
     * @returns {Object} - Grouped object
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = typeof key === 'function' ? key(item) : item[key];
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    },

    /**
     * Sort array by date field
     * @param {Array} array - Array to sort
     * @param {string} dateField - Date field name
     * @param {boolean} descending - Sort descending (default true)
     * @returns {Array} - Sorted array
     */
    sortByDate(array, dateField = 'date', descending = true) {
        return [...array].sort((a, b) => {
            const dateA = new Date(a[dateField]);
            const dateB = new Date(b[dateField]);
            return descending ? dateB - dateA : dateA - dateB;
        });
    },

    /**
     * Filter array by month
     * @param {Array} array - Array to filter
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @param {string} dateField - Date field name
     * @returns {Array} - Filtered array
     */
    filterByMonth(array, year, month, dateField = 'date') {
        return array.filter(item => {
            const date = new Date(item[dateField]);
            return date.getFullYear() === year && date.getMonth() + 1 === month;
        });
    },

    // ==================== STRING UTILITIES ====================
    
    /**
     * Truncate string with ellipsis
     * @param {string} str - String to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} - Truncated string
     */
    truncate(str, maxLength) {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    },

    /**
     * Capitalize first letter
     * @param {string} str - String to capitalize
     * @returns {string} - Capitalized string
     */
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    // ==================== SUCCESS ANIMATION ====================
    
    /**
     * Show animated success modal (convenience method)
     * @param {string} message - Success message (default: "Success")
     * @param {number} duration - Duration in milliseconds (default: 1000)
     * @param {Function} callback - Optional callback after close
     */
    showSuccess(message = 'Success', duration = 1000, callback) {
        if (window.ModalManager) {
            ModalManager.showSuccess(message, duration, callback);
        } else {
            // Fallback to direct implementation
            const modal = document.getElementById('common-success-modal');
            if (!modal) {
                console.warn('Success modal not found');
                return;
            }

            const messageEl = document.getElementById('success-modal-message');
            if (messageEl) {
                messageEl.innerHTML = message;
            }

            modal.classList.remove('hidden');

            setTimeout(() => {
                modal.classList.add('hidden');
                if (callback) callback();
            }, duration);
        }
    },

    /**
     * Show animated error modal (stays open until user closes)
     * @param {string} message - Error message to display
     * @param {Function} callback - Optional callback after close
     */
    showError(message, callback) {
        if (window.ModalManager) {
            ModalManager.showError(message, callback);
        } else {
            // Fallback to direct implementation
            const modal = document.getElementById('common-error-modal');
            if (!modal) {
                console.warn('Error modal not found, falling back to toast');
                if (window.Toast) {
                    Toast.show(message, 'error');
                }
                return;
            }

            const messageEl = document.getElementById('error-modal-message');
            if (messageEl) {
                messageEl.textContent = message;
            }

            modal.classList.remove('hidden');

            // Store callback for when user closes the modal
            if (callback) {
                modal.dataset.callback = 'true';
                modal._errorCallback = callback;
            }
        }
    },

    /**
     * Show info modal
     * @param {string} message - Info message to display
     * @param {Function} callback - Optional callback after user closes modal
     */
    showInfo(message, callback) {
        if (window.ModalManager) {
            ModalManager.showInfo(message, callback);
        } else {
            // Fallback to direct implementation
            const modal = document.getElementById('common-info-modal');
            if (!modal) {
                console.warn('Info modal not found, falling back to toast');
                if (window.Toast) {
                    Toast.show(message, 'info');
                }
                return;
            }

            const messageEl = document.getElementById('info-modal-message');
            if (messageEl) {
                messageEl.textContent = message;
            }

            modal.classList.remove('hidden');

            // Store callback for when user closes the modal
            if (callback) {
                modal.dataset.callback = 'true';
                modal._infoCallback = callback;
            }
        }
    },

    /**
     * Show progress modal with loading spinner
     * @param {string} message - Message to display
     * @param {boolean} showLoading - Whether to show the loading spinner
     */
    /**
     * Internal: switch the header icon to one of 'spinner' | 'success' | 'error'.
     */
    _setProgressHeaderIcon(state) {
        const spinner = document.getElementById('progress-spinner');
        const successIcon = document.getElementById('progress-success-icon');
        const errorIcon = document.getElementById('progress-error-icon');
        if (!spinner || !successIcon || !errorIcon) return;
        spinner.classList.toggle('hidden', state !== 'spinner');
        successIcon.classList.toggle('hidden', state !== 'success');
        errorIcon.classList.toggle('hidden', state !== 'error');
    },

    showProgressModal(message = 'Loading...', showLoading = true) {
        const modal = document.getElementById('progress-modal');
        const messageEl = document.getElementById('progress-modal-message');
        const titleEl = document.getElementById('progress-modal-title');
        const closeBtn = document.getElementById('progress-modal-close-btn');
        const stepList = document.getElementById('progress-step-list');

        if (!modal || !messageEl || !closeBtn) return;

        // Aggressively hide common-info-modal if visible
        const infoModal = document.getElementById('common-info-modal');
        if (infoModal && !infoModal.classList.contains('hidden')) {
            infoModal.classList.add('hidden');
        }

        // Reset to working state: spinner in header, no close button.
        this._setProgressHeaderIcon(showLoading ? 'spinner' : 'success');
        closeBtn.classList.add('hidden');

        // Legacy free-form mode — hide the step list, show the message.
        if (stepList) { stepList.classList.add('hidden'); stepList.innerHTML = ''; }
        if (titleEl) titleEl.textContent = 'Working…';
        messageEl.classList.remove('hidden');
        messageEl.innerHTML = message;
        modal.classList.remove('hidden');
    },

    // ---------------------------------------------------------------
    // Step-checklist API — for multi-stage operations (e.g. portfolio
    // reload). Each step animates: pending → spinner → green check (or
    // red x), then the next step starts. Far clearer than a single
    // changing line of text.
    //
    //   Utils.showProgressSteps('Refreshing portfolio', [
    //     { id: 'fx',     label: 'Exchange rate' },
    //     { id: 'gold',   label: 'Gold rate' },
    //     { id: 'stocks', label: 'Stock prices' },
    //   ]);
    //   Utils.setProgressStep('fx', 'active');
    //   Utils.setProgressStep('fx', 'done', '₹86.50');
    //   ...
    //   Utils.finishProgressSteps('success', 'Portfolio refreshed');
    // ---------------------------------------------------------------
    showProgressSteps(title, steps) {
        const modal = document.getElementById('progress-modal');
        const titleEl = document.getElementById('progress-modal-title');
        const messageEl = document.getElementById('progress-modal-message');
        const closeBtn = document.getElementById('progress-modal-close-btn');
        const stepList = document.getElementById('progress-step-list');
        if (!modal || !stepList) return;

        const infoModal = document.getElementById('common-info-modal');
        if (infoModal && !infoModal.classList.contains('hidden')) {
            infoModal.classList.add('hidden');
        }

        this._setProgressHeaderIcon('spinner');
        closeBtn.classList.add('hidden');
        if (titleEl) titleEl.textContent = title || 'Working…';
        if (messageEl) { messageEl.classList.add('hidden'); messageEl.innerHTML = ''; }

        stepList.classList.remove('hidden');
        stepList.innerHTML = steps.map(s => `
            <li id="progress-step-${s.id}" class="flex items-center gap-3 text-sm transition-opacity duration-200 opacity-50">
                <span class="progress-step-icon flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    <span class="w-2.5 h-2.5 rounded-full border-2 border-gray-300"></span>
                </span>
                <span class="progress-step-label text-gray-500 flex-1">${s.label}</span>
                <span class="progress-step-detail text-xs text-gray-400 tabular-nums"></span>
            </li>
        `).join('');

        modal.classList.remove('hidden');
    },

    /**
     * Update a single step. state: 'active' | 'done' | 'failed'.
     * Optional `detail` shows a small trailing value (e.g. "₹86.50").
     */
    setProgressStep(id, state, detail) {
        const li = document.getElementById(`progress-step-${id}`);
        if (!li) return;
        const iconWrap = li.querySelector('.progress-step-icon');
        const label = li.querySelector('.progress-step-label');
        const detailEl = li.querySelector('.progress-step-detail');

        if (state === 'active') {
            li.classList.remove('opacity-50');
            li.classList.add('opacity-100');
            label.className = 'progress-step-label text-gray-800 font-medium flex-1';
            iconWrap.innerHTML = `<svg class="w-4 h-4 animate-spin text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`;
        } else if (state === 'done') {
            li.classList.remove('opacity-50');
            li.classList.add('opacity-100');
            label.className = 'progress-step-label text-gray-700 flex-1';
            iconWrap.innerHTML = `<svg class="w-5 h-5 text-emerald-500 animate-scale-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`;
        } else if (state === 'failed') {
            li.classList.remove('opacity-50');
            li.classList.add('opacity-100');
            label.className = 'progress-step-label text-gray-700 flex-1';
            iconWrap.innerHTML = `<svg class="w-5 h-5 text-red-500 animate-scale-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>`;
        }
        if (detail !== undefined && detailEl) {
            detailEl.textContent = detail || '';
            detailEl.className = 'progress-step-detail text-xs tabular-nums ' +
                (state === 'failed' ? 'text-red-500' : 'text-gray-500');
        }
    },

    /**
     * Finish a step run: set the header icon, optional summary line, and reveal
     * the close button. state: 'success' | 'error'. Auto-closes on success
     * only when `autoClose` is true.
     */
    finishProgressSteps(state, summary, autoClose = false) {
        const titleEl = document.getElementById('progress-modal-title');
        const messageEl = document.getElementById('progress-modal-message');
        const closeBtn = document.getElementById('progress-modal-close-btn');

        this._setProgressHeaderIcon(state === 'success' ? 'success' : 'error');
        if (titleEl) titleEl.textContent = state === 'success' ? 'Done' : 'Finished with errors';
        if (summary && messageEl) {
            messageEl.classList.remove('hidden');
            messageEl.innerHTML = `<span class="mt-1 inline-block">${summary}</span>`;
        }
        if (autoClose && state === 'success') {
            setTimeout(() => this.closeProgressModal(), 1400);
        } else if (closeBtn) {
            closeBtn.classList.remove('hidden');
        }
    },

    /**
     * Update progress modal message (keeps it open)
     * @param {string} message - New message to display
     * @param {boolean} showLoading - Whether to show the loading spinner
     */
    updateProgressModal(message, showLoading = true) {
        const modal = document.getElementById('progress-modal');
        const messageEl = document.getElementById('progress-modal-message');
        if (!modal || !messageEl) return;

        const infoModal = document.getElementById('common-info-modal');
        if (infoModal && !infoModal.classList.contains('hidden')) {
            infoModal.classList.add('hidden');
        }

        if (showLoading) this._setProgressHeaderIcon('spinner');
        messageEl.classList.remove('hidden');
        messageEl.innerHTML = message;
    },

    /**
     * Show success in progress modal
     * @param {string} message - Success message
     * @param {boolean} autoClose - Whether to auto-close after 1.5 seconds
     */
    showProgressSuccess(message, autoClose = false) {
        const modal = document.getElementById('progress-modal');
        const messageEl = document.getElementById('progress-modal-message');
        const titleEl = document.getElementById('progress-modal-title');
        const closeBtn = document.getElementById('progress-modal-close-btn');
        if (!modal || !messageEl || !closeBtn) return;

        this._setProgressHeaderIcon('success');
        if (titleEl) titleEl.textContent = 'Done';
        messageEl.classList.remove('hidden');
        messageEl.innerHTML = message;

        if (autoClose) {
            setTimeout(() => this.closeProgressModal(), 1500);
        } else {
            closeBtn.classList.remove('hidden');
        }
    },

    /**
     * Show error in progress modal (manual close only)
     * @param {string} message - Error message
     */
    showProgressError(message) {
        const modal = document.getElementById('progress-modal');
        const messageEl = document.getElementById('progress-modal-message');
        const titleEl = document.getElementById('progress-modal-title');
        const closeBtn = document.getElementById('progress-modal-close-btn');
        if (!modal || !messageEl || !closeBtn) return;

        this._setProgressHeaderIcon('error');
        if (titleEl) titleEl.textContent = 'Something went wrong';
        messageEl.classList.remove('hidden');
        messageEl.innerHTML = message;
        closeBtn.classList.remove('hidden');
    },

    /**
     * Close/hide progress modal
     */
    closeProgressModal() {
        const modal = document.getElementById('progress-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

