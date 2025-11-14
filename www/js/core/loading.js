/**
 * Loading Overlay Module
 * Shows/hides global loading overlay for background operations
 */

const Loading = {
    /**
     * Show loading overlay
     */
    show(message = 'Processing...') {
        const overlay = document.getElementById('loading-overlay');
        const text = document.getElementById('loading-text');
        if (overlay) {
            if (text) text.textContent = message;
            overlay.classList.remove('hidden');
        }
    },

    /**
     * Hide loading overlay
     */
    hide() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Loading = Loading;
}

