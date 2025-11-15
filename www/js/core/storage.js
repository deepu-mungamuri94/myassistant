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
     * Export data as JSON file (with native Share support for better UX)
     */
    async exportData() {
        try {
            const dataStr = JSON.stringify(window.DB, null, 2);
            const fileName = `myassistant_backup_${Date.now()}.json`;
            
            // Use native Share functionality for mobile apps
            if (this.isNativeApp()) {
                try {
                    // Import Filesystem and Share from Capacitor
                    const { Filesystem, Directory } = await import('@capacitor/filesystem');
                    const { Share } = await import('@capacitor/share');
                    
                    if (window.Loading) {
                        window.Loading.show('Preparing backup...');
                    }
                    
                    // First, write file to cache directory (temporary storage)
                    const result = await Filesystem.writeFile({
                        path: fileName,
                        data: dataStr,
                        directory: Directory.Cache,
                        encoding: 'utf8'
                    });
                    
                    console.log('✅ File created:', result.uri);
                    
                    if (window.Loading) {
                        window.Loading.hide();
                    }
                    
                    // Now open Android Share Sheet - user can choose where to save!
                    await Share.share({
                        title: 'Export My Assistant Backup',
                        text: 'My Assistant app backup data',
                        url: result.uri,
                        dialogTitle: 'Save backup to...'
                    });
                    
                    if (window.Toast) {
                        window.Toast.show('✅ Choose where to save your backup!\n\n💡 Tip: Select Google Drive, Email, or any app', 'success', 4000);
                    }
                    
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📤 EXPORT SHARE DIALOG OPENED');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📄 File:', fileName);
                    console.log('📂 Temporary URI:', result.uri);
                    console.log('💡 User can now choose:');
                    console.log('   • Google Drive');
                    console.log('   • Email');
                    console.log('   • WhatsApp');
                    console.log('   • Files app (to save locally)');
                    console.log('   • Any other app');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    return true;
                } catch (capacitorError) {
                    console.error('❌ Native share failed:', capacitorError);
                    
                    if (window.Loading) {
                        window.Loading.hide();
                    }
                    
                    if (window.Toast) {
                        window.Toast.show(`❌ Share failed: ${capacitorError.message}\n\nTrying browser download...`, 'error');
                    }
                    // Fall through to browser download
                }
            }
            
            // Fallback to browser download for web or if Capacitor fails
            {
                // Browser download
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
            if (!this.isNativeApp()) {
                return [];
            }
            
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            
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

