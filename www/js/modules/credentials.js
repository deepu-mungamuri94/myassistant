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
        
        if (!list) return;
        
        // Update count
        const totalCount = window.DB.credentials.length;
        if (countEl) {
            countEl.textContent = `${totalCount} credential${totalCount !== 1 ? 's' : ''}`;
        }
        
        if (window.DB.credentials.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 px-4">
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
        
        // Group credentials by tag
        const groupedByTag = {};
        window.DB.credentials.forEach(cred => {
            const tag = cred.tag || 'Untagged';
            if (!groupedByTag[tag]) {
                groupedByTag[tag] = [];
            }
            groupedByTag[tag].push(cred);
        });
        
        // Render grouped credentials
        list.innerHTML = Object.keys(groupedByTag).sort().map(tag => {
            const credentials = groupedByTag[tag];
            const count = credentials.length;
            
            return `
                <!-- Tag Group -->
                <div class="bg-gray-50">
                    <!-- Tag Header -->
                    <div class="flex justify-between items-center px-4 py-2 bg-gray-100 border-b border-gray-200">
                        <span class="font-semibold text-gray-700 text-sm">${Utils.escapeHtml(tag)}</span>
                        <span class="text-xs text-gray-500 font-medium">${count}</span>
                    </div>
                    
                    <!-- Credentials in this tag -->
                    <div class="divide-y divide-gray-200">
                        ${credentials.map(cred => {
                            const description = cred.description || cred.notes || '';
                            return `
                                <div class="px-4 py-3 hover:bg-blue-50 transition-colors">
                                    <!-- Line 1: Name and Actions -->
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="flex items-center gap-2 flex-1 min-w-0">
                                            <svg class="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/>
                                            </svg>
                                            <span class="font-semibold text-gray-800 text-sm truncate">${Utils.escapeHtml(cred.service)}</span>
                                        </div>
                                        
                                        <!-- Action Buttons -->
                                        <div class="flex gap-1 ml-2 flex-shrink-0">
                                            <button onclick="window.viewCredential(${cred.id});" class="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-all" title="View">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                                </svg>
                                            </button>
                                            <button onclick="window.openCredentialModal(${cred.id});" class="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-all" title="Edit">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                                </svg>
                                            </button>
                                            <button onclick="Credentials.deleteWithConfirm(${cred.id})" class="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-all" title="Delete">
                                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- Line 2: Description (full width) -->
                                    ${description ? `
                                        <p class="text-xs text-gray-600 leading-relaxed pl-6">${Utils.escapeHtml(description)}</p>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
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

