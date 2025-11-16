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
     */
    formatIndianNumber(num) {
        if (!num && num !== 0) return '0';
        
        // Convert to number and handle decimals
        const number = typeof num === 'string' ? parseFloat(num) : num;
        if (isNaN(number)) return '0';
        
        console.log('formatIndianNumber input:', num, 'parsed:', number);
        
        // Split into integer and decimal parts
        const parts = number.toFixed(2).split('.');
        const integerPart = parts[0];
        const decimalPart = parts[1];
        
        console.log('After toFixed and split:', { integerPart, decimalPart });
        
        // Format integer part with Indian comma style
        const lastThree = integerPart.substring(integerPart.length - 3);
        const otherNumbers = integerPart.substring(0, integerPart.length - 3);
        
        console.log('Split for formatting:', { lastThree, otherNumbers });
        
        let formatted = lastThree;
        if (otherNumbers !== '') {
            const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
            console.log('Formatted other numbers:', formattedOther);
            formatted = formattedOther + ',' + lastThree;
        }
        
        // Add decimal part if not .00
        if (decimalPart && decimalPart !== '00') {
            formatted += '.' + decimalPart;
        }
        
        console.log('Final formatted:', formatted);
        
        return formatted;
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
     * Get current ISO timestamp
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
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

