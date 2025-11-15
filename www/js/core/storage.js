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
            
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📤 STARTING EXPORT');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Is Native App:', this.isNativeApp());
            console.log('Capacitor Available:', typeof window.Capacitor !== 'undefined');
            console.log('Is Native Platform:', window.Capacitor?.isNativePlatform());
            
            // Use native Share functionality for mobile apps
            if (this.isNativeApp()) {
                console.log('✅ Using Native Share...');
                
                if (window.Loading) {
                    window.Loading.show('Preparing backup...');
                }
                
                try {
                    // Get Capacitor plugins directly
                    const Filesystem = window.Capacitor.Plugins.Filesystem;
                    const Share = window.Capacitor.Plugins.Share;
                    
                    if (!Filesystem || !Share) {
                        throw new Error('Capacitor Filesystem or Share plugin not available');
                    }
                    
                    console.log('✅ Capacitor plugins loaded');
                    console.log('Filesystem:', !!Filesystem);
                    console.log('Share:', !!Share);
                    
                    // First, write file to cache directory (temporary storage)
                    console.log('📝 Writing file to cache...');
                    const result = await Filesystem.writeFile({
                        path: fileName,
                        data: dataStr,
                        directory: 'CACHE', // Use string constant
                        encoding: 'utf8'
                    });
                    
                    console.log('✅ File created:', result.uri);
                    
                    if (window.Loading) {
                        window.Loading.hide();
                    }
                    
                    // Now open Android Share Sheet - user can choose where to save!
                    console.log('📤 Opening Share dialog...');
                    const shareResult = await Share.share({
                        title: 'Export My Assistant Backup',
                        text: 'My Assistant app backup data',
                        url: result.uri,
                        dialogTitle: 'Save backup to...'
                    });
                    
                    console.log('✅ Share completed:', shareResult);
                    
                    // Don't show toast immediately - let user choose first
                    // Toast will be shown after they select an app
                    
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('✅ SHARE DIALOG OPENED SUCCESSFULLY');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📄 File:', fileName);
                    console.log('📂 URI:', result.uri);
                    console.log('💡 User can save to:');
                    console.log('   • Google Drive');
                    console.log('   • Email');
                    console.log('   • WhatsApp');
                    console.log('   • Files app');
                    console.log('   • Any other app');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    return true;
                } catch (capacitorError) {
                    console.error('❌ Native export failed:', capacitorError);
                    console.error('Error details:', JSON.stringify(capacitorError, null, 2));
                    
                    if (window.Loading) {
                        window.Loading.hide();
                    }
                    
                    // Show detailed error
                    if (window.Toast) {
                        window.Toast.show(
                            `❌ Export failed!\n\n` +
                            `Error: ${capacitorError.message || 'Unknown error'}\n\n` +
                            `Please check:\n` +
                            `• App has file permissions\n` +
                            `• Device has enough storage\n` +
                            `• Try restarting the app`,
                            'error',
                            6000
                        );
                    }
                    
                    throw capacitorError; // Re-throw to be caught by outer catch
                }
            }
            
            // Fallback to browser download for web
            console.log('⚠️ Using browser download (web mode)');
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            if (window.Toast) {
                window.Toast.show('✅ Backup file downloaded!', 'success');
            }
            
            console.log('✅ Browser download completed');
            return true;
            
        } catch (error) {
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('❌ EXPORT ERROR');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('Error:', error);
            console.error('Stack:', error.stack);
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            if (window.Toast) {
                window.Toast.show(
                    '❌ Export failed!\n\n' +
                    `Error: ${error.message}\n\n` +
                    'Please try again or contact support.',
                    'error',
                    5000
                );
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
            
            const Filesystem = window.Capacitor.Plugins.Filesystem;
            
            if (!Filesystem) {
                console.warn('Filesystem plugin not available');
                return [];
            }
            
            const result = await Filesystem.readdir({
                path: '',
                directory: 'DOCUMENTS' // Use string constant
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

