/**
 * Plans Module
 * Handles future planned expenses with pending/completed tabs
 */

const Plans = {
    currentTab: 'pending', // 'pending' or 'completed'
    expandedItems: new Set(), // Track expanded plan IDs

    /**
     * Add a new plan
     */
    add(name, amount, description = '', createdDate = null, planByDate = null) {
        if (!name || !amount) {
            throw new Error('Item Name and amount are required');
        }

        const today = new Date().toISOString().split('T')[0];
        const plan = {
            id: Utils.generateId(),
            name: name.trim(),
            description: (description || '').trim(),
            amount: parseFloat(amount),
            createdDate: createdDate || today,
            planByDate: planByDate || null,
            completedOn: null,
            status: 'pending',
            createdAt: Utils.getCurrentTimestamp()
        };

        if (!window.DB.plans) window.DB.plans = [];
        window.DB.plans.push(plan);
        window.Storage.save();
        return plan;
    },

    /**
     * Update an existing plan
     */
    update(id, updates) {
        const plan = this.getById(id);
        if (!plan) throw new Error('Plan not found');

        if (updates.name !== undefined) plan.name = updates.name.trim();
        if (updates.description !== undefined) plan.description = (updates.description || '').trim();
        if (updates.amount !== undefined) plan.amount = parseFloat(updates.amount);
        if (updates.createdDate !== undefined) plan.createdDate = updates.createdDate;
        if (updates.planByDate !== undefined) plan.planByDate = updates.planByDate || null;
        if (updates.completedOn !== undefined) plan.completedOn = updates.completedOn;
        if (updates.status !== undefined) plan.status = updates.status;

        window.Storage.save();
        return plan;
    },

    /**
     * Mark a plan as completed
     */
    markCompleted(id, completedOn = null) {
        const plan = this.getById(id);
        if (!plan) throw new Error('Plan not found');

        plan.status = 'completed';
        plan.completedOn = completedOn || new Date().toISOString().split('T')[0];
        window.Storage.save();
        return plan;
    },

    /**
     * Mark a plan as pending (move back to pending tab)
     */
    markPending(id) {
        const plan = this.getById(id);
        if (!plan) throw new Error('Plan not found');

        plan.status = 'pending';
        plan.completedOn = null;
        window.Storage.save();
        return plan;
    },

    /**
     * Delete a plan
     */
    delete(id) {
        if (!window.DB.plans) return;
        window.DB.plans = window.DB.plans.filter(p => String(p.id) !== String(id));
        window.Storage.save();
    },

    /**
     * Get plan by ID
     */
    getById(id) {
        if (!window.DB.plans) return null;
        return window.DB.plans.find(p => String(p.id) === String(id));
    },

    /**
     * Get all plans (filtered by status)
     */
    getByStatus(status) {
        if (!window.DB.plans) return [];
        return window.DB.plans.filter(p => p.status === status);
    },

    /**
     * Switch between Pending/Completed tabs
     */
    switchTab(tab) {
        this.currentTab = tab;
        this.expandedItems.clear();
        this.render();
    },

    /**
     * Toggle expansion of a plan item
     */
    toggleExpand(id) {
        const idStr = String(id);
        if (this.expandedItems.has(idStr)) {
            this.expandedItems.delete(idStr);
        } else {
            this.expandedItems.add(idStr);
        }
        this.render();
    },

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    },

    /**
     * Render the plans view
     */
    render() {
        const container = document.getElementById('plans-list');
        if (!container) return;

        const plans = this.getByStatus(this.currentTab);
        const total = plans.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        // Update tab counts
        const pendingCount = this.getByStatus('pending').length;
        const completedCount = this.getByStatus('completed').length;
        const pendingTab = document.getElementById('plans-tab-pending');
        const completedTab = document.getElementById('plans-tab-completed');
        if (pendingTab) pendingTab.querySelector('.tab-count').textContent = pendingCount;
        if (completedTab) completedTab.querySelector('.tab-count').textContent = completedCount;

        // Apply active styling
        if (pendingTab && completedTab) {
            if (this.currentTab === 'pending') {
                pendingTab.className = 'flex-1 px-4 py-3 text-sm font-bold border-b-2 border-orange-500 text-orange-600 bg-orange-50';
                completedTab.className = 'flex-1 px-4 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            } else {
                pendingTab.className = 'flex-1 px-4 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700';
                completedTab.className = 'flex-1 px-4 py-3 text-sm font-bold border-b-2 border-green-500 text-green-600 bg-green-50';
            }
        }

        if (plans.length === 0) {
            const emptyMsg = this.currentTab === 'pending'
                ? 'No pending plans. Tap + to add one!'
                : 'No completed plans yet.';
            container.innerHTML = `
                <div class="text-center py-10 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    <p class="text-sm">${emptyMsg}</p>
                </div>
            `;
            return;
        }

        // Sort: pending by planByDate ascending (nulls last), completed by completedOn descending
        const sorted = [...plans].sort((a, b) => {
            if (this.currentTab === 'pending') {
                if (!a.planByDate && !b.planByDate) return 0;
                if (!a.planByDate) return 1;
                if (!b.planByDate) return -1;
                return new Date(a.planByDate) - new Date(b.planByDate);
            }
            return new Date(b.completedOn) - new Date(a.completedOn);
        });

        const isPending = this.currentTab === 'pending';
        const summaryGradient = isPending
            ? 'from-orange-600/80 to-amber-600/80'
            : 'from-green-600/80 to-emerald-600/80';

        const tableHTML = `
            <!-- Total Summary -->
            <div class="mb-3 p-3 rounded-xl bg-gradient-to-br ${summaryGradient} shadow-lg text-white">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-xs opacity-90">${isPending ? 'Total Pending' : 'Total Completed'}</p>
                        <p class="text-xs opacity-80">${plans.length} ${plans.length === 1 ? 'plan' : 'plans'}</p>
                    </div>
                    <span class="font-bold text-2xl">₹${Utils.formatIndianNumber(total)}</span>
                </div>
            </div>

            <!-- Plans Table -->
            <div class="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
                <!-- Table Header -->
                <div class="grid grid-cols-[1fr_auto_40px] gap-3 items-center px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    <span class="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Item Name</span>
                    <span class="text-[11px] font-bold text-gray-600 uppercase tracking-wider text-right">Amount</span>
                    <span></span>
                </div>

                <!-- Plans Rows -->
                <div class="divide-y divide-gray-100">
                    ${sorted.map(plan => this.renderPlanRow(plan)).join('')}
                </div>
            </div>
        `;

        container.innerHTML = tableHTML;
    },

    /**
     * Render a single plan row
     */
    renderPlanRow(plan) {
        const isExpanded = this.expandedItems.has(String(plan.id));
        const isPending = plan.status === 'pending';
        const amountTextColor = isPending ? 'text-orange-700' : 'text-green-700';
        const dotColor = isPending ? 'bg-orange-400' : 'bg-green-500';

        let subLine;
        if (isPending) {
            subLine = plan.planByDate
                ? `Plan by: ${this.formatDate(plan.planByDate)}`
                : `Added: ${this.formatDate(plan.createdDate)}`;
        } else {
            subLine = `Completed: ${this.formatDate(plan.completedOn)}`;
        }

        return `
            <div class="hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}">
                <div class="grid grid-cols-[1fr_auto_40px] gap-3 items-center px-4 py-3.5 cursor-pointer"
                     onclick="Plans.toggleExpand('${plan.id}')">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-2 h-2 rounded-full ${dotColor} flex-shrink-0"></span>
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-gray-800 truncate">${Utils.escapeHtml(plan.name)}</p>
                            <p class="text-[11px] text-gray-500 mt-0.5">${subLine}</p>
                        </div>
                    </div>
                    <span class="text-sm font-bold ${amountTextColor} text-right whitespace-nowrap">₹${Utils.formatIndianNumber(plan.amount)}</span>
                    <button class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all ${isExpanded ? 'rotate-180 bg-gray-200 text-gray-700' : ''}"
                            title="${isExpanded ? 'Collapse' : 'Expand'}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                </div>

                ${isExpanded ? `
                <div class="px-3 pb-3 pt-1 bg-gradient-to-br from-gray-50 to-white border-t border-gray-100">
                    ${plan.description ? `
                    <div class="mb-2">
                        <p class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Description</p>
                        <p class="text-xs text-gray-700">${Utils.escapeHtml(plan.description)}</p>
                    </div>
                    ` : ''}

                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <div>
                            <p class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Added On</p>
                            <p class="text-xs text-gray-700 font-medium">${this.formatDate(plan.createdDate)}</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Plan By</p>
                            <p class="text-xs ${plan.planByDate ? 'text-orange-700' : 'text-gray-400'} font-medium">${plan.planByDate ? this.formatDate(plan.planByDate) : '-'}</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Completed</p>
                            <p class="text-xs ${plan.completedOn ? 'text-green-700' : 'text-gray-400'} font-medium">${plan.completedOn ? this.formatDate(plan.completedOn) : '-'}</p>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-2">
                        ${isPending ? `
                            <button onclick="event.stopPropagation(); Plans.openCompleteModal('${plan.id}')"
                                    class="flex-1 px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all flex items-center justify-center gap-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                </svg>
                                Mark Complete
                            </button>
                        ` : `
                            <button onclick="event.stopPropagation(); Plans.handleMarkPending('${plan.id}')"
                                    class="flex-1 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all flex items-center justify-center gap-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                                </svg>
                                Move to Pending
                            </button>
                        `}
                        <button onclick="event.stopPropagation(); Plans.openModal('${plan.id}')"
                                class="px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                            Edit
                        </button>
                        <button onclick="event.stopPropagation(); Plans.handleDelete('${plan.id}')"
                                class="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-all flex items-center justify-center">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>
                            </svg>
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Open add/edit plan modal
     */
    openModal(id = null) {
        const modal = document.getElementById('plan-modal');
        if (!modal) return;

        const titleEl = document.getElementById('plan-modal-title');
        const idInput = document.getElementById('plan-modal-id');
        const nameInput = document.getElementById('plan-modal-name');
        const amountInput = document.getElementById('plan-modal-amount');
        const descInput = document.getElementById('plan-modal-description');
        const createdDateInput = document.getElementById('plan-modal-created-date');
        const planByDateInput = document.getElementById('plan-modal-plan-by-date');

        const today = new Date().toISOString().split('T')[0];

        if (id) {
            const plan = this.getById(id);
            if (!plan) return;
            if (titleEl) titleEl.textContent = 'Edit Plan';
            if (idInput) idInput.value = plan.id;
            if (nameInput) nameInput.value = plan.name;
            if (amountInput) amountInput.value = plan.amount;
            if (descInput) descInput.value = plan.description || '';
            if (createdDateInput) createdDateInput.value = plan.createdDate || today;
            if (planByDateInput) planByDateInput.value = plan.planByDate || '';
        } else {
            if (titleEl) titleEl.textContent = 'Add New Plan';
            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (amountInput) amountInput.value = '';
            if (descInput) descInput.value = '';
            if (createdDateInput) createdDateInput.value = today;
            if (planByDateInput) planByDateInput.value = '';
        }

        modal.classList.remove('hidden');
    },

    /**
     * Close add/edit modal
     */
    closeModal() {
        const modal = document.getElementById('plan-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Save plan from modal
     */
    saveFromModal() {
        const idInput = document.getElementById('plan-modal-id');
        const nameInput = document.getElementById('plan-modal-name');
        const amountInput = document.getElementById('plan-modal-amount');
        const descInput = document.getElementById('plan-modal-description');
        const createdDateInput = document.getElementById('plan-modal-created-date');
        const planByDateInput = document.getElementById('plan-modal-plan-by-date');

        const name = nameInput?.value.trim();
        const amount = amountInput?.value;
        const description = descInput?.value || '';
        const createdDate = createdDateInput?.value;
        const planByDate = planByDateInput?.value || null;

        if (!name) {
            window.Utils.showError('⚠️ Please enter an item name');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            window.Utils.showError('⚠️ Please enter a valid amount');
            return;
        }
        if (!createdDate) {
            window.Utils.showError('⚠️ Please select a created date');
            return;
        }
        if (planByDate && new Date(planByDate) < new Date(createdDate)) {
            window.Utils.showError('⚠️ Plan by date cannot be before created date');
            return;
        }

        try {
            const id = idInput?.value;
            if (id) {
                this.update(id, { name, amount, description, createdDate, planByDate });
                window.Utils.showSuccess('✅ Plan updated!');
            } else {
                this.add(name, amount, description, createdDate, planByDate);
                window.Utils.showSuccess('✅ Plan added!');
            }
            this.closeModal();
            this.render();
        } catch (e) {
            window.Utils.showError('❌ ' + e.message);
        }
    },

    /**
     * Open complete modal (lets user pick completion date)
     */
    openCompleteModal(id) {
        const plan = this.getById(id);
        if (!plan) return;

        const modal = document.getElementById('plan-complete-modal');
        if (!modal) return;

        const idInput = document.getElementById('plan-complete-id');
        const nameDisplay = document.getElementById('plan-complete-name');
        const dateInput = document.getElementById('plan-complete-date');

        if (idInput) idInput.value = plan.id;
        if (nameDisplay) nameDisplay.textContent = plan.name;
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        modal.classList.remove('hidden');
    },

    /**
     * Close complete modal
     */
    closeCompleteModal() {
        const modal = document.getElementById('plan-complete-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Confirm completion from modal
     */
    confirmComplete() {
        const idInput = document.getElementById('plan-complete-id');
        const dateInput = document.getElementById('plan-complete-date');

        const id = idInput?.value;
        const completedOn = dateInput?.value;

        if (!id || !completedOn) {
            window.Utils.showError('⚠️ Please select a completion date');
            return;
        }

        try {
            this.markCompleted(id, completedOn);
            window.Utils.showSuccess('✅ Plan marked as completed!');
            this.closeCompleteModal();
            this.render();
        } catch (e) {
            window.Utils.showError('❌ ' + e.message);
        }
    },

    /**
     * Handle mark pending action
     */
    handleMarkPending(id) {
        if (!confirm('Move this plan back to Pending?')) return;
        try {
            this.markPending(id);
            window.Utils.showSuccess('✅ Plan moved to Pending');
            this.render();
        } catch (e) {
            window.Utils.showError('❌ ' + e.message);
        }
    },

    /**
     * Handle delete action
     */
    handleDelete(id) {
        const plan = this.getById(id);
        if (!plan) return;
        if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
        try {
            this.delete(id);
            window.Utils.showSuccess('✅ Plan deleted');
            this.render();
        } catch (e) {
            window.Utils.showError('❌ ' + e.message);
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Plans = Plans;
}
