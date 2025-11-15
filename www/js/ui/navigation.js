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
    openSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            // Load current settings
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
     * Render priority order list
     */
    renderPriorityOrder() {
        const container = document.getElementById('priority-order-list');
        if (!container) return;
        
        const priorityOrder = window.DB.settings.priorityOrder || ['gemini', 'groq', 'chatgpt', 'perplexity'];
        const providerNames = {
            'gemini': 'Google Gemini',
            'groq': 'Groq (Mixtral)',
            'chatgpt': 'OpenAI ChatGPT',
            'perplexity': 'Perplexity AI'
        };
        
        container.innerHTML = priorityOrder.map((provider, index) => `
            <div class="flex items-center bg-gray-50 rounded-lg p-2 border border-gray-200">
                <span class="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold mr-3">
                    ${index + 1}
                </span>
                <span class="flex-1 text-sm font-medium text-gray-700">
                    ${providerNames[provider]}
                </span>
                <div class="flex gap-1">
                    <button 
                        onclick="Navigation.movePriority(${index}, -1)" 
                        ${index === 0 ? 'disabled' : ''}
                        class="w-7 h-7 flex items-center justify-center rounded ${index === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'} transition-all">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                        </svg>
                    </button>
                    <button 
                        onclick="Navigation.movePriority(${index}, 1)" 
                        ${index === priorityOrder.length - 1 ? 'disabled' : ''}
                        class="w-7 h-7 flex items-center justify-center rounded ${index === priorityOrder.length - 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'} transition-all">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    /**
     * Move priority order
     */
    movePriority(index, direction) {
        const priorityOrder = window.DB.settings.priorityOrder || ['gemini', 'groq', 'chatgpt', 'perplexity'];
        const newIndex = index + direction;
        
        if (newIndex < 0 || newIndex >= priorityOrder.length) return;
        
        // Swap elements
        [priorityOrder[index], priorityOrder[newIndex]] = [priorityOrder[newIndex], priorityOrder[index]];
        
        window.DB.settings.priorityOrder = priorityOrder;
        this.renderPriorityOrder();
    },

    /**
     * Close settings modal
     */
    closeSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    /**
     * Save settings
     */
    saveSettings() {
        const providerSelect = document.getElementById('ai-provider');
        const geminiKeyInput = document.getElementById('gemini-api-key');
        const groqKeyInput = document.getElementById('groq-api-key');
        const chatGptKeyInput = document.getElementById('chatgpt-api-key');
        const perplexityKeyInput = document.getElementById('perplexity-api-key');
        
        if (providerSelect) window.DB.settings.aiProvider = providerSelect.value;
        if (geminiKeyInput) window.DB.settings.geminiApiKey = geminiKeyInput.value.trim();
        if (groqKeyInput) window.DB.groqApiKey = groqKeyInput.value.trim();
        if (chatGptKeyInput) window.DB.settings.chatGptApiKey = chatGptKeyInput.value.trim();
        if (perplexityKeyInput) window.DB.settings.perplexityApiKey = perplexityKeyInput.value.trim();
        
        if (window.Storage.save()) {
            window.Toast.show('Settings saved successfully!', 'success');
            this.closeSettings();
        }
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
        if (!fileInput || !fileInput.files[0]) {
            window.Toast.show('Please select a file', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        
        const success = await window.Storage.importData(file);
        if (success) {
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
                chatGptApiKey: '',
                perplexityApiKey: ''
            };
            
            // Save empty state
            window.Storage.save();
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            // Show success message
            if (window.Toast) {
                window.Toast.show('✅ App reset successfully! Backup saved.', 'success');
            }
            
            // Refresh current view
            setTimeout(() => {
                this.navigateTo('chat');
                this.refreshView('chat');
            }, 1500);
            
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

