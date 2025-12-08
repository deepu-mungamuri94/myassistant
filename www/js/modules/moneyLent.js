/**
 * Money Lent Module
 * Tracks money lent to others with return tracking
 */

const MoneyLent = {
    
    /**
     * Add a new money lent record
     */
    add(personName, amount, dateGiven, purpose, expectedReturnDate = '', notes = '') {
        if (!personName || !amount || !dateGiven || !purpose) {
            throw new Error('All required fields must be filled');
        }
        
        const record = {
            id: Utils.generateId(),
            personName: personName.trim(),
            amount: parseFloat(amount),
            dateGiven: dateGiven,
            purpose: purpose.trim(),
            expectedReturnDate: expectedReturnDate,
            notes: notes ? notes.trim() : '',
            returns: [], // Array of {returnDate, amountReturned}
            createdAt: Utils.getCurrentTimestamp()
        };
        
        window.DB.moneyLent.push(record);
        window.Storage.save();
        
        return record;
    },
    
    /**
     * Update a money lent record
     */
    update(id, personName, amount, dateGiven, purpose, expectedReturnDate = '', notes = '') {
        const record = this.getById(id);
        if (!record) throw new Error('Record not found');
        
        record.personName = personName.trim();
        record.amount = parseFloat(amount);
        record.dateGiven = dateGiven;
        record.purpose = purpose.trim();
        record.expectedReturnDate = expectedReturnDate || '';
        record.notes = notes ? notes.trim() : '';
        record.lastUpdated = Utils.getCurrentTimestamp();
        
        window.Storage.save();
        return record;
    },
    
    /**
     * Delete a money lent record
     */
    async delete(id) {
        const record = this.getById(id);
        if (!record) throw new Error('Record not found');
        
        const totalReturned = this.calculateTotalReturned(record);
        const outstanding = record.amount - totalReturned;
        
        let message = `Delete record for "${record.personName}"?\n\nAmount: ₹${Utils.formatIndianNumber(record.amount)}`;
        
        if (outstanding > 0) {
            message += `\n⚠️ Outstanding: ₹${Utils.formatIndianNumber(outstanding)}`;
        }
        
        message += '\n\nThis action cannot be undone.';
        
        const confirmed = await Utils.confirm(message, 'Delete Record');
        
        if (!confirmed) return false;
        
        const index = window.DB.moneyLent.findIndex(r => String(r.id) === String(id));
        if (index !== -1) {
            window.DB.moneyLent.splice(index, 1);
            window.Storage.save();
            Utils.showSuccess('Record deleted successfully');
        }
        return true;
    },
    
    /**
     * Get record by ID
     */
    getById(id) {
        return window.DB.moneyLent.find(r => String(r.id) === String(id));
    },
    
    /**
     * Get all records
     */
    getAll() {
        return window.DB.moneyLent || [];
    },
    
    /**
     * Record a return payment
     */
    recordReturn(recordId, returnDate, amountReturned) {
        if (!returnDate || !amountReturned || amountReturned <= 0) {
            throw new Error('Valid return date and amount are required');
        }
        
        const record = this.getById(recordId);
        if (!record) throw new Error('Record not found');
        
        const totalReturned = this.calculateTotalReturned(record);
        const outstanding = record.amount - totalReturned;
        
        if (amountReturned > outstanding) {
            throw new Error(`Amount cannot exceed outstanding balance of ₹${Utils.formatIndianNumber(outstanding)}`);
        }
        
        if (!record.returns) {
            record.returns = [];
        }
        
        record.returns.push({
            returnDate: returnDate,
            amountReturned: parseFloat(amountReturned),
            recordedAt: Utils.getCurrentTimestamp()
        });
        
        window.Storage.save();
        return record;
    },
    
    /**
     * Delete a return payment
     */
    deleteReturn(recordId, returnIndex) {
        const record = this.getById(recordId);
        if (!record) throw new Error('Record not found');
        
        if (!record.returns || returnIndex < 0 || returnIndex >= record.returns.length) {
            throw new Error('Return payment not found');
        }
        
        record.returns.splice(returnIndex, 1);
        window.Storage.save();
        return record;
    },
    
    /**
     * Calculate total amount returned for a record
     */
    calculateTotalReturned(record) {
        if (!record.returns || record.returns.length === 0) {
            return 0;
        }
        return record.returns.reduce((sum, ret) => sum + parseFloat(ret.amountReturned), 0);
    },
    
    /**
     * Calculate outstanding balance for a record
     */
    calculateOutstanding(record) {
        return record.amount - this.calculateTotalReturned(record);
    },
    
    /**
     * Get status of a record
     */
    getStatus(record) {
        const totalReturned = this.calculateTotalReturned(record);
        
        if (totalReturned === 0) {
            return 'Pending';
        } else if (totalReturned < record.amount) {
            return 'Partially Returned';
        } else {
            return 'Fully Returned';
        }
    },
    
    /**
     * Calculate totals for all records
     */
    calculateTotals() {
        const records = this.getAll();
        
        let totalLent = 0;
        let totalReturned = 0;
        let totalOutstanding = 0;
        
        records.forEach(record => {
            totalLent += record.amount;
            const returned = this.calculateTotalReturned(record);
            totalReturned += returned;
            totalOutstanding += (record.amount - returned);
        });
        
        return {
            totalLent: totalLent,
            totalReturned: totalReturned,
            totalOutstanding: totalOutstanding,
            count: records.length
        };
    },
    
    /**
     * Render money lent list
     */
    renderList() {
        const records = this.getAll();
        
        // Sort by date given (oldest first)
        records.sort((a, b) => new Date(a.dateGiven) - new Date(b.dateGiven));
        
        if (records.length === 0) {
            return `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">🤝</div>
                    <p class="text-gray-500 text-sm">No lent out records yet</p>
                    <p class="text-gray-400 text-xs mt-2">Use the + button below to add your first record</p>
                </div>
            `;
        }
        
        // Separate by status
        const pending = records.filter(r => this.getStatus(r) === 'Pending');
        const partial = records.filter(r => this.getStatus(r) === 'Partially Returned');
        const completed = records.filter(r => this.getStatus(r) === 'Fully Returned');
        
        let html = `
            <!-- Records List -->
            <div class="space-y-3">
        `;
        
        // Render pending and partial returns first
        [...pending, ...partial].forEach(record => {
            html += this.renderRecordCard(record);
        });
        
        // Render completed in a collapsible section if any exist
        if (completed.length > 0) {
            html += `
                <details class="bg-green-50 rounded-xl border-2 border-green-200 overflow-hidden">
                    <summary class="cursor-pointer p-4 hover:bg-green-100 transition-colors select-none list-none">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <svg class="w-5 h-5 text-green-700 transition-transform duration-200 chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <div>
                                    <h4 class="font-bold text-green-800">Fully Returned</h4>
                                    <p class="text-xs text-green-600">${completed.length} record${completed.length !== 1 ? 's' : ''}</p>
                                </div>
                            </div>
                        </div>
                    </summary>
                    
                    <div class="p-4 pt-2 space-y-3">
                        ${completed.map(record => this.renderRecordCard(record)).join('')}
                    </div>
                </details>
            `;
        }
        
        html += `</div>`;
        
        return html;
    },
    
    /**
     * Render individual record card
     */
    renderRecordCard(record) {
        const totalReturned = this.calculateTotalReturned(record);
        const outstanding = this.calculateOutstanding(record);
        const status = this.getStatus(record);
        
        // Determine colors based on status
        let borderColor = 'border-orange-300';
        let bgColor = 'from-orange-50 via-white to-amber-50';
        let statusColor = 'text-orange-700';
        let statusBg = 'bg-orange-100';
        
        if (status === 'Fully Returned') {
            borderColor = 'border-green-300';
            bgColor = 'from-green-50 via-white to-emerald-50';
            statusColor = 'text-green-700';
            statusBg = 'bg-green-100';
        } else if (status === 'Partially Returned') {
            borderColor = 'border-blue-300';
            bgColor = 'from-blue-50 via-white to-cyan-50';
            statusColor = 'text-blue-700';
            statusBg = 'bg-blue-100';
        }
        
        const dateGiven = new Date(record.dateGiven);
        const expectedDate = record.expectedReturnDate ? new Date(record.expectedReturnDate + '-01') : null;
        const today = new Date();
        const isOverdue = status !== 'Fully Returned' && expectedDate && expectedDate < today;
        
        return `
            <div class="bg-gradient-to-br ${bgColor} rounded-xl border-2 ${borderColor} hover:shadow-lg transition-all p-4">
                <!-- Header -->
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <h4 class="font-bold text-gray-900 text-base">👤 ${Utils.escapeHtml(record.personName)}</h4>
                            <span class="px-2 py-0.5 ${statusBg} ${statusColor} rounded-full text-xs font-semibold">${status}</span>
                            ${isOverdue ? '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">⏰ Overdue</span>' : ''}
                        </div>
                        <p class="text-xs text-gray-600 mb-1">
                            <strong>Purpose:</strong> ${Utils.escapeHtml(record.purpose)}
                        </p>
                        ${record.notes ? `<p class="text-xs text-gray-500 italic">${Utils.escapeHtml(record.notes)}</p>` : ''}
                    </div>
                </div>
                
                <!-- Amount Info -->
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div class="bg-white bg-opacity-60 p-2 rounded-lg">
                        <p class="text-xs text-gray-600">Amount Lent</p>
                        <p class="font-bold text-gray-900">₹${Utils.formatIndianNumber(record.amount)}</p>
                    </div>
                    <div class="bg-white bg-opacity-60 p-2 rounded-lg">
                        <p class="text-xs text-gray-600">Outstanding</p>
                        <p class="font-bold ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}">₹${Utils.formatIndianNumber(outstanding)}</p>
                    </div>
                </div>
                
                <!-- Dates -->
                <div class="flex justify-between text-xs text-gray-600 mb-3">
                    <span>📅 Given: ${dateGiven.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span>🗓️ Expected: ${expectedDate ? expectedDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' }) : 'Not specified'}</span>
                </div>
                
                <!-- Returns History -->
                ${record.returns && record.returns.length > 0 ? `
                    <details class="mb-3 bg-white bg-opacity-40 rounded-lg">
                        <summary class="cursor-pointer p-2 text-xs font-semibold text-gray-700 hover:bg-white hover:bg-opacity-60 rounded-lg transition-all">
                            💰 Returns History (${record.returns.length})
                        </summary>
                        <div class="p-2 space-y-1">
                            ${record.returns.map((ret, idx) => {
                                const returnDate = new Date(ret.returnDate + '-01');
                                return `
                                <div class="flex justify-between items-center text-xs bg-green-50 p-2 rounded">
                                    <span class="text-gray-700">${returnDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}: ₹${Utils.formatIndianNumber(ret.amountReturned)}</span>
                                    <button onclick="MoneyLent.deleteReturnWithConfirm(${record.id}, ${idx})" class="text-red-600 hover:text-red-800 px-1" title="Delete">
                                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                        </svg>
                                    </button>
                                </div>
                            `;
                            }).join('')}
                        </div>
                    </details>
                ` : ''}
                
                <!-- Action Buttons -->
                <div class="flex gap-2">
                    ${outstanding > 0 ? `
                        <button onclick="openRecordReturnModal(${record.id})" class="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-all font-semibold text-sm">
                            💵 Record Return
                        </button>
                    ` : ''}
                    <button onclick="openMoneyLentModal(${record.id})" class="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all font-semibold text-sm">
                        ✏️ Edit
                    </button>
                    <button onclick="MoneyLent.delete(${record.id})" class="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all font-semibold text-sm">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    },
    
    /**
     * Delete return with confirmation
     */
    async deleteReturnWithConfirm(recordId, returnIndex) {
        const record = this.getById(recordId);
        if (!record || !record.returns || returnIndex < 0 || returnIndex >= record.returns.length) {
            Utils.showError('Return payment not found');
            return;
        }
        
        const returnPayment = record.returns[returnIndex];
        const returnDate = new Date(returnPayment.returnDate + '-01');
        const confirmed = await Utils.confirm(
            `Delete return payment of ₹${Utils.formatIndianNumber(returnPayment.amountReturned)} from ${returnDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}?`,
            'Delete Return Payment'
        );
        
        if (confirmed) {
            this.deleteReturn(recordId, returnIndex);
            Utils.showSuccess('Return payment deleted');
            // Re-render the loans page to update the lent out tab
            if (window.Loans && window.Loans.render) {
                window.Loans.render();
            }
        }
    }
};

// Export to global
window.MoneyLent = MoneyLent;

