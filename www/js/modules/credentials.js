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
        
        if (!list) return;
        
        if (window.DB.credentials.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No credentials yet. Add your first one above!</p>';
            return;
        }
        
        list.innerHTML = window.DB.credentials.map(cred => {
            const description = cred.description || cred.notes || '';
            return `
                <div class="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200 hover:shadow-md transition-all">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-blue-800">${Utils.escapeHtml(cred.service)}</h4>
                                ${cred.tag ? `<span class="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">${Utils.escapeHtml(cred.tag)}</span>` : ''}
                            </div>
                            ${description ? `<p class="text-sm text-gray-600 mt-1">${Utils.escapeHtml(description)}</p>` : ''}
                        </div>
                        
                        <!-- Actions -->
                        <div class="flex gap-2 ml-2">
                            <button onclick="window.viewCredential(${cred.id});" class="text-blue-600 hover:text-blue-800" title="View details">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                            </button>
                            <button onclick="window.openCredentialModal(${cred.id});" class="text-green-600 hover:text-green-800" title="Edit">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="Credentials.deleteWithConfirm(${cred.id})" class="text-red-500 hover:text-red-700" title="Delete">
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
        window.Toast.show('Credential deleted', 'success');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Credentials = Credentials;
}

