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
     * Render money lent list with Active/Closed tabs
     */
    renderList(tabFilter = 'active') {
        const records = this.getAll();
        
        // Sort by date given (oldest first)
        records.sort((a, b) => new Date(a.dateGiven) - new Date(b.dateGiven));
        
        // Separate by status
        const pending = records.filter(r => this.getStatus(r) === 'Pending');
        const partial = records.filter(r => this.getStatus(r) === 'Partially Returned');
        const completed = records.filter(r => this.getStatus(r) === 'Fully Returned');
        
        // Filter based on tab
        const activeRecords = [...pending, ...partial];
        const closedRecords = completed;
        const displayRecords = tabFilter === 'active' ? activeRecords : closedRecords;
        
        if (displayRecords.length === 0) {
            return `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">${tabFilter === 'active' ? '🤝' : '✅'}</div>
                    <p class="text-gray-500 text-sm">No ${tabFilter === 'active' ? 'active' : 'closed'} lent out records</p>
                    ${tabFilter === 'active' ? '<p class="text-gray-400 text-xs mt-2">Use the + button below to add your first record</p>' : ''}
                </div>
            `;
        }
        
        let html = `
            <!-- Records List -->
            <div class="space-y-3">
        `;
        
        // Render records
        displayRecords.forEach(record => {
            html += this.renderRecordCard(record);
        });
        
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
            <div class="bg-gradient-to-br ${bgColor} rounded-xl border-2 ${borderColor} hover:shadow-md transition-all p-3">
                <!-- First Line: Person Name (left) and Action Icons (right) -->
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-gray-900 text-sm">👤 ${Utils.escapeHtml(record.personName)}</h4>
                        <span class="px-2 py-0.5 ${statusBg} ${statusColor} rounded-full text-[10px] font-semibold">${status}</span>
                        ${isOverdue ? '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] font-semibold">⏰</span>' : ''}
                    </div>
                    <div class="flex gap-1">
                        ${outstanding > 0 ? `
                            <button onclick="openRecordReturnModal(${record.id})" class="text-green-600 hover:text-green-800 p-0.5" title="Record Payment">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            </button>
                        ` : ''}
                        ${record.returns && record.returns.length > 0 ? `
                            <button onclick="MoneyLent.showReturnsHistoryModal(${record.id})" class="text-teal-600 hover:text-teal-800 p-0.5" title="Returns History">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                                </svg>
                            </button>
                        ` : ''}
                        <button onclick="openMoneyLentModal(${record.id})" class="text-blue-600 hover:text-blue-800 p-0.5" title="Edit">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="MoneyLent.delete(${record.id})" class="text-red-600 hover:text-red-800 p-0.5" title="Delete">
                            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Second Line: Purpose and Notes -->
                <div class="mb-2">
                    <p class="text-xs text-gray-600">
                        <strong>Purpose:</strong> ${Utils.escapeHtml(record.purpose)}
                    </p>
                    ${record.notes ? `<p class="text-xs text-gray-500 italic mt-0.5">${Utils.escapeHtml(record.notes)}</p>` : ''}
                </div>
                
                <!-- Third Line: Amount Lent (left) and Outstanding (right) -->
                <div class="flex justify-between items-center mb-2">
                    <div>
                        <p class="text-[10px] text-gray-500">Amount Lent</p>
                        <p class="font-bold text-gray-900 text-sm">₹${Utils.formatIndianNumber(record.amount)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-gray-500">Outstanding</p>
                        <p class="font-bold ${outstanding > 0 ? 'text-red-700' : 'text-green-700'} text-base">₹${Utils.formatIndianNumber(outstanding)}</p>
                    </div>
                </div>
                
                <!-- Dates: Given (left) and Expected (right) -->
                <div class="flex justify-between text-[11px] text-gray-500">
                    <div>
                        <span class="text-[10px] block text-gray-400">Given:</span>
                        <span class="font-medium">${dateGiven.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    ${expectedDate ? `
                        <div class="text-right">
                            <span class="text-[10px] block text-gray-400">Expected:</span>
                            <span class="font-medium">${expectedDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}</span>
                        </div>
                    ` : ''}
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
    },
    
    /**
     * Show returns history modal
     */
    showReturnsHistoryModal(recordId) {
        const record = this.getById(recordId);
        if (!record) {
            Utils.showError('Record not found');
            return;
        }
        
        const totalReturned = this.calculateTotalReturned(record);
        const outstanding = this.calculateOutstanding(record);
        
        let modalHtml = `
            <div id="returns-history-modal" class="fixed inset-0 bg-black bg-opacity-80 z-[10000] flex items-center justify-center p-4" onclick="if(event.target===this) MoneyLent.closeReturnsHistoryModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
                    <div class="sticky top-0 bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                        <h2 class="text-xl font-bold text-white">Returns History</h2>
                        <button onclick="MoneyLent.closeReturnsHistoryModal()" class="text-white hover:text-gray-200 p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="p-6">
                        <!-- Record Info -->
                        <div class="mb-4 bg-gray-50 rounded-lg p-3">
                            <p class="text-sm font-semibold text-gray-800 mb-1">👤 ${Utils.escapeHtml(record.personName)}</p>
                            <p class="text-xs text-gray-600"><strong>Purpose:</strong> ${Utils.escapeHtml(record.purpose)}</p>
                            <div class="flex justify-between mt-2 pt-2 border-t border-gray-200">
                                <div>
                                    <p class="text-[10px] text-gray-500">Amount Lent</p>
                                    <p class="text-sm font-bold text-gray-900">₹${Utils.formatIndianNumber(record.amount)}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-[10px] text-gray-500">Outstanding</p>
                                    <p class="text-sm font-bold ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}">₹${Utils.formatIndianNumber(outstanding)}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Returns List -->
                        ${record.returns && record.returns.length > 0 ? `
                            <div class="space-y-2">
                                <p class="text-xs font-semibold text-gray-700 mb-2">Payment History</p>
                                ${record.returns.map((ret, idx) => {
                                    const returnDate = new Date(ret.returnDate + '-01');
                                    return `
                                    <div class="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-200">
                                        <div>
                                            <p class="text-xs font-semibold text-gray-800">₹${Utils.formatIndianNumber(ret.amountReturned)}</p>
                                            <p class="text-[10px] text-gray-500">${returnDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}</p>
                                        </div>
                                        <button onclick="MoneyLent.deleteReturnFromModal(${record.id}, ${idx})" class="text-red-600 hover:text-red-800 p-1" title="Delete">
                                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                            </svg>
                                        </button>
                                    </div>
                                `;
                                }).join('')}
                                <div class="pt-2 mt-2 border-t border-gray-200">
                                    <div class="flex justify-between text-sm">
                                        <span class="font-semibold text-gray-700">Total Returned:</span>
                                        <span class="font-bold text-green-700">₹${Utils.formatIndianNumber(totalReturned)}</span>
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <p class="text-center text-gray-500 text-sm py-4">No returns recorded yet</p>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existing = document.getElementById('returns-history-modal');
        if (existing) existing.remove();
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    /**
     * Close returns history modal
     */
    closeReturnsHistoryModal() {
        const modal = document.getElementById('returns-history-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Delete return from modal
     */
    async deleteReturnFromModal(recordId, returnIndex) {
        await this.deleteReturnWithConfirm(recordId, returnIndex);
        // Close and reopen modal to refresh
        this.closeReturnsHistoryModal();
        setTimeout(() => {
            this.showReturnsHistoryModal(recordId);
        }, 100);
    }
};

// Export to global
window.MoneyLent = MoneyLent;

