/**
 * Storage Module
 * Handles local storage operations and file export/import
 */

const Storage = {
    STORAGE_KEY: 'myassistant_db',

    /**
     * Save database to local storage
     * Future-proof: Saves ALL DB fields automatically
     */
    save() {
        try {
            // JSON.stringify serializes ENTIRE DB object with all current and future fields
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
     * Future-proof: Loads ALL DB fields automatically
     */
    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const loaded = JSON.parse(stored);
                // Object.assign merges ALL properties, including future fields
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
            
            // COMPLETE DB DUMP: Export ALL fields (future-proof)
            // Spread operator (...) copies ALL properties from window.DB automatically
            // This ensures any new fields added in the future are exported
            const exportData = {
                ...window.DB, // ← This copies EVERYTHING (current + future fields)
                security: {
                    // Only override security for privacy (device-specific)
                    pinHash: null, // Don't export PIN (device-specific)
                    biometricEnabled: false, // Don't export biometric setting (device-specific)
                    isSetup: false, // Don't export setup status (device-specific)
                    masterPassword: '' // Don't export master password (will use decrypt password on import)
                }
            };
            
            console.log('📦 Exporting complete DB dump with fields:', Object.keys(exportData));
            console.log('✅ All current and future DB fields will be exported automatically');
            
            const dataStr = JSON.stringify(exportData, null, 2);
            
            console.log('🔐 Encrypting data (excluding PIN & master password)...');
            console.log('📝 PIN and master password are device-specific and won\'t be exported');
            
            // Encrypt the data
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
                    
                    // Check if user cancelled the share
                    if (shareResult.activityType === null || shareResult.activityType === undefined) {
                        console.log('ℹ️ User cancelled the share dialog');
                        return 'cancelled';
                    }
                    
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('✅ ENCRYPTED BACKUP SHARED');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('📄 File:', fileName);
                    console.log('📂 URI:', result.uri);
                    console.log('🔐 Encryption: AES-256-GCM');
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
            
            // Preserve local PIN (device-specific)
            const localPinHash = window.DB.security.pinHash;
            const localBiometric = window.DB.security.biometricEnabled;
            const localIsSetup = window.DB.security.isSetup;
            
            console.log('🔒 Preserving local PIN (device-specific)');
            console.log('🔐 Updating master password to the one used for decryption');
            
            // COMPLETE DB RESTORE: Import ALL fields (future-proof)
            // Object.assign merges ALL properties from imported data automatically
            // This ensures any new fields added in the future are imported
            console.log('📦 Importing complete DB dump with fields:', Object.keys(imported));
            console.log('✅ All current and future DB fields will be imported automatically');
            
            Object.assign(window.DB, imported); // ← This merges EVERYTHING (current + future fields)
            
            // Restore device-specific security settings
            window.DB.security.pinHash = localPinHash;
            window.DB.security.biometricEnabled = localBiometric;
            window.DB.security.isSetup = localIsSetup;
            window.DB.security.masterPassword = password; // Use the password that successfully decrypted the data
            
            this.save();
            
            console.log('✅ Security settings updated:');
            console.log('   PIN: ' + (localPinHash ? 'Kept (device-specific)' : 'Not set'));
            console.log('   Master Password: Updated to decryption password');
            console.log('   💡 You can now export again from this device');
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            console.log('✅ Data imported successfully');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            if (window.Toast) {
                window.Toast.show(
                    '✅ Backup imported successfully!\n\n' +
                    '🔓 Data decrypted and restored\n' +
                    '🔐 Master password updated\n' +
                    '💡 You can now export from this device',
                    'success',
                    5000
                );
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

