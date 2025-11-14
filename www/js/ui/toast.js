/**
 * Toast Notification Module
 * Displays temporary notification messages
 */

const Toast = {
    /**
     * Show a toast notification
     */
    show(message, type = 'info') {
        const toast = document.getElementById('toast');
        
        if (!toast) {
            console.error('Toast element not found');
            return;
        }
        
        toast.textContent = message;
        toast.className = `fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 text-xs ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 
            'bg-gray-900'
        } text-white max-w-sm`;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    },

    /**
     * Show success message
     */
    success(message) {
        this.show(message, 'success');
    },

    /**
     * Show error message
     */
    error(message) {
        this.show(message, 'error');
    },

    /**
     * Show info message
     */
    info(message) {
        this.show(message, 'info');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Toast = Toast;
}

