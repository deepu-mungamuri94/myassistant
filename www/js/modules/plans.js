/**
 * Plans Module
 * Handles future planned expenses with pending/completed tabs
 */

const Plans = {
    currentTab: 'pending', // 'pending' or 'completed'
    expandedItems: new Set(), // Track expanded plan IDs
    // Sort state for the Priority column. 'none' = insertion order (default,
    // matches the legacy "as added" behaviour). Click the header to cycle
    // none → asc → desc → none.
    sortMode: 'none',

    /**
     * Add a new plan
     */
    add(input) {
        // Backwards-compat: support both the new object form and the old
        // positional signature (name, amount, description, createdDate, planByDate).
        const opts = (typeof input === 'string' || typeof input === 'undefined')
            ? { name: arguments[0], amount: arguments[1], description: arguments[2], createdDate: arguments[3], planByDate: arguments[4] }
            : (input || {});

        const { name, amount, description = '', createdDate = null, planByDate = null,
                type = null, priority = null } = opts;

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
            originalAmount: null,             // set when marked complete
            type: type || null,               // 'need' | 'want' | null (legacy)
            priority: priority || null,       // 1 (highest) → 4 (lowest), null = unset
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
        if (updates.originalAmount !== undefined) {
            plan.originalAmount = updates.originalAmount === null || updates.originalAmount === ''
                ? null : parseFloat(updates.originalAmount);
        }
        if (updates.type !== undefined) plan.type = updates.type || null;
        if (updates.priority !== undefined) {
            plan.priority = updates.priority === null || updates.priority === '' ? null : parseInt(updates.priority, 10);
        }
        if (updates.status !== undefined) plan.status = updates.status;

        window.Storage.save();
        return plan;
    },

    /**
     * Mark a plan as completed. originalAmount defaults to the planned amount,
     * but the user can override it (e.g. "I planned ₹50k for a phone, actually
     * spent ₹47k") in the Mark-Complete modal.
     */
    markCompleted(id, completedOn = null, originalAmount = null) {
        const plan = this.getById(id);
        if (!plan) throw new Error('Plan not found');

        plan.status = 'completed';
        plan.completedOn = completedOn || new Date().toISOString().split('T')[0];
        plan.originalAmount = originalAmount !== null && originalAmount !== ''
            ? parseFloat(originalAmount)
            : plan.amount;
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
     * Cycle priority sort: none → asc (1 → 4) → desc → none. "none" restores
     * the user's insertion order — that's the default the user asked for, so
     * we make it part of the cycle, not a separate reset button.
     */
    cyclePrioritySort() {
        this.sortMode = this.sortMode === 'none' ? 'asc'
            : this.sortMode === 'asc' ? 'desc'
            : 'none';
        this.render();
    },

    /**
     * Resolve a plan's priority for sorting. Plans without an explicit priority
     * get pushed to the end regardless of asc/desc — they're "unranked".
     */
    _priorityForSort(plan, direction) {
        const p = parseInt(plan.priority, 10);
        if (Number.isNaN(p)) return direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        return p;
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

        // Sort. Default ('none') = insertion order, which the user asked for.
        // Priority sort cycles in via the column header. When sort is 'none',
        // we still apply the sensible per-tab tiebreaker (planByDate / completedOn)
        // ONLY for the completed tab — pending tab respects raw add order so
        // the user controls the listing.
        const isCompleted = this.currentTab === 'completed';
        let sorted;
        if (this.sortMode === 'asc' || this.sortMode === 'desc') {
            const dir = this.sortMode;
            sorted = [...plans].sort((a, b) => {
                const ap = this._priorityForSort(a, dir);
                const bp = this._priorityForSort(b, dir);
                return dir === 'asc' ? ap - bp : bp - ap;
            });
        } else if (isCompleted) {
            sorted = [...plans].sort((a, b) => new Date(b.completedOn || 0) - new Date(a.completedOn || 0));
        } else {
            // Pending tab, sort 'none' → keep original add order (insertion order).
            sorted = plans;
        }

        const isPending = !isCompleted;
        const totalLabel = isPending ? 'Total Pending' : 'Total Completed';
        const totalColor = isPending
            ? 'from-orange-50 to-amber-50 text-orange-800 border-orange-200'
            : 'from-green-50 to-emerald-50 text-green-800 border-green-200';

        const sortIndicator = this.sortMode === 'asc' ? ' ↑'
            : this.sortMode === 'desc' ? ' ↓'
            : '';

        const tableHTML = `
            <!-- Plans Table -->
            <div class="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
                <!-- Table Header — adds Priority as a sortable column. Click to cycle none → ↑ → ↓ → none. -->
                <div class="grid grid-cols-[1fr_64px_auto_40px] gap-3 items-center px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    <span class="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Item Name</span>
                    <button onclick="Plans.cyclePrioritySort()"
                            class="text-[11px] font-bold uppercase tracking-wider text-center transition-colors ${this.sortMode === 'none' ? 'text-gray-600 hover:text-gray-900' : 'text-orange-700'}"
                            title="Sort by priority (1 = highest)">
                        Priority${sortIndicator}
                    </button>
                    <span class="text-[11px] font-bold text-gray-600 uppercase tracking-wider text-right">Amount</span>
                    <span></span>
                </div>

                <!-- Plans Rows -->
                <div class="divide-y divide-gray-100">
                    ${sorted.map(plan => this.renderPlanRow(plan)).join('')}
                </div>

                <!-- Footer total — sticky at the bottom of the table itself. -->
                <div class="grid grid-cols-[1fr_64px_auto_40px] gap-3 items-center px-4 py-3 bg-gradient-to-r ${totalColor} border-t-2 border-gray-200">
                    <div class="flex flex-col">
                        <span class="text-[11px] font-bold uppercase tracking-wider">${totalLabel}</span>
                        <span class="text-[10px] opacity-75">${plans.length} ${plans.length === 1 ? 'plan' : 'plans'}</span>
                    </div>
                    <span></span>
                    <span class="text-base font-bold text-right whitespace-nowrap tabular-nums">₹${Utils.formatIndianNumber(total)}</span>
                    <span></span>
                </div>
            </div>
        `;

        container.innerHTML = tableHTML;
    },

    /**
     * Priority badge — color-coded so 1 (highest) reads as red, 4 (lowest) as gray.
     * Returns a "—" placeholder when priority is not set, so the column always
     * has a centered visual element of consistent width.
     */
    _priorityBadge(priority) {
        const p = parseInt(priority, 10);
        if (Number.isNaN(p)) return `<span class="text-xs text-gray-300 font-medium">—</span>`;
        const palette = {
            1: 'bg-red-100 text-red-700 ring-1 ring-red-200',
            2: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
            3: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
            4: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
        }[p] || 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
        return `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${palette}">${p}</span>`;
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
                : `Planned on: ${this.formatDate(plan.createdDate)}`;
        } else {
            subLine = `Completed: ${this.formatDate(plan.completedOn)}`;
        }

        // Type chip in the row sub-line so the user can scan need-vs-want
        // without expanding. Kept tiny so it doesn't overpower the title.
        const typeChip = plan.type === 'need'
            ? `<span class="inline-block ml-1 text-[9px] px-1 py-0.5 rounded font-semibold bg-blue-100 text-blue-700 align-middle">NEED</span>`
            : plan.type === 'want'
                ? `<span class="inline-block ml-1 text-[9px] px-1 py-0.5 rounded font-semibold bg-pink-100 text-pink-700 align-middle">WANT</span>`
                : '';

        // Show originalAmount alongside the planned amount for completed plans
        // when they differ — that's the whole reason we capture it.
        const showOriginal = !isPending
            && plan.originalAmount !== null
            && plan.originalAmount !== undefined
            && Math.round(plan.originalAmount) !== Math.round(plan.amount);
        const amountBlock = showOriginal
            ? `<div class="text-right whitespace-nowrap">
                    <div class="text-sm font-bold ${amountTextColor}">₹${Utils.formatIndianNumber(plan.originalAmount)}</div>
                    <div class="text-[10px] text-gray-400 line-through">₹${Utils.formatIndianNumber(plan.amount)}</div>
               </div>`
            : `<span class="text-sm font-bold ${amountTextColor} text-right whitespace-nowrap">₹${Utils.formatIndianNumber(plan.amount)}</span>`;

        return `
            <div class="hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}">
                <div class="grid grid-cols-[1fr_64px_auto_40px] gap-3 items-center px-4 py-3.5 cursor-pointer"
                     onclick="Plans.toggleExpand('${plan.id}')">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-2 h-2 rounded-full ${dotColor} flex-shrink-0"></span>
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-gray-800 truncate">${Utils.escapeHtml(plan.name)}${typeChip}</p>
                            <p class="text-[11px] text-gray-500 mt-0.5">${subLine}</p>
                        </div>
                    </div>
                    <div class="flex items-center justify-center">${this._priorityBadge(plan.priority)}</div>
                    ${amountBlock}
                    <button class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all ${isExpanded ? 'rotate-180 bg-gray-200 text-gray-700' : ''}"
                            title="${isExpanded ? 'Collapse' : 'Expand'}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                </div>

                ${isExpanded ? this._renderExpandedDetail(plan, isPending) : ''}
            </div>
        `;
    },

    /**
     * Render the expanded detail card.
     *
     * Layout (top → bottom):
     *   1. Amount block — Planned vs Actual side-by-side, with a Δ chip when
     *      they differ. For pending plans only Planned is shown.
     *   2. Comment quote — only when set, styled as a faint blockquote so it
     *      reads as commentary, not a header/value pair.
     *   3. Timeline — three small dot-and-label tiles for Planned-On / Plan-By
     *      / Completed; each tile dims when its date is missing.
     *   4. Actions row — primary (Mark Complete / Move to Pending) + Edit + Delete.
     *
     * The whole thing lives inside a soft white card with subtle shadow so
     * the expanded body looks like a proper UI surface, not a continuation
     * of the row's grey strip.
     */
    _renderExpandedDetail(plan, isPending) {
        const fmt = (n) => `₹${Utils.formatIndianNumber(n)}`;
        const hasActual = !isPending
            && plan.originalAmount !== null
            && plan.originalAmount !== undefined;
        const planned = parseFloat(plan.amount) || 0;
        const actual = hasActual ? (parseFloat(plan.originalAmount) || 0) : null;
        const delta = hasActual ? Math.round(actual) - Math.round(planned) : 0;

        // Δ chip — over budget red, under budget green, on-budget gray. Only
        // rendered when an actual amount exists AND it differs from planned.
        const deltaChip = (hasActual && delta !== 0)
            ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${delta > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                    ${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))}
               </span>`
            : (hasActual && delta === 0
                ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">on budget</span>`
                : '');

        // Two-column amount block. Planned on the left (subdued), Actual on
        // the right (the headline number when it exists).
        const amountsBlock = hasActual
            ? `
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div class="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                        <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Planned</p>
                        <p class="text-sm font-bold text-gray-700 tabular-nums mt-0.5">${fmt(planned)}</p>
                    </div>
                    <div class="bg-white border ${delta > 0 ? 'border-red-200' : delta < 0 ? 'border-green-200' : 'border-gray-200'} rounded-lg px-3 py-2.5">
                        <div class="flex items-center justify-between gap-1">
                            <p class="text-[10px] font-semibold ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-green-600' : 'text-gray-500'} uppercase tracking-wide">Actual</p>
                            ${deltaChip}
                        </div>
                        <p class="text-sm font-bold ${delta > 0 ? 'text-red-700' : delta < 0 ? 'text-green-700' : 'text-gray-800'} tabular-nums mt-0.5">${fmt(actual)}</p>
                    </div>
                </div>
              `
            : `
                <div class="bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-3">
                    <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Planned Amount</p>
                    <p class="text-base font-bold text-orange-700 tabular-nums mt-0.5">${fmt(planned)}</p>
                </div>
              `;

        // Comment quote — only render when present, styled as a left-bordered
        // blockquote so it visually separates from "label + value" tiles.
        const commentBlock = plan.description
            ? `
                <div class="mb-3 px-3 py-2 bg-white border-l-4 border-gray-300 rounded-r-lg">
                    <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Comment</p>
                    <p class="text-xs text-gray-700 italic leading-relaxed">${Utils.escapeHtml(plan.description)}</p>
                </div>
              `
            : '';

        // Timeline tile — small dot icon + date label. Dims when the date
        // is missing so the user can see what's been filled in vs not.
        const tile = (label, dateStr, color, isFilled) => {
            const cls = isFilled ? `text-${color}-700` : 'text-gray-400';
            const dot = isFilled ? `bg-${color}-500` : 'bg-gray-300';
            return `
                <div class="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-2 min-w-0">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full ${dot} flex-shrink-0"></span>
                        <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">${label}</p>
                    </div>
                    <p class="text-xs font-medium ${cls} mt-0.5 tabular-nums truncate">${isFilled ? this.formatDate(dateStr) : '—'}</p>
                </div>
            `;
        };

        const timelineBlock = `
            <div class="flex items-stretch gap-2 mb-3">
                ${tile('Planned On', plan.createdDate, 'gray', !!plan.createdDate)}
                ${tile('Plan By', plan.planByDate, 'orange', !!plan.planByDate)}
                ${tile('Completed', plan.completedOn, 'green', !!plan.completedOn)}
            </div>
        `;

        // Actions — same as before, but lifted into the helper so the row
        // function stays small.
        const primaryAction = isPending
            ? `<button onclick="event.stopPropagation(); Plans.openCompleteModal('${plan.id}')"
                       class="flex-1 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all flex items-center justify-center gap-1.5">
                   <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                   </svg>
                   Mark Complete
               </button>`
            : `<button onclick="event.stopPropagation(); Plans.handleMarkPending('${plan.id}')"
                       class="flex-1 px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all flex items-center justify-center gap-1.5">
                   <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                   </svg>
                   Move to Pending
               </button>`;

        const actionsBlock = `
            <div class="flex gap-2">
                ${primaryAction}
                <button onclick="event.stopPropagation(); Plans.openModal('${plan.id}')"
                        class="px-3 py-2 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-1"
                        title="Edit">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                </button>
                <button onclick="event.stopPropagation(); Plans.handleDelete('${plan.id}')"
                        class="px-3 py-2 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-all flex items-center justify-center"
                        title="Delete">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>
                    </svg>
                </button>
            </div>
        `;

        return `
            <div class="px-3 pb-3 pt-3 bg-gradient-to-br from-gray-100 to-gray-50 border-t border-gray-200">
                ${amountsBlock}
                ${commentBlock}
                ${timelineBlock}
                ${actionsBlock}
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
        const typeInput = document.getElementById('plan-modal-type');
        const priorityInput = document.getElementById('plan-modal-priority');

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
            if (typeInput) typeInput.value = plan.type || '';
            if (priorityInput) priorityInput.value = plan.priority || '';
        } else {
            if (titleEl) titleEl.textContent = 'Add New Plan';
            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (amountInput) amountInput.value = '';
            if (descInput) descInput.value = '';
            if (createdDateInput) createdDateInput.value = today;
            if (planByDateInput) planByDateInput.value = '';
            if (typeInput) typeInput.value = '';
            if (priorityInput) priorityInput.value = '';
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
        const typeInput = document.getElementById('plan-modal-type');
        const priorityInput = document.getElementById('plan-modal-priority');

        const name = nameInput?.value.trim();
        const amount = amountInput?.value;
        const description = descInput?.value || '';
        const createdDate = createdDateInput?.value;
        const planByDate = planByDateInput?.value || null;
        const type = typeInput?.value || null;
        const priority = priorityInput?.value || null;

        if (!name) {
            window.Utils.showError('⚠️ Please enter an item name');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            window.Utils.showError('⚠️ Please enter a valid planned amount');
            return;
        }
        if (!createdDate) {
            window.Utils.showError('⚠️ Please select a "Planned On" date');
            return;
        }
        if (planByDate && new Date(planByDate) < new Date(createdDate)) {
            window.Utils.showError('⚠️ Plan by date cannot be before "Planned On" date');
            return;
        }

        try {
            const id = idInput?.value;
            if (id) {
                this.update(id, { name, amount, description, createdDate, planByDate, type, priority });
                window.Utils.showSuccess('✅ Plan updated!');
            } else {
                this.add({ name, amount, description, createdDate, planByDate, type, priority });
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
        const originalAmountInput = document.getElementById('plan-complete-original-amount');

        if (idInput) idInput.value = plan.id;
        if (nameDisplay) nameDisplay.textContent = plan.name;
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        // Default Original Amount to the planned amount; user can override
        // before confirming if they actually spent more or less.
        if (originalAmountInput) originalAmountInput.value = plan.amount;

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
        const originalAmountInput = document.getElementById('plan-complete-original-amount');

        const id = idInput?.value;
        const completedOn = dateInput?.value;
        const originalAmountRaw = originalAmountInput?.value;

        if (!id || !completedOn) {
            window.Utils.showError('⚠️ Please select a completion date');
            return;
        }
        if (originalAmountRaw === '' || originalAmountRaw === undefined || originalAmountRaw === null) {
            window.Utils.showError('⚠️ Please enter the actual amount');
            return;
        }
        const originalAmount = parseFloat(originalAmountRaw);
        if (Number.isNaN(originalAmount) || originalAmount < 0) {
            window.Utils.showError('⚠️ Actual amount must be a non-negative number');
            return;
        }

        try {
            this.markCompleted(id, completedOn, originalAmount);
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
