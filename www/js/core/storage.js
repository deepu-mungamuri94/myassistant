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
            if (this.isNativeApp()) {
                try {
                    // Import Filesystem from Capacitor
                    const { Filesystem, Directory } = await import('@capacitor/filesystem');
                    
                    if (window.Loading) {
                        window.Loading.show('Exporting data...');
                    }
                    
                    // Strategy 1: Try External directory first (most accessible on Android)
                    let result;
                    let savedLocation = 'Documents';
                    
                    try {
                        // Write to app-specific external directory (always accessible, no special permissions)
                        result = await Filesystem.writeFile({
                            path: `MyAssistant/${fileName}`,
                            data: dataStr,
                            directory: Directory.External,
                            encoding: 'utf8',
                            recursive: true
                        });
                        savedLocation = 'Android/data/.../MyAssistant';
                        console.log('✅ Saved to External directory:', result.uri);
                    } catch (externalErr) {
                        console.warn('External directory failed, trying Documents...', externalErr);
                        
                        // Fallback: Try Documents directory
                        result = await Filesystem.writeFile({
                            path: fileName,
                            data: dataStr,
                            directory: Directory.Documents,
                            encoding: 'utf8',
                            recursive: true
                        });
                        savedLocation = 'Documents';
                        console.log('✅ Saved to Documents directory:', result.uri);
                    }
                    
                    if (window.Loading) {
                        window.Loading.hide();
                    }
                    
                    // Parse the URI to show user-friendly location
                    let displayPath = fileName;
                    if (result.uri) {
                        // Extract meaningful part of path
                        if (result.uri.includes('Android/data')) {
                            displayPath = `Internal Storage/Android/data/com.myassistant.app/files/MyAssistant/${fileName}`;
                        } else if (result.uri.includes('Documents')) {
                            displayPath = `Documents/${fileName}`;
                        } else {
                            // Show last few path segments
                            const parts = result.uri.split('/');
                            displayPath = parts.slice(-3).join('/');
                        }
                    }
                    
                    if (window.Toast) {
                        window.Toast.show(`✅ Backup saved!\n\n📂 ${displayPath}\n\nOpen with: Files > MyAssistant folder`, 'success', 5000);
                    }
                    
                    // Detailed console logging for debugging
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📥 EXPORT SUCCESSFUL');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📂 Full URI:', result.uri);
                    console.log('📁 Location:', savedLocation);
                    console.log('📄 Filename:', fileName);
                    console.log('💡 How to find:');
                    console.log('   1. Open "Files" or "My Files" app');
                    console.log('   2. Look in "MyAssistant" folder or "Documents"');
                    console.log('   3. File:', fileName);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    return true;
                } catch (capacitorError) {
                    console.error('❌ All Capacitor methods failed:', capacitorError);
                    
                    if (window.Loading) {
                        window.Loading.hide();
                    }
                    
                    if (window.Toast) {
                        window.Toast.show(`❌ Export failed: ${capacitorError.message}\n\nTrying browser download...`, 'error');
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

