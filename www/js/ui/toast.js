/**
 * Toast Notification Module
 * Displays temporary notification messages (full width, bold, left-aligned)
 */

const Toast = {
    currentTimeout: null,
    dismissHandler: null,

    /**
     * Show a toast notification
     */
    show(message, type = 'info', duration = null) {
        const toast = document.getElementById('toast');
        
        if (!toast) {
            console.error('Toast element not found');
            return;
        }
        
        // Clear any existing timeout
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
        }
        
        // Remove old dismiss handler
        if (this.dismissHandler) {
            document.removeEventListener('click', this.dismissHandler);
            document.removeEventListener('touchstart', this.dismissHandler);
            this.dismissHandler = null;
        }
        
        // Set message
        toast.textContent = message;
        
        // Update background color based on type (keep other classes from HTML)
        toast.className = `fixed bottom-0 left-0 right-0 px-6 py-4 shadow-2xl z-[9999] font-bold text-left text-white ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 
            'bg-gray-900'
        }`;
        
        // Show toast
        toast.classList.remove('hidden');
        
        // Determine duration
        const toastDuration = duration !== null ? duration : (type === 'error' ? 10000 : 3000);
        
        // For error messages, add dismiss on click/touch
        if (type === 'error') {
            this.dismissHandler = () => {
                toast.classList.add('hidden');
                if (this.currentTimeout) {
                    clearTimeout(this.currentTimeout);
                }
                document.removeEventListener('click', this.dismissHandler);
                document.removeEventListener('touchstart', this.dismissHandler);
                this.dismissHandler = null;
            };
            
            // Add event listeners after a small delay to prevent immediate dismissal
            setTimeout(() => {
                document.addEventListener('click', this.dismissHandler, { once: true });
                document.addEventListener('touchstart', this.dismissHandler, { once: true });
            }, 100);
        }
        
        // Auto-hide after duration
        this.currentTimeout = setTimeout(() => {
            toast.classList.add('hidden');
            if (this.dismissHandler) {
                document.removeEventListener('click', this.dismissHandler);
                document.removeEventListener('touchstart', this.dismissHandler);
                this.dismissHandler = null;
            }
        }, toastDuration);
    },

    /**
     * Show success message (3 seconds)
     */
    success(message) {
        this.show(message, 'success', 3000);
    },

    /**
     * Show error message (10 seconds or until user clicks)
     */
    error(message) {
        this.show(message, 'error', 10000);
    },

    /**
     * Show info message (3 seconds)
     */
    info(message) {
        this.show(message, 'info', 3000);
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Toast = Toast;
}

