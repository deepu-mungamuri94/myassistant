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
    
    // ---- PIN lockout policy (defends a short PIN against brute force) ----
    LOCK_THRESHOLD: 5, // allow this many failures before lockout kicks in
    PBKDF2_ITERATIONS: 200000,

    /**
     * Legacy PIN hash (unsalted SHA-256). Kept only to verify & migrate old PINs.
     */
    async hashPin(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Salted, slow PIN hash (PBKDF2-SHA256). Current scheme.
     */
    async _hashPinV2(pin, saltBase64) {
        const salt = window.Crypto.base64ToArrayBuffer(saltBase64);
        return await window.Crypto.deriveBitsHex(pin, salt, this.PBKDF2_ITERATIONS, 256);
    },

    /**
     * How long (ms) PIN entry is currently locked out. 0 = not locked.
     */
    getLockoutRemainingMs() {
        const until = (window.DB.security && window.DB.security.pinLockoutUntil) || 0;
        return Math.max(0, until - Date.now());
    },

    _lockoutMsForAttempts(attempts) {
        if (attempts < this.LOCK_THRESHOLD) return 0;
        const over = attempts - this.LOCK_THRESHOLD; // 0, 1, 2, ...
        const ms = 30000 * Math.pow(2, over); // 30s, 60s, 120s, ...
        return Math.min(ms, 15 * 60 * 1000); // cap at 15 minutes
    },

    _recordPinFailure() {
        const sec = window.DB.security;
        sec.failedPinAttempts = (sec.failedPinAttempts || 0) + 1;
        const lock = this._lockoutMsForAttempts(sec.failedPinAttempts);
        if (lock > 0) {
            sec.pinLockoutUntil = Date.now() + lock;
        }
        // Durable: lockout state must survive an immediate reload (App.init()
        // re-reads storage right after biometric login), or a debounced write
        // gets clobbered and the counter/lockout silently reverts.
        this._persistNow();
    },

    _recordPinSuccess() {
        const sec = window.DB.security;
        sec.failedPinAttempts = 0;
        sec.pinLockoutUntil = 0;
        this._persistNow();
    },

    /**
     * Self-heal a lockout whose window has fully elapsed.
     *
     * failedPinAttempts is persisted and, historically, only ever reset on a
     * *correct* PIN. That made it a monotonic counter: once you crossed the
     * threshold, the lockout timestamp would move into the past overnight (so
     * getLockoutRemainingMs() reads 0 and you're allowed to type), but the
     * counter was still high — so the very first wrong entry the next day
     * jumped straight back over the threshold and re-triggered (and escalated)
     * the lockout. That's the "the wait time shows up again tomorrow" bug.
     *
     * Once the penalty has been served (pinLockoutUntil is set but now in the
     * past), clear the streak so the next attempt starts from a clean slate.
     * The escalating backoff still throttles a rapid burst of guesses within a
     * single streak; it just no longer accumulates across sessions/days. This
     * is the right trade-off here: the PIN gates the UI only (on-device data is
     * not encrypted with it), so legitimate-user recoverability wins over
     * theoretical brute-force hardening.
     */
    _maybeResetExpiredLockout() {
        const sec = window.DB.security;
        if (!sec) return;
        if (sec.pinLockoutUntil && sec.pinLockoutUntil <= Date.now()) {
            sec.failedPinAttempts = 0;
            sec.pinLockoutUntil = 0;
            this._persistNow();
        }
    },

    /**
     * Persist a security credential change durably (synchronously).
     *
     * Storage.save() is debounced 500ms. That is fine for ordinary data, but a
     * PIN hash is a credential that MUST be on disk before anything reloads
     * storage — otherwise the write is still buffered when a later
     * Storage.load() (e.g. App.init() re-reading localStorage right after a
     * login-screen reset) overwrites the new hash in memory with the stale disk
     * value, silently reverting the PIN to the old one. flush() forces the
     * pending write out now. save() is still called first to preserve the
     * dirty-flag contract (and so environments/tests without flush() degrade to
     * the debounced write).
     */
    _persistNow() {
        if (!window.Storage) return;
        window.Storage.save();
        if (typeof window.Storage.flush === 'function') {
            window.Storage.flush();
        }
    },

    /**
     * Write a new PIN (salted PBKDF2) and clear any lockout state.
     * Shared by changePin and the biometric-based reset so the hashing scheme
     * stays in one place. Persisted synchronously (see _persistNow).
     */
    async _writeNewPin(pin) {
        const sec = window.DB.security;
        sec.pinSalt = window.Crypto.randomSaltBase64(16);
        sec.pinHash = await this._hashPinV2(pin, sec.pinSalt);
        sec.pinVersion = 2;
        sec.failedPinAttempts = 0;
        sec.pinLockoutUntil = 0;
        this._persistNow();
    },

    /**
     * Compare a candidate PIN against the stored hash, migrating a legacy
     * unsalted hash to the salted scheme on a match. Pure check: no lockout
     * enforcement and no attempt-counter side effects — callers decide whether
     * this attempt should count toward the login brute-force lockout.
     */
    async _pinMatches(pin) {
        const sec = window.DB.security;
        if (sec.pinVersion === 2 && sec.pinSalt) {
            return (await this._hashPinV2(pin, sec.pinSalt)) === sec.pinHash;
        }
        // Legacy unsalted SHA-256 path
        const ok = (await this.hashPin(pin)) === sec.pinHash;
        if (ok) {
            // Migrate to salted PBKDF2 transparently
            sec.pinSalt = window.Crypto.randomSaltBase64(16);
            sec.pinHash = await this._hashPinV2(pin, sec.pinSalt);
            sec.pinVersion = 2;
        }
        return ok;
    },

    /**
     * Setup PIN (salted PBKDF2)
     */
    async setupPin(pin) {
        if (!pin || pin.length !== 4) {
            throw new Error('PIN must be exactly 4 digits');
        }

        const sec = window.DB.security;
        sec.pinSalt = window.Crypto.randomSaltBase64(16);
        sec.pinHash = await this._hashPinV2(pin, sec.pinSalt);
        sec.pinVersion = 2;
        sec.isSetup = true;
        sec.failedPinAttempts = 0;
        sec.pinLockoutUntil = 0;
        this._persistNow();

        console.log('✅ PIN setup successfully');
    },

    /**
     * Verify PIN. Enforces lockout, supports legacy hash, and transparently
     * upgrades old unsalted PINs to the salted scheme on first successful entry.
     */
    async verifyPin(pin) {
        // If a previous lockout has fully elapsed, forgive the streak first so
        // a served penalty doesn't make the next single wrong entry re-lock.
        this._maybeResetExpiredLockout();

        // Hard stop while still locked out.
        if (this.getLockoutRemainingMs() > 0) {
            return false;
        }

        const ok = await this._pinMatches(pin);

        if (ok) {
            this._recordPinSuccess();
        } else {
            this._recordPinFailure();
        }
        return ok;
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
            // A verified identity clears any PIN-failure lockout streak: the
            // user proved who they are, so stale failed attempts shouldn't keep
            // penalizing PIN entry (this is what let a forgotten-PIN + working
            // fingerprint still get stuck behind a login lockout).
            this._recordPinSuccess();
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

        await this._writeNewPin(newPin);
        console.log('✅ PIN changed successfully');
    },

    /**
     * Reset the PIN when the user can't recall the old one but CAN prove
     * identity with biometric. This is the recovery path for a forgotten PIN
     * that preserves all data (on-device data is not encrypted with the PIN, so
     * there is nothing to lose by re-keying it).
     *
     * Re-authenticates with biometric right here so a stale unlock session
     * can't be used to silently re-PIN the app; throws if biometric is not
     * enabled/available or the user cancels/fails.
     */
    async resetPinWithBiometric(newPin) {
        if (!newPin || newPin.length < 4) {
            throw new Error('New PIN must be at least 4 digits');
        }
        if (!window.DB.security || !window.DB.security.biometricEnabled) {
            throw new Error('Biometric authentication is not enabled');
        }

        // Throws on cancel/failure — only proceed on a verified identity.
        await this.authenticateWithBiometric();

        await this._writeNewPin(newPin);
        console.log('✅ PIN reset via biometric');
    },
    
    /**
     * Reset security (WARNING: Deletes all data)
     */
    async resetSecurity() {
        window.DB.security = {
            pinHash: null,
            pinSalt: null,
            pinVersion: 1,
            failedPinAttempts: 0,
            pinLockoutUntil: 0,
            biometricEnabled: false,
            isSetup: false,
            masterPassword: ''
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

