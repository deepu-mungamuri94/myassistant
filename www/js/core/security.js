/**
 * Security Module
 * Handles PIN and Biometric authentication
 */

const Security = {
    isUnlocked: false,
    
    /**
     * Check if security is set up
     */
    isSetup() {
        return window.DB.security && window.DB.security.isSetup && window.DB.security.pinHash;
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
            
            // Access BiometricAuth through Capacitor Plugins
            const BiometricAuth = window.Capacitor.Plugins.BiometricAuth;
            if (!BiometricAuth) {
                console.error('❌ BiometricAuth plugin not found in Capacitor.Plugins');
                return false;
            }
            console.log('✅ BiometricAuth plugin found');
            
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
            if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
                throw new Error('Biometric not available in web mode');
            }
            
            // Access BiometricAuth through Capacitor Plugins
            const BiometricAuth = window.Capacitor.Plugins.BiometricAuth;
            if (!BiometricAuth) {
                throw new Error('BiometricAuth plugin not found');
            }
            
            const result = await BiometricAuth.authenticate({
                reason: 'Unlock My Assistant',
                cancelTitle: 'Use PIN',
                allowDeviceCredential: false,
                iosFallbackTitle: 'Use PIN',
                androidTitle: 'Biometric Authentication',
                androidSubtitle: 'Verify your identity',
                androidConfirmationRequired: false
            });
            
            if (result.verified) {
                this.isUnlocked = true;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Biometric authentication failed:', error);
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

