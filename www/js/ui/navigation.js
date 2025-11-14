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
            const chatGptKeyInput = document.getElementById('chatgpt-api-key');
            const perplexityKeyInput = document.getElementById('perplexity-api-key');
            const providerSelect = document.getElementById('ai-provider');
            
            if (geminiKeyInput) geminiKeyInput.value = window.DB.settings.geminiApiKey || '';
            if (chatGptKeyInput) chatGptKeyInput.value = window.DB.settings.chatGptApiKey || '';
            if (perplexityKeyInput) perplexityKeyInput.value = window.DB.settings.perplexityApiKey || '';
            if (providerSelect) providerSelect.value = window.DB.settings.aiProvider || 'gemini';
            
            modal.classList.remove('hidden');
        }
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
        const chatGptKeyInput = document.getElementById('chatgpt-api-key');
        const perplexityKeyInput = document.getElementById('perplexity-api-key');
        
        if (providerSelect) window.DB.settings.aiProvider = providerSelect.value;
        if (geminiKeyInput) window.DB.settings.geminiApiKey = geminiKeyInput.value.trim();
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

