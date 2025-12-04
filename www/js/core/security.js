/**
 * Security Module
 * Handles PIN and Biometric authentication
 */

const Security = {
    isUnlocked: false,
    sessionTimestamp: null,
    sessionTimeoutSeconds: 10, // Timeout when away from secure pages
    currentSecurePage: null, // Track which secure page we're on (cards/credentials)
    leftPageTimestamp: null, // When we left the secure page
    appSuspendedTimestamp: null, // When app went to background
    appSuspendTimeoutSeconds: 60, // Lock app after 1 minute in background
    
    /**
     * Check if security is set up
     */
    isSetup() {
        return window.DB.security && window.DB.security.isSetup && window.DB.security.pinHash;
    },
    
    /**
     * Check if session is still valid for a specific page
     */
    isSessionValid(pageName) {
        if (!this.sessionTimestamp) {
            return false;
        }
        
        // If we're on the same secure page, session is always valid
        if (this.currentSecurePage === pageName) {
            return true;
        }
        
        // If we left a secure page, check time since we left
        if (this.leftPageTimestamp) {
            const now = Date.now();
            const elapsed = (now - this.leftPageTimestamp) / 1000; // seconds
            return elapsed < this.sessionTimeoutSeconds;
        }
        
        // If no leftPageTimestamp, this is first visit to secure page since login/auth
        // Check time since last authentication
        const now = Date.now();
        const elapsedSinceAuth = (now - this.sessionTimestamp) / 1000;
        return elapsedSinceAuth < this.sessionTimeoutSeconds;
    },
    
    /**
     * Set current secure page (called when on cards/credentials page)
     */
    setCurrentPage(pageName) {
        if (this.sessionTimestamp) {
            const now = Date.now();
            
            // If we have a leftPageTimestamp, check time since we left
            if (this.leftPageTimestamp) {
                const elapsed = (now - this.leftPageTimestamp) / 1000;
                
                // If more than timeout seconds passed, clear the session
                if (elapsed >= this.sessionTimeoutSeconds) {
                    this.clearSession();
                }
            } else {
                // First time visiting secure page after login/auth
                // Check time since authentication
                const elapsedSinceAuth = (now - this.sessionTimestamp) / 1000;
                
                // If more than timeout seconds passed, clear the session
                if (elapsedSinceAuth >= this.sessionTimeoutSeconds) {
                    this.clearSession();
                }
            }
        }
        
        this.currentSecurePage = pageName;
        this.leftPageTimestamp = null; // Clear left timestamp when on page
    },
    
    /**
     * Clear current secure page (called when leaving cards/credentials page)
     */
    clearCurrentPage() {
        if (this.currentSecurePage) {
            this.leftPageTimestamp = Date.now(); // Record when we left
            this.currentSecurePage = null;
        }
    },
    
    /**
     * Update session timestamp (on successful authentication)
     */
    updateSession() {
        this.sessionTimestamp = Date.now();
    },
    
    /**
     * Clear session completely
     */
    clearSession() {
        this.sessionTimestamp = null;
        this.currentSecurePage = null;
        this.leftPageTimestamp = null;
    },
    
    /**
     * Called when app goes to background
     */
    onAppSuspended() {
        this.appSuspendedTimestamp = Date.now();
        console.log('🔒 App suspended at:', new Date(this.appSuspendedTimestamp).toLocaleTimeString());
    },
    
    /**
     * Called when app comes back to foreground
     * Returns true if app should be locked
     */
    onAppResumed() {
        if (!this.appSuspendedTimestamp) {
            return false; // Never suspended, no need to lock
        }
        
        const now = Date.now();
        const elapsed = (now - this.appSuspendedTimestamp) / 1000; // seconds
        this.appSuspendedTimestamp = null; // Clear timestamp
        
        console.log('🔓 App resumed, was suspended for:', Math.round(elapsed), 'seconds');
        
        // If suspended for more than timeout, require unlock
        if (elapsed >= this.appSuspendTimeoutSeconds) {
            console.log('⚠️ App was suspended too long, locking...');
            this.lock();
            return true; // Should lock
        }
        
        return false; // No lock needed
    },
    
    /**
     * Require authentication with session management
     * Returns true if authenticated (either already valid session or newly authenticated)
     * Returns false if authentication failed or was cancelled
     * 
     * @param {string} reason - Reason for authentication (shown in modal)
     * @param {string} pageName - Page name for session tracking (e.g., 'cards', 'credentials')
     */
    async requireAuthentication(reason = 'Secure Access', pageName = null) {
        // Check if session is still valid for this page
        if (pageName && this.isSessionValid(pageName)) {
            return true;
        }
        
        // Session expired or doesn't exist, require authentication
        try {
            // Try biometric first if enabled
            if (window.DB.security.biometricEnabled) {
                try {
                    await this.authenticateWithBiometric();
                    this.updateSession();
                    this.isUnlocked = true;
                    return true;
                } catch (biometricError) {
                    // Biometric failed or cancelled, fall through to PIN
                }
            }
            
            // Show PIN modal
            const authenticated = await this.showPinModal(reason);
            if (authenticated) {
                this.updateSession();
                this.isUnlocked = true;
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Show PIN authentication modal
     * Returns promise that resolves to true if authenticated, false if cancelled
     */
    async showPinModal(reason = 'Secure Access') {
        return new Promise((resolve) => {
            const modal = document.getElementById('security-unlock-modal');
            const titleElement = document.getElementById('security-unlock-title');
            const pinInput = document.getElementById('security-unlock-pin');
            const errorElement = document.getElementById('security-unlock-error');
            
            if (!modal || !titleElement || !pinInput || !errorElement) {
                resolve(false);
                return;
            }
            
            // Set title and clear previous state
            titleElement.textContent = reason;
            pinInput.value = '';
            errorElement.classList.add('hidden');
            const errorText = errorElement.querySelector('p');
            if (errorText) errorText.textContent = '';
            
            // Store resolve function for later use
            window._securityAuthResolve = resolve;
            
            // Show modal
            modal.classList.remove('hidden');
            setTimeout(() => pinInput.focus(), 100);
        });
    },
    
    /**
     * Hash PIN using SHA-256
     */
    async hashPin(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    
    /**
     * Setup PIN
     */
    async setupPin(pin) {
        if (!pin || pin.length !== 4) {
            throw new Error('PIN must be exactly 4 digits');
        }
        
        const pinHash = await this.hashPin(pin);
        window.DB.security.pinHash = pinHash;
        window.DB.security.isSetup = true;
        window.Storage.save();
        
        console.log('✅ PIN setup successfully');
    },
    
    /**
     * Verify PIN
     */
    async verifyPin(pin) {
        const pinHash = await this.hashPin(pin);
        return pinHash === window.DB.security.pinHash;
    },
    
    /**
     * Check if biometric is available on device
     */
    async isBiometricAvailable() {
        try {
            console.log('🔍 Checking biometric availability...');
            console.log('Capacitor available:', !!window.Capacitor);
            console.log('Is native platform:', window.Capacitor?.isNativePlatform());
            
            if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
                console.log('❌ Not a native platform, biometric unavailable');
                return false;
            }
            
            console.log('📱 Native platform detected, checking biometric hardware...');
            
            // Debug: Log all available plugins
            console.log('Available Capacitor Plugins:', Object.keys(window.Capacitor.Plugins || {}));
            
            // Try multiple ways to access BiometricAuth (the native plugin is called BiometricAuthNative)
            let BiometricAuth = window.Capacitor.Plugins?.BiometricAuthNative || 
                                window.Capacitor.Plugins?.BiometricAuth || 
                                window.BiometricAuth;
            
            if (!BiometricAuth) {
                console.error('❌ BiometricAuth plugin not found');
                console.log('Tried: BiometricAuthNative, BiometricAuth, window.BiometricAuth');
                console.log('Available plugins:', Object.keys(window.Capacitor.Plugins || {}));
                return false;
            }
            console.log('✅ BiometricAuth plugin found:', BiometricAuth);
            
            const result = await BiometricAuth.checkBiometry();
            console.log('🔐 Biometry check result:', result);
            console.log('Is available:', result.isAvailable);
            console.log('Biometry type:', result.biometryType);
            
            return result.isAvailable;
        } catch (error) {
            console.error('❌ Biometric check failed:', error);
            console.error('Error details:', error.message, error.stack);
            return false;
        }
    },
    
    /**
     * Enable biometric authentication
     */
    async enableBiometric() {
        const available = await this.isBiometricAvailable();
        if (!available) {
            throw new Error('Biometric authentication not available on this device');
        }
        
        window.DB.security.biometricEnabled = true;
        window.Storage.save();
        console.log('✅ Biometric enabled');
    },
    
    /**
     * Disable biometric authentication
     */
    async disableBiometric() {
        window.DB.security.biometricEnabled = false;
        window.Storage.save();
        console.log('✅ Biometric disabled');
    },
    
    /**
     * Authenticate with biometric
     */
    async authenticateWithBiometric() {
        try {
            console.log('🔐 authenticateWithBiometric: Starting...');
            
            if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
                throw new Error('Biometric not available in web mode');
            }
            
            // Access BiometricAuth through Capacitor Plugins (native plugin is called BiometricAuthNative)
            const BiometricAuth = window.Capacitor.Plugins.BiometricAuthNative || 
                                 window.Capacitor.Plugins.BiometricAuth;
            if (!BiometricAuth) {
                throw new Error('BiometricAuth plugin not found');
            }
            
            console.log('🔐 BiometricAuth plugin found, calling internalAuthenticate...');
            console.log('🔐 Authentication params:', {
                reason: 'Unlock My Assistant',
                cancelTitle: 'Use PIN',
                allowDeviceCredential: false
            });
            
            const result = await BiometricAuth.internalAuthenticate({
                reason: 'Unlock My Assistant',
                cancelTitle: 'Use PIN',
                allowDeviceCredential: false,
                iosFallbackTitle: 'Use PIN',
                androidTitle: 'Biometric Authentication',
                androidSubtitle: 'Verify your identity',
                androidConfirmationRequired: false
            });
            
            console.log('🔐 Authentication result:', result);
            console.log('🔐 Result type:', typeof result);
            console.log('🔐 Result keys:', result ? Object.keys(result) : 'null/undefined');
            console.log('🔐 Result JSON:', JSON.stringify(result));
            
            // If the method completes without throwing an error, consider it success
            // The plugin throws on failure/cancel, so reaching here means success
            this.isUnlocked = true;
            this.updateSession(); // Set session on successful authentication
            console.log('✅ Biometric authentication successful!');
            return true;
        } catch (error) {
            console.error('❌ Biometric authentication failed:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                type: error.constructor.name
            });
            throw error;
        }
    },
    
    /**
     * Unlock app with PIN
     */
    async unlockWithPin(pin) {
        const isValid = await this.verifyPin(pin);
        if (isValid) {
            this.isUnlocked = true;
            this.updateSession(); // Set session on successful authentication
            return true;
        }
        return false;
    },
    
    /**
     * Lock the app
     */
    lock() {
        this.isUnlocked = false;
        console.log('🔒 App locked');
    },
    
    /**
     * Change PIN
     */
    async changePin(oldPin, newPin) {
        const isValid = await this.verifyPin(oldPin);
        if (!isValid) {
            throw new Error('Current PIN is incorrect');
        }
        
        if (!newPin || newPin.length < 4) {
            throw new Error('New PIN must be at least 4 digits');
        }
        
        const newPinHash = await this.hashPin(newPin);
        window.DB.security.pinHash = newPinHash;
        window.Storage.save();
        
        console.log('✅ PIN changed successfully');
    },
    
    /**
     * Reset security (WARNING: Deletes all data)
     */
    async resetSecurity() {
        window.DB.security = {
            pinHash: null,
            biometricEnabled: false,
            isSetup: false
        };
        this.isUnlocked = false;
        window.Storage.save();
        console.log('⚠️ Security reset');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Security = Security;
}

