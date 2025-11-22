/**
 * Credentials Module
 * Handles secure credential management
 */

const Credentials = {
    /**
     * Add a new credential
     */
    add(service, username, password, description = '', additionalDetails = '', tag = '') {
        if (!service || !username || !password) {
            throw new Error('Please fill in all required fields');
        }
        
        const credential = {
            id: Utils.generateId(),
            service,
            username,
            password,
            description,
            additionalDetails,
            notes: description, // Keep for backward compatibility
            tag,
            createdAt: Utils.getCurrentTimestamp()
        };
        
        window.DB.credentials.push(credential);
        window.Storage.save();
        
        return credential;
    },

    /**
     * Update a credential
     */
    update(id, service, username, password, description = '', additionalDetails = '', tag = '') {
        if (!service || !username || !password) {
            throw new Error('Please fill in all required fields');
        }
        
        const credential = this.getById(id);
        if (credential) {
            credential.service = service;
            credential.username = username;
            credential.password = password;
            credential.description = description;
            credential.additionalDetails = additionalDetails;
            credential.notes = description; // Keep for backward compatibility
            credential.tag = tag || '';
            credential.lastUpdated = Utils.getCurrentTimestamp();
            window.Storage.save();
        }
        
        return credential;
    },

    /**
     * Delete a credential
     */
    delete(id) {
        window.DB.credentials = window.DB.credentials.filter(c => c.id !== id);
        window.Storage.save();
    },

    /**
     * Get all credentials
     */
    getAll() {
        return window.DB.credentials;
    },

    /**
     * Get credential by ID
     */
    getById(id) {
        // Convert to string to handle both string and number IDs
        const searchId = String(id);
        return window.DB.credentials.find(c => String(c.id) === searchId);
    },

    /**
     * Render credentials list
     */
    render() {
        const list = document.getElementById('credentials-list');
        const countEl = document.getElementById('credentials-count');
        const countNumEl = document.getElementById('credentials-count-number');
        
        if (!list) return;
        
        // Update count
        const totalCount = window.DB.credentials.length;
        if (countEl) {
            countEl.textContent = `${totalCount} credential${totalCount !== 1 ? 's' : ''}`;
        }
        if (countNumEl) {
            countNumEl.textContent = totalCount;
        }
        
        if (window.DB.credentials.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16">
                    <div class="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-full p-6 mb-4">
                        <svg class="w-16 h-16 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <p class="text-gray-500 text-center font-medium">No credentials yet</p>
                    <p class="text-gray-400 text-sm text-center mt-1">Tap the + button to add your first one</p>
                </div>
            `;
            return;
        }
        
        list.innerHTML = window.DB.credentials.map(cred => {
            const description = cred.description || cred.notes || '';
            return `
                <div class="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100">
                    <!-- Card Header with Gradient -->
                    <div class="bg-gradient-to-r from-blue-500 to-cyan-600 px-4 py-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                <svg class="w-5 h-5 text-white/90 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/>
                                </svg>
                                <h4 class="font-bold text-white text-base truncate">${Utils.escapeHtml(cred.service)}</h4>
                            </div>
                            ${cred.tag ? `<span class="text-xs bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full font-medium ml-2 flex-shrink-0">${Utils.escapeHtml(cred.tag)}</span>` : ''}
                        </div>
                    </div>
                    
                    <!-- Card Body -->
                    <div class="px-4 py-3">
                        <div class="flex items-center gap-2 mb-2">
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                            </svg>
                            <span class="text-sm text-gray-700 font-medium">${Utils.escapeHtml(cred.username)}</span>
                        </div>
                        ${description ? `
                            <div class="flex items-start gap-2 mb-3">
                                <svg class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <p class="text-xs text-gray-600 leading-relaxed">${Utils.escapeHtml(description)}</p>
                            </div>
                        ` : ''}
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-2 pt-2 border-t border-gray-100">
                            <button onclick="window.viewCredential(${cred.id});" class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:shadow-md transition-all text-sm font-medium" title="View details">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                                View
                            </button>
                            <button onclick="window.openCredentialModal(${cred.id});" class="px-3 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-all" title="Edit">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="Credentials.deleteWithConfirm(${cred.id})" class="px-3 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all" title="Delete">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },


    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this credential. Are you sure?',
            'Delete Credential'
        );
        if (!confirmed) return;
        
        this.delete(id);
        this.render();
        Utils.showSuccess('Credential deleted');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Credentials = Credentials;
}

