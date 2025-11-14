/**
 * Storage Module
 * Handles local storage operations
 */

const Storage = {
    STORAGE_KEY: 'myassistant_db',

    /**
     * Save database to local storage
     */
    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(window.DB));
            return true;
        } catch (e) {
            console.error('Storage error:', e);
            if (window.Toast) {
                window.Toast.show('Failed to save data', 'error');
            }
            return false;
        }
    },

    /**
     * Load database from local storage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const loaded = JSON.parse(stored);
                Object.assign(window.DB, loaded);
                return true;
            }
        } catch (e) {
            console.error('Load error:', e);
        }
        return false;
    },

    /**
     * Export data as JSON file
     */
    exportData() {
        try {
            const dataStr = JSON.stringify(window.DB, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `myassistant_backup_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            if (window.Toast) {
                window.Toast.show('Data exported successfully!', 'success');
            }
            return true;
        } catch (error) {
            console.error('Export error:', error);
            if (window.Toast) {
                window.Toast.show('Export failed: ' + error.message, 'error');
            }
            return false;
        }
    },

    /**
     * Import data from JSON file
     */
    async importData(file) {
        try {
            if (!file) {
                throw new Error('Please select a file');
            }
            
            const text = await file.text();
            const imported = JSON.parse(text);
            Object.assign(window.DB, imported);
            this.save();
            
            if (window.Toast) {
                window.Toast.show('Data imported successfully!', 'success');
            }
            return true;
        } catch (error) {
            console.error('Import error:', error);
            if (window.Toast) {
                window.Toast.show('Import failed: Invalid file format', 'error');
            }
            return false;
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Storage = Storage;
}

