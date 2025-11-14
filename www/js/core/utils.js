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
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

