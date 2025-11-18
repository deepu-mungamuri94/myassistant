/**
 * Utility Functions
 * Common helper functions used across the app
 */

const Utils = {
    /**
     * Escape HTML to prevent XSS attacks
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

