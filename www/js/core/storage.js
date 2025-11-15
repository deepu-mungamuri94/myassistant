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
     * Export data as JSON file (with AES-256 encryption)
     */
    async exportData() {
        try {
            // Check if master password is set
            const masterPassword = window.DB.security.masterPassword;
            if (!masterPassword) {
                if (window.Toast) {
                    window.Toast.show(
                        '⚠️ Master password not set!\n\n' +
                        'Go to Settings and set a master password first.\n\n' +
                        'This is required to encrypt your backup data.',
                        'error',
                        5000
                    );
                }
                return false;
            }
            
            const dataStr = JSON.stringify(window.DB, null, 2);
            
            // Encrypt the data
            console.log('🔐 Encrypting data with master password...');
            const encryptedData = await window.Crypto.encrypt(dataStr, masterPassword);
            
            const fileName = `myassistant_backup_${Date.now()}.enc`;
            
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
                    
                    // First, write encrypted file to cache directory (temporary storage)
                    console.log('📝 Writing encrypted file to cache...');
                    const result = await Filesystem.writeFile({
                        path: fileName,
                        data: encryptedData,
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
                    console.log('✅ ENCRYPTED BACKUP READY TO SHARE');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📄 File:', fileName);
                    console.log('📂 URI:', result.uri);
                    console.log('🔐 Encryption: AES-256-GCM');
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
            const blob = new Blob([encryptedData], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            if (window.Toast) {
                window.Toast.show('✅ Encrypted backup downloaded!\n🔐 Keep your master password safe!', 'success', 4000);
            }
            
            console.log('✅ Browser download completed (encrypted)');
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
     * Import data from encrypted backup file
     */
    async importData(file, password) {
        try {
            if (!file) {
                throw new Error('Please select a file');
            }
            
            if (!password) {
                throw new Error('Please enter your master password');
            }
            
            if (window.Loading) {
                window.Loading.show('Decrypting backup...');
            }
            
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📥 STARTING IMPORT');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📄 File:', file.name);
            console.log('🔐 Decrypting with master password...');
            
            // Read encrypted file content
            const encryptedText = await file.text();
            
            // Decrypt the data
            const decryptedText = await window.Crypto.decrypt(encryptedText, password);
            
            console.log('✅ Decryption successful');
            console.log('📦 Parsing data...');
            
            // Parse decrypted JSON
            const imported = JSON.parse(decryptedText);
            
            // Validate imported data
            if (!imported || typeof imported !== 'object') {
                throw new Error('Invalid backup file format');
            }
            
            if (window.Loading) {
                window.Loading.show('Restoring data...');
            }
            
            // Merge imported data with current DB
            Object.assign(window.DB, imported);
            this.save();
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            console.log('✅ Data imported successfully');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            if (window.Toast) {
                window.Toast.show('✅ Backup imported successfully!\n\n🔓 Data decrypted and restored.', 'success', 4000);
            }
            
            return true;
        } catch (error) {
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('❌ IMPORT ERROR');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('Error:', error);
            console.error('Stack:', error.stack);
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            // Provide specific error messages
            let errorMessage = 'Import failed!';
            if (error.message.includes('Decryption failed')) {
                errorMessage = '❌ Wrong password or corrupted file!\n\nPlease check:\n• Master password is correct\n• File is not corrupted';
            } else if (error.message.includes('master password')) {
                errorMessage = '⚠️ ' + error.message;
            } else if (error.message.includes('select a file')) {
                errorMessage = '⚠️ ' + error.message;
            } else {
                errorMessage = `❌ Import failed!\n\n${error.message}`;
            }
            
            if (window.Toast) {
                window.Toast.show(errorMessage, 'error', 5000);
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

