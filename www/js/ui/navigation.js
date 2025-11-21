/**
 * Navigation Module
 * Handles app navigation, menus, and modals
 */

const Navigation = {
    currentView: 'dashboard',

    /**
     * Navigate to a specific view
     */
    navigateTo(view) {
        // Hide all views
        document.querySelectorAll('[id$="-view"]').forEach(v => v.classList.add('hidden'));
        
        // Show selected view
        const viewElement = document.getElementById(`${view}-view`);
        if (viewElement) {
            viewElement.classList.remove('hidden');
            this.currentView = view;
            
            // Update header title
            this.updateHeaderTitle(view);
            
            // Refresh view data
            this.refreshView(view);
        }
        
        this.closeMenu();
    },

    /**
     * Update header title based on current view
     */
    updateHeaderTitle(view) {
        const headerTitle = document.getElementById('header-page-title');
        const header = document.querySelector('header');
        if (!headerTitle || !header) return;

        const pageConfig = {
            dashboard: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
                title: 'Dashboard',
                bgClass: 'bg-gradient-to-r from-blue-600 to-cyan-600'
            },
            chat: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/></svg>',
                title: 'AI Advisor',
                bgClass: 'bg-gradient-to-r from-purple-600 to-pink-600'
            },
            income: {
                icon: '<span class="text-2xl font-bold text-white mr-2">₹</span>',
                title: 'Income',
                bgClass: 'bg-gradient-to-r from-green-600 to-emerald-600'
            },
            expenses: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>',
                title: 'Expenses',
                bgClass: 'bg-gradient-to-r from-purple-600 to-pink-600'
            },
            recurring: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>',
                title: 'Recurring Payments',
                bgClass: 'bg-gradient-to-r from-orange-600 to-amber-600'
            },
            loans: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>',
                title: 'Loans',
                bgClass: 'bg-gradient-to-r from-blue-600 to-indigo-600'
            },
            cards: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/></svg>',
                title: 'Cards Manager',
                bgClass: 'bg-gradient-to-r from-slate-600 to-blue-600'
            },
            investments: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clip-rule="evenodd"/></svg>',
                title: 'Investments',
                bgClass: 'bg-gradient-to-r from-yellow-600 to-orange-600'
            },
            credentials: {
                icon: '<svg class="w-6 h-6 text-white mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>',
                title: 'Credentials',
                bgClass: 'bg-gradient-to-r from-blue-600 to-cyan-600'
            }
        };

        const config = pageConfig[view] || pageConfig.dashboard;
        
        // Update header background - remove ALL possible gradient classes first
        header.classList.remove(
            'bg-gradient-to-r',
            // All "from-" colors
            'from-blue-600', 'from-purple-600', 'from-green-600', 'from-orange-600',
            'from-slate-600', 'from-yellow-600',
            // All "to-" colors
            'to-cyan-600', 'to-pink-600', 'to-emerald-600', 'to-amber-600',
            'to-blue-600', 'to-indigo-600', 'to-orange-600'
        );
        
        // Add new gradient classes
        header.classList.add(...config.bgClass.split(' '));
        
        // Update title with white text
        headerTitle.innerHTML = `${config.icon}<h1 class="text-lg font-bold text-white">${config.title}</h1>`;
    },

    /**
     * Refresh view data
     */
    refreshView(view) {
        switch(view) {
            case 'dashboard':
                if (window.Dashboard) window.Dashboard.render();
                break;
            case 'credentials':
                if (window.Credentials) window.Credentials.render();
                break;
            case 'cards':
                if (window.Cards) window.Cards.render();
                break;
            case 'income':
                if (window.Income) window.Income.render();
                break;
            case 'expenses':
                if (window.Expenses) window.Expenses.render();
                break;
            case 'recurring':
                if (window.RecurringExpenses) window.RecurringExpenses.render();
                break;
            case 'loans':
                if (window.Loans) window.Loans.render();
                break;
            case 'investments':
                if (window.Investments) window.Investments.render();
                break;
        }
    },

    /**
     * Open side menu
     */
    openMenu() {
        const menu = document.getElementById('side-menu');
        if (menu) {
            menu.classList.remove('hidden');
        }
    },

    /**
     * Close side menu
     */
    closeMenu() {
        const menu = document.getElementById('side-menu');
        if (menu) {
            menu.classList.add('hidden');
        }
    },

    /**
     * Toggle settings dropdown menu
     */
    toggleSettingsMenu(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('settings-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden');
        }
        
        // Close dropdown when clicking outside
        if (!dropdown.classList.contains('hidden')) {
            setTimeout(() => {
                document.addEventListener('click', this.closeSettingsMenuListener, { once: true });
            }, 0);
        }
    },

    /**
     * Close settings dropdown menu
     */
    closeSettingsMenu() {
        const dropdown = document.getElementById('settings-dropdown');
        if (dropdown) {
            dropdown.classList.add('hidden');
        }
    },

    /**
     * Listener for closing settings menu on outside click
     */
    closeSettingsMenuListener(event) {
        const dropdown = document.getElementById('settings-dropdown');
        const button = document.getElementById('settings-menu-btn');
        
        if (dropdown && button && !dropdown.contains(event.target) && !button.contains(event.target)) {
            Navigation.closeSettingsMenu();
        }
    },

    /**
     * Open settings modal
     */
    /**
     * Open Settings modal (for PIN and Master Password)
     */
    async openSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            // Load master password
            const masterPasswordInput = document.getElementById('master-password');
            if (masterPasswordInput) {
                masterPasswordInput.value = window.DB.security.masterPassword || '';
            }
            
            // Check biometric availability and show toggle if available
            console.log('⚙️ Opening settings, checking biometric...');
            const biometricToggle = document.getElementById('biometric-settings-toggle');
            const biometricCheckbox = document.getElementById('biometric-enabled-checkbox');
            
            console.log('Biometric toggle element:', biometricToggle);
            console.log('Biometric checkbox element:', biometricCheckbox);
            console.log('Security module available:', !!window.Security);
            
            if (biometricToggle && biometricCheckbox && window.Security) {
                console.log('🔍 Calling isBiometricAvailable...');
                const isAvailable = await window.Security.isBiometricAvailable();
                console.log('📊 Biometric available result:', isAvailable);
                
                if (isAvailable) {
                    console.log('✅ Biometric available! Showing toggle');
                    biometricToggle.classList.remove('hidden');
                    biometricCheckbox.checked = window.DB.security.biometricEnabled || false;
                    console.log('Current biometric enabled state:', window.DB.security.biometricEnabled);
                } else {
                    console.log('❌ Biometric not available, hiding toggle');
                    biometricToggle.classList.add('hidden');
                }
            } else {
                console.warn('⚠️ Missing elements or Security module:', {
                    toggle: !!biometricToggle,
                    checkbox: !!biometricCheckbox,
                    security: !!window.Security
                });
            }
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close Settings modal
     */
    closeSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Save Settings (PIN, Master Password, and Biometric)
     */
    async saveSettings() {
        const masterPasswordInput = document.getElementById('master-password');
        
        if (masterPasswordInput) {
            const masterPassword = masterPasswordInput.value.trim();
            
            if (masterPassword && masterPassword.length < 6) {
                window.Utils.showError('⚠️ Master password must be at least 6 characters long');
                return;
            }
            
            window.DB.security.masterPassword = masterPassword;
        }
        
        // Handle biometric toggle
        const biometricCheckbox = document.getElementById('biometric-enabled-checkbox');
        if (biometricCheckbox && window.Security) {
            const shouldEnable = biometricCheckbox.checked;
            const currentlyEnabled = window.DB.security.biometricEnabled;
            
            // Only update if changed
            if (shouldEnable !== currentlyEnabled) {
                try {
                    if (shouldEnable) {
                        await window.Security.enableBiometric();
                        window.Utils.showSuccess('✅ Biometric authentication enabled!');
                    } else {
                        await window.Security.disableBiometric();
                        window.Utils.showSuccess('✅ Biometric authentication disabled!');
                    }
                } catch (error) {
                    console.error('Biometric toggle error:', error);
                    window.Utils.showInfo('⚠️ ' + error.message, 'error');
                    // Revert checkbox state
                    biometricCheckbox.checked = currentlyEnabled;
                    return;
                }
            }
        }
        
        if (window.Storage.save()) {
            window.Utils.showSuccess('✅ Settings saved successfully!');
            this.closeSettings();
        }
    },
    
    /**
     * Open AI Settings modal
     */
    openAISettings() {
        const modal = document.getElementById('ai-settings-modal');
        if (modal) {
            // Load current AI settings
            const geminiKeyInput = document.getElementById('gemini-api-key');
            const groqKeyInput = document.getElementById('groq-api-key');
            const chatGptKeyInput = document.getElementById('chatgpt-api-key');
            const perplexityKeyInput = document.getElementById('perplexity-api-key');
            const providerSelect = document.getElementById('ai-provider');
            
            if (geminiKeyInput) geminiKeyInput.value = window.DB.settings.geminiApiKey || '';
            if (groqKeyInput) groqKeyInput.value = window.DB.groqApiKey || '';
            if (chatGptKeyInput) chatGptKeyInput.value = window.DB.settings.chatGptApiKey || '';
            if (perplexityKeyInput) perplexityKeyInput.value = window.DB.settings.perplexityApiKey || '';
            if (providerSelect) providerSelect.value = window.DB.settings.aiProvider || 'gemini';
            
            // Load priority order
            this.renderPriorityOrder();
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close AI Settings modal
     */
    closeAISettings() {
        const modal = document.getElementById('ai-settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Save AI Settings
     */
    saveAISettings() {
        const providerSelect = document.getElementById('ai-provider');
        const geminiKeyInput = document.getElementById('gemini-api-key');
        const groqKeyInput = document.getElementById('groq-api-key');
        const chatGptKeyInput = document.getElementById('chatgpt-api-key');
        const perplexityKeyInput = document.getElementById('perplexity-api-key');
        
        // Validate: Require both Groq and Gemini API keys
        const geminiKey = geminiKeyInput ? geminiKeyInput.value.trim() : '';
        const groqKey = groqKeyInput ? groqKeyInput.value.trim() : '';
        
        if (!geminiKey || !groqKey) {
            window.Utils.showError('⚠️ Both Gemini and Groq API keys are required!\n\n• Groq: Fast chat responses\n• Gemini: Card benefits & web search');
            return;
        }
        
        if (providerSelect) window.DB.settings.aiProvider = providerSelect.value;
        if (geminiKeyInput) window.DB.settings.geminiApiKey = geminiKey;
        if (groqKeyInput) window.DB.groqApiKey = groqKey;
        if (chatGptKeyInput) window.DB.settings.chatGptApiKey = chatGptKeyInput.value.trim();
        if (perplexityKeyInput) window.DB.settings.perplexityApiKey = perplexityKeyInput.value.trim();
        
        if (window.Storage.save()) {
            window.Utils.showSuccess('✅ AI Settings saved successfully!');
            this.closeAISettings();
        }
    },
    
    /**
     * Render priority order list
     * Groq is LOCKED at #1 (mandatory for chat), rest is configurable
     */
    renderPriorityOrder() {
        const container = document.getElementById('priority-order-list');
        if (!container) return;
        
        const priorityOrder = window.DB.settings.priorityOrder || ['groq', 'gemini', 'chatgpt', 'perplexity'];
        const providerNames = {
            'gemini': 'Google Gemini',
            'groq': 'Groq (Mixtral)',
            'chatgpt': 'OpenAI ChatGPT',
            'perplexity': 'Perplexity AI'
        };
        
        container.innerHTML = priorityOrder.map((provider, index) => {
            const isGroq = index === 0 && provider === 'groq';
            
            return `
            <div class="flex items-center ${isGroq ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' : 'bg-gray-50 border-gray-200'} rounded-lg p-2 border">
                <span class="w-8 h-8 flex items-center justify-center bg-gradient-to-br ${isGroq ? 'from-green-500 to-emerald-500' : 'from-purple-500 to-pink-500'} text-white rounded-lg text-sm font-bold mr-3">
                    ${index + 1}
                </span>
                <span class="flex-1 text-sm font-medium text-gray-700">
                    ${providerNames[provider]}
                    ${isGroq ? '<span class="text-xs text-green-600 ml-2">🔒 Fixed (Chat Priority)</span>' : ''}
                </span>
                ${isGroq ? `
                    <div class="flex gap-1">
                        <div class="w-7 h-7 flex items-center justify-center rounded bg-green-100 text-green-600" title="Groq is locked as #1 for fast chat">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                    </div>
                ` : `
                    <div class="flex gap-1">
                        <button 
                            onclick="Navigation.movePriority(${index}, -1)" 
                            ${index === 1 ? 'disabled' : ''}
                            class="w-7 h-7 flex items-center justify-center rounded ${index === 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'} transition-all"
                            title="${index === 1 ? 'Cannot move above Groq' : 'Move up'}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                            </svg>
                        </button>
                        <button 
                            onclick="Navigation.movePriority(${index}, 1)" 
                            ${index === priorityOrder.length - 1 ? 'disabled' : ''}
                            class="w-7 h-7 flex items-center justify-center rounded ${index === priorityOrder.length - 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'} transition-all"
                            title="${index === priorityOrder.length - 1 ? 'Already at bottom' : 'Move down'}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                    </div>
                `}
            </div>
        `}).join('');
    },
    
    /**
     * Move priority order
     * Groq (index 0) is LOCKED and cannot be moved
     */
    movePriority(index, direction) {
        const priorityOrder = window.DB.settings.priorityOrder || ['groq', 'gemini', 'chatgpt', 'perplexity'];
        const newIndex = index + direction;
        
        // Prevent moving Groq (index 0)
        if (index === 0 || newIndex === 0) {
            console.warn('Cannot move Groq - it is fixed at position #1 for chat priority');
            return;
        }
        
        // Validate new index
        if (newIndex < 1 || newIndex >= priorityOrder.length) return;
        
        // Swap elements
        [priorityOrder[index], priorityOrder[newIndex]] = [priorityOrder[newIndex], priorityOrder[index]];
        
        window.DB.settings.priorityOrder = priorityOrder;
        this.renderPriorityOrder();
    },

    /**
     * Open export modal
     */
    openExportModal() {
        const modal = document.getElementById('export-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    /**
     * Close export modal
     */
    closeExportModal() {
        const modal = document.getElementById('export-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    /**
     * Export data
     */
    async exportData() {
        const success = await window.Storage.exportData();
        if (success) {
            this.closeExportModal();
        }
    },

    /**
     * Open import modal
     */
    openImportModal() {
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    /**
     * Close import modal
     */
    closeImportModal() {
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    /**
     * Import data
     */
    async importData() {
        const fileInput = document.getElementById('import-file');
        const passwordInput = document.getElementById('import-password');
        
        if (!fileInput || !fileInput.files[0]) {
            window.Utils.showError('⚠️ Please select a file');
            return;
        }
        
        if (!passwordInput || !passwordInput.value) {
            window.Utils.showError('⚠️ Please enter your master password');
            return;
        }
        
        const file = fileInput.files[0];
        const password = passwordInput.value;
        
        const success = await window.Storage.importData(file, password);
        if (success) {
            // Clear password input
            passwordInput.value = '';
            this.closeImportModal();
            this.refreshView(this.currentView);
        }
    },
    
    /**
     * Open reset app modal
     */
    openResetModal() {
        const modal = document.getElementById('reset-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close reset app modal
     */
    closeResetModal() {
        const modal = document.getElementById('reset-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Show error modal (or info modal with different styling)
     */
    showErrorModal(title, message, type = 'error') {
        const modal = document.getElementById('error-modal');
        const titleEl = document.getElementById('error-modal-title');
        const messageEl = document.getElementById('error-modal-message');
        const iconContainer = modal?.querySelector('.bg-red-100');
        const button = modal?.querySelector('button');
        
        if (modal && titleEl && messageEl) {
            titleEl.textContent = title;
            messageEl.textContent = message;
            
            // Change styling based on type
            if (type === 'info') {
                // Change to blue/info styling
                titleEl.className = 'text-2xl font-bold text-center mb-3 text-blue-600';
                if (iconContainer) {
                    iconContainer.className = 'flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4';
                }
                if (button) {
                    button.className = 'w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 font-semibold';
                }
            } else {
                // Use red/error styling
                titleEl.className = 'text-2xl font-bold text-center mb-3 text-red-600';
                if (iconContainer) {
                    iconContainer.className = 'flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4';
                }
                if (button) {
                    button.className = 'w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 font-semibold';
                }
            }
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close error modal
     */
    closeErrorModal() {
        const modal = document.getElementById('error-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Show backup confirmation modal (step 1)
     */
    showBackupConfirm() {
        const modal = document.getElementById('backup-confirm-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Cancel backup confirmation
     */
    cancelBackupConfirm() {
        const modal = document.getElementById('backup-confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Proceed with export (step 1 confirmed)
     */
    async proceedWithExport() {
        try {
            // Close backup confirm modal
            this.cancelBackupConfirm();
            
            if (window.Loading) {
                window.Loading.show('Exporting backup...');
            }
            
            // Export data - this will fail if master password not set
            const exportResult = await window.Storage.exportData();
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            // Handle user cancellation
            if (exportResult === 'cancelled') {
                console.log('ℹ️ User cancelled backup export - reset cancelled');
                this.showErrorModal(
                    'ℹ️ Backup Cancelled',
                    'You cancelled the backup export.\n\n' +
                    'Reset has been cancelled.\n\n' +
                    'Backup is mandatory before reset.',
                    'info'
                );
                return;
            }
            
            // Handle export failure
            if (!exportResult) {
                this.showErrorModal(
                    '❌ Export Failed!',
                    'Cannot reset without backup.\n\n' +
                    'Please set master password in Settings first.\n\n' +
                    'Go to Settings → Master Password'
                );
                return;
            }
            
            // Show export success confirmation modal (step 2)
            const successModal = document.getElementById('export-success-modal');
            if (successModal) {
                successModal.classList.remove('hidden');
            }
            
        } catch (error) {
            console.error('Export error:', error);
            if (window.Loading) {
                window.Loading.hide();
            }
            this.showErrorModal(
                '❌ Export Failed!',
                `Error: ${error.message}\n\nPlease try again.`
            );
        }
    },
    
    /**
     * Cancel export success confirmation
     */
    cancelExportSuccess() {
        const modal = document.getElementById('export-success-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Confirm backup saved (step 2 confirmed)
     */
    async confirmBackupSaved() {
        try {
            // Close export success modal
            this.cancelExportSuccess();
            
            if (window.Loading) {
                window.Loading.show('Resetting app data...');
            }
            
            // Wait a moment for export to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // COMPLETELY FLUSH THE ENTIRE DB
            // Clear localStorage completely first
            localStorage.removeItem(window.Storage.STORAGE_KEY);
            
            // Get all keys from current DB to ensure complete cleanup
            const allKeys = Object.keys(window.DB);
            
            // Delete all properties from window.DB
            allKeys.forEach(key => {
                delete window.DB[key];
            });
            
            // Re-initialize DB to initial empty state
            // This ensures ANY new fields added in the future will be reset
            Object.assign(window.DB, {
                credentials: [],
                cards: [],
                expenses: [],
                investments: [],
                monthlyInvestments: [],
                recurringExpenses: [],
                loans: [],
                income: null,
                dismissedRecurringExpenses: [],
                chatHistory: [],
                exchangeRate: {
                    rate: 83,
                    lastUpdated: null
                },
                settings: {
                    aiProvider: 'gemini',
                    geminiApiKey: '',
                    groqApiKey: '',
                    chatGptApiKey: '',
                    perplexityApiKey: '',
                    priorityOrder: ['groq', 'gemini', 'chatgpt', 'perplexity']
                },
                groqApiKey: '',
                security: {
                    pinHash: null,
                    biometricEnabled: false,
                    isSetup: false,
                    masterPassword: ''
                }
            });
            
            window.Security.isUnlocked = false;
            
            // Save completely empty state
            window.Storage.save();
            
            console.log('✅ Complete DB flush - all fields reset to initial state');
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            // Show success message
            if (window.Toast) {
                window.Utils.showSuccess('✅ App reset successfully!\n\n🔐 Setting up new PIN...');
            }
            
            // Reload page to trigger PIN setup
            setTimeout(() => {
                window.location.reload();
            }, 2000);
            
        } catch (error) {
            console.error('Reset error:', error);
            if (window.Loading) {
                window.Loading.hide();
            }
            this.showErrorModal(
                '❌ Reset Failed!',
                `Error: ${error.message}\n\nPlease try again or contact support.`
            );
        }
    },
    
    /**
     * Reset app (initiates the mandatory backup flow)
     */
    async resetApp() {
        // Close the reset warning modal
        this.closeResetModal();
        
        // Show mandatory backup confirmation modal (step 1)
        this.showBackupConfirm();
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Navigation = Navigation;
}

