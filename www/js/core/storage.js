/**
 * Storage Module
 * Handles local storage operations and file export/import
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
     * Check if running in native app (Capacitor)
     */
    isNativeApp() {
        return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
    },

    /**
     * Export data as JSON file (with Capacitor Filesystem API support)
     */
    async exportData() {
        try {
            const dataStr = JSON.stringify(window.DB, null, 2);
            const fileName = `myassistant_backup_${Date.now()}.json`;
            
            // Use Capacitor Filesystem API for native apps
            if (this.isNativeApp() && window.Capacitor.Plugins.Filesystem) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                
                if (window.Loading) {
                    window.Loading.show('Exporting data...');
                }
                
                // Write to Downloads directory
                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: dataStr,
                    directory: Directory.Documents, // Use Documents for better compatibility
                    encoding: 'utf8'
                });
                
                if (window.Loading) {
                    window.Loading.hide();
                }
                
                console.log('✅ File exported:', result.uri);
                
                if (window.Toast) {
                    window.Toast.show(`✅ Exported to Documents/${fileName}`, 'success');
                }
                
                // Show detailed path in console
                console.log('📂 File saved to:', result.uri);
                
                return true;
            } else {
                // Fallback to browser download for web
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
                
                if (window.Toast) {
                    window.Toast.show('✅ Data exported to Downloads!', 'success');
                }
                return true;
            }
        } catch (error) {
            console.error('Export error:', error);
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            if (window.Toast) {
                window.Toast.show('❌ Export failed: ' + error.message, 'error');
            }
            return false;
        }
    },

    /**
     * Import data from JSON file (with Capacitor Filesystem API support)
     */
    async importData(file) {
        try {
            if (!file) {
                throw new Error('Please select a file');
            }
            
            if (window.Loading) {
                window.Loading.show('Importing data...');
            }
            
            // Read file content
            const text = await file.text();
            const imported = JSON.parse(text);
            
            // Validate imported data
            if (!imported || typeof imported !== 'object') {
                throw new Error('Invalid backup file format');
            }
            
            // Merge imported data with current DB
            Object.assign(window.DB, imported);
            this.save();
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            if (window.Toast) {
                window.Toast.show('✅ Data imported successfully!', 'success');
            }
            
            console.log('✅ Data imported from:', file.name);
            
            return true;
        } catch (error) {
            console.error('Import error:', error);
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            if (window.Toast) {
                window.Toast.show('❌ Import failed: Invalid file format', 'error');
            }
            return false;
        }
    },

    /**
     * Get exported files list (native only)
     */
    async getExportedFiles() {
        try {
            if (!this.isNativeApp() || !window.Capacitor.Plugins.Filesystem) {
                return [];
            }
            
            const { Filesystem, Directory } = window.Capacitor.Plugins;
            
            const result = await Filesystem.readdir({
                path: '',
                directory: Directory.Documents
            });
            
            // Filter only My Assistant backup files
            const backupFiles = result.files.filter(file => 
                file.name && file.name.startsWith('myassistant_backup_') && file.name.endsWith('.json')
            );
            
            return backupFiles;
        } catch (error) {
            console.error('Error reading exported files:', error);
            return [];
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Storage = Storage;
}

