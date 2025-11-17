/**
 * Navigation Module
 * Handles app navigation, menus, and modals
 */

const Navigation = {
    currentView: 'chat',

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
            
            // Refresh view data
            this.refreshView(view);
        }
        
        this.closeMenu();
    },

    /**
     * Refresh view data
     */
    refreshView(view) {
        switch(view) {
            case 'credentials':
                if (window.Credentials) window.Credentials.render();
                break;
            case 'cards':
                if (window.Cards) window.Cards.render();
                break;
            case 'expenses':
                if (window.Expenses) window.Expenses.render();
                break;
            case 'recurring':
                if (window.RecurringExpenses) window.RecurringExpenses.render();
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
            const biometricToggle = document.getElementById('biometric-settings-toggle');
            const biometricCheckbox = document.getElementById('biometric-enabled-checkbox');
            
            if (biometricToggle && biometricCheckbox && window.Security) {
                const isAvailable = await window.Security.isBiometricAvailable();
                
                if (isAvailable) {
                    biometricToggle.classList.remove('hidden');
                    biometricCheckbox.checked = window.DB.security.biometricEnabled || false;
                } else {
                    biometricToggle.classList.add('hidden');
                }
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
                window.Toast.show('⚠️ Master password must be at least 6 characters long', 'error');
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
                        window.Toast.show('✅ Biometric authentication enabled!', 'success');
                    } else {
                        await window.Security.disableBiometric();
                        window.Toast.show('✅ Biometric authentication disabled!', 'success');
                    }
                } catch (error) {
                    console.error('Biometric toggle error:', error);
                    window.Toast.show('⚠️ ' + error.message, 'error');
                    // Revert checkbox state
                    biometricCheckbox.checked = currentlyEnabled;
                    return;
                }
            }
        }
        
        if (window.Storage.save()) {
            window.Toast.show('✅ Settings saved successfully!', 'success');
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
            window.Toast.show('⚠️ Both Gemini and Groq API keys are required!\n\n• Groq: Fast chat responses\n• Gemini: Card benefits & web search', 'error');
            return;
        }
        
        if (providerSelect) window.DB.settings.aiProvider = providerSelect.value;
        if (geminiKeyInput) window.DB.settings.geminiApiKey = geminiKey;
        if (groqKeyInput) window.DB.groqApiKey = groqKey;
        if (chatGptKeyInput) window.DB.settings.chatGptApiKey = chatGptKeyInput.value.trim();
        if (perplexityKeyInput) window.DB.settings.perplexityApiKey = perplexityKeyInput.value.trim();
        
        if (window.Storage.save()) {
            window.Toast.show('✅ AI Settings saved successfully!', 'success');
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
            window.Toast.show('⚠️ Please select a file', 'error');
            return;
        }
        
        if (!passwordInput || !passwordInput.value) {
            window.Toast.show('⚠️ Please enter your master password', 'error');
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
     * Reset app (export data first, then clear everything)
     */
    async resetApp() {
        try {
            this.closeResetModal();
            
            if (window.Loading) {
                window.Loading.show('Exporting backup...');
            }
            
            // First, export current data as backup
            await window.Storage.exportData();
            
            if (window.Loading) {
                window.Loading.show('Resetting app data...');
            }
            
            // Wait a moment for export to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Clear all data
            window.DB.credentials = [];
            window.DB.cards = [];
            window.DB.expenses = [];
            window.DB.investments = [];
            window.DB.chatHistory = [];
            window.DB.exchangeRate = {
                rate: 83,
                lastUpdated: null
            };
            window.DB.settings = {
                aiProvider: 'gemini',
                geminiApiKey: '',
                groqApiKey: '',
                chatGptApiKey: '',
                perplexityApiKey: '',
                priorityOrder: ['groq', 'gemini', 'chatgpt', 'perplexity']
            };
            window.DB.groqApiKey = '';
            
            // Reset security (clear PIN and master password)
            window.DB.security = {
                pinHash: null,
                biometricEnabled: false,
                isSetup: false,
                masterPassword: ''
            };
            window.Security.isUnlocked = false;
            
            // Save empty state
            window.Storage.save();
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            // Show success message
            if (window.Toast) {
                window.Toast.show('✅ App reset successfully!\n\n🔐 Setting up new PIN...', 'success');
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
            if (window.Toast) {
                window.Toast.show('Reset failed: ' + error.message, 'error');
            }
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Navigation = Navigation;
}

