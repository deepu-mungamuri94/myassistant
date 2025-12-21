/**
 * Main Application Module
 * Initializes the app and sets up event handlers
 */

const App = {
    /**
     * Initialize the application
     */
    async init() {
        try {
            // Configure status bar for mobile
            await this.configureStatusBar();
            
            // Load data from storage
            window.Storage.load();
            
            // Run migrations for backward compatibility
            if (window.RecurringExpenses && window.RecurringExpenses.migrateCategories) {
                window.RecurringExpenses.migrateCategories();
            }
            
            // Migrate recurring expenses in Expenses module to use actual categories
            if (window.Expenses && window.Expenses.migrateRecurringCategories) {
                window.Expenses.migrateRecurringCategories();
            }
            
            // Check security status FIRST
            const isSecuritySetup = window.Security && window.Security.isSetup();
            
            // Hide splash screen (reduced delay for faster startup)
            setTimeout(() => {
                const splash = document.getElementById('splash-screen');
                if (splash) {
                    splash.style.opacity = '0';
                    splash.style.transition = 'opacity 0.3s ease-out';
                    setTimeout(() => {
                        splash.style.display = 'none';
                    }, 300);
                }
            }, 200);
            
            // Security flow
            if (!isSecuritySetup) {
                // First time: Show security setup (reduced delay for faster startup)
                console.log('🔒 First launch - showing security setup');
                setTimeout(() => {
                    document.getElementById('security-setup-modal').classList.remove('hidden');
                    // Check biometric availability
                    if (window.checkBiometricAvailability) {
                        window.checkBiometricAvailability();
                    }
                }, 300);
                return; // Stop here, will continue after setup
            }
            
            // Security is set up, check if already unlocked
            if (!window.Security.isUnlocked) {
                // Show unlock screen
                console.log('🔒 App locked - showing unlock screen');
                setTimeout(async () => {
                    const unlockModal = document.getElementById('security-unlock-modal');
                    unlockModal.classList.remove('hidden');
                    
                    // Auto-focus PIN input
                    const pinInput = document.getElementById('security-unlock-pin');
                    if (pinInput) {
                        setTimeout(() => pinInput.focus(), 200);
                    }
                    
                    // Check biometric availability and auto-trigger if enabled
                    if (window.DB.security.biometricEnabled && window.Capacitor && window.Capacitor.isNativePlatform()) {
                        try {
                            const isAvailable = await window.Security.isBiometricAvailable();
                            if (isAvailable) {
                                // Show biometric button
                                document.getElementById('biometric-unlock-section').classList.remove('hidden');
                                
                                // Auto-trigger biometric immediately
                                console.log('🔐 Auto-triggering biometric authentication');
                                setTimeout(() => {
                                    if (window.unlockWithBiometric) {
                                        window.unlockWithBiometric().catch(() => {
                                            console.log('ℹ️ Biometric auto-trigger cancelled/failed, use PIN');
                                        });
                                    }
                                }, 300);
                            }
                        } catch (error) {
                            console.log('ℹ️ Biometric not available:', error.message);
                        }
                    }
                }, 100);
                return; // Stop here, will continue after unlock
            }
            
            // App is unlocked, continue normal initialization
            console.log('✅ App unlocked - continuing initialization');
            
            // Navigate to default view (Dashboard)
            window.Navigation.navigateTo('dashboard');
            
            // Clear chat history on app start for clean slate
            // (Prevents mode mismatch issues when reopening app)
            if (window.Chat) {
                window.DB.chatHistory = [];
                window.Storage.save();
                window.Chat.updateWelcomeMessage();
            }
            
            // Check if API key is configured
            if (!window.DB.settings.geminiApiKey && !window.DB.settings.chatGptApiKey && !window.DB.settings.perplexityApiKey) {
                setTimeout(() => {
                    if (window.Utils) {
                        window.Utils.showInfo('Welcome! Please configure your AI settings.');
                    }
                    setTimeout(() => {
                        window.Navigation.openSettings();
                    }, 1000);
                }, 500);
            }
            
            // Setup global event handlers
            this.setupEventHandlers();
            
            console.log('✅ App initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            if (window.Utils) {
                window.Utils.showError('App initialization error');
            }
            // Hide splash even on error
            const splash = document.getElementById('splash-screen');
            if (splash) splash.style.display = 'none';
        }
    },

    /**
     * Configure status bar for mobile devices
     */
    async configureStatusBar() {
        try {
            // Check if running on native platform
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                const { StatusBar } = window.Capacitor.Plugins;
                
                if (StatusBar) {
                    // Set status bar style to LIGHT (dark/black text/icons)
                    // This works well with our light background
                    await StatusBar.setStyle({ style: 'LIGHT' });
                    
                    // Set background color to white/light to match app
                    await StatusBar.setBackgroundColor({ color: '#ffffff' });
                    
                    // Show the status bar
                    await StatusBar.show();
                    
                    // Make content appear under status bar (we handle padding in CSS)
                    await StatusBar.setOverlaysWebView({ overlay: false });
                    
                    console.log('✅ Status bar configured with light background and dark text');
                }
            }
        } catch (error) {
            console.warn('Status bar configuration skipped (web environment or error):', error.message);
        }
    },

    /**
     * Setup global event handlers
     */
    setupEventHandlers() {
        // Global error handler
        window.onerror = function(msg, url, lineNo, columnNo, error) {
            console.error('Global error:', { msg, url, lineNo, columnNo, error });
            
            // Show detailed error in UI for mobile debugging
            const errorMessage = error ? error.message : msg;
            const fileName = url ? url.split('/').pop() : 'Unknown';
            const errorDetails = `
Error: ${errorMessage}

Location: ${fileName}:${lineNo}:${columnNo}

Type: Global Error
            `.trim();
            
            window.Utils.showError(errorDetails);
            return false;
        };
        
        // Unhandled promise rejection handler
        window.onunhandledrejection = function(event) {
            console.error('Unhandled promise rejection:', event.reason);
            
            // Show detailed error in UI for mobile debugging
            const errorMessage = event.reason ? 
                (event.reason.message || event.reason.toString()) : 
                'Unknown promise rejection';
            
            const errorDetails = `
Error: ${errorMessage}

Type: Unhandled Promise Rejection

${event.reason && event.reason.stack ? 
    'Stack: ' + event.reason.stack.split('\n').slice(0, 2).join('\n') : 
    'No stack trace available'}
            `.trim();
            
            window.Utils.showError(errorDetails);
        };
        
        // App lifecycle listeners (for native app)
        this.setupAppLifecycleListeners();
    },
    
    /**
     * Setup app lifecycle listeners for background/foreground detection
     */
    setupAppLifecycleListeners() {
        console.log('🔧 Setting up app lifecycle listeners...');
        
        // Try Capacitor App plugin first (if available)
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            console.log('📱 Native platform detected');
            console.log('🔌 Available plugins:', Object.keys(window.Capacitor.Plugins || {}));
            
            const CapApp = window.Capacitor.Plugins.App;
            
            if (CapApp) {
                console.log('✅ Using Capacitor App plugin');
                try {
                    CapApp.addListener('pause', () => {
                        console.log('🔴 PAUSE (Capacitor) - App going to background');
                        if (window.Security) window.Security.onAppSuspended();
                    });
                    
                    CapApp.addListener('resume', () => {
                        console.log('🟢 RESUME (Capacitor) - App coming to foreground');
                        this.handleAppResume();
                    });
                    
                    console.log('✅ Capacitor App lifecycle listeners registered');
                    return; // Success, no need for fallback
                } catch (error) {
                    console.error('❌ Capacitor App plugin error:', error);
                }
            } else {
                console.log('ℹ️ Capacitor App plugin not available, using Visibility API fallback');
            }
        }
        
        // Fallback: Use Page Visibility API (works on both web and mobile)
        console.log('✅ Using Page Visibility API as fallback');
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Page is hidden (app went to background or minimized)
                console.log('🔴 HIDDEN (Visibility API) - App/tab going to background');
                if (window.Security) {
                    window.Security.onAppSuspended();
                }
            } else {
                // Page is visible (app came to foreground or tab focused)
                console.log('🟢 VISIBLE (Visibility API) - App/tab coming to foreground');
                this.handleAppResume();
            }
        });
        
        console.log('✅ Page Visibility API listeners registered');
    },
    
    /**
     * Handle app resume - show lock if needed
     */
    handleAppResume() {
        if (!window.Security) {
            console.error('❌ Security module not available!');
            return;
        }
        
        const shouldLock = window.Security.onAppResumed();
        console.log('🔒 Should lock?', shouldLock);
        
        if (shouldLock) {
            console.log('🔐 Locking app and showing unlock modal');
            // Show unlock modal
            const unlockModal = document.getElementById('security-unlock-modal');
            if (unlockModal) {
                unlockModal.classList.remove('hidden');
                
                // Auto-focus PIN input
                const pinInput = document.getElementById('security-unlock-pin');
                if (pinInput) {
                    setTimeout(() => pinInput.focus(), 300);
                }
                
                // TEMPORARY: Always show biometric button for design validation
                const bioSection = document.getElementById('biometric-unlock-section');
                if (bioSection) bioSection.classList.remove('hidden');
                
                // Try biometric if enabled
                if (window.DB.security.biometricEnabled) {
                    // const bioSection = document.getElementById('biometric-unlock-section');
                    // if (bioSection) bioSection.classList.remove('hidden');
                    
                    setTimeout(async () => {
                        try {
                            const isAvailable = await window.Security.isBiometricAvailable();
                            if (isAvailable && window.unlockWithBiometric) {
                                window.unlockWithBiometric().catch(() => {
                                    console.log('ℹ️ Biometric cancelled');
                                });
                            }
                        } catch (error) {
                            console.log('ℹ️ Biometric check failed:', error);
                        }
                    }, 500);
                }
            } else {
                console.error('❌ Unlock modal not found!');
            }
        }
    }
};

// Start the app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.App = App;
}

