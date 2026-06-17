/**
 * SIPs Module
 *
 * Tracks PLANNED monthly SIP (Systematic Investment Plan) entries.
 * These are not actual purchases - real buys are added under
 * portfolioInvestments / monthlyInvestments. The plan exists so the
 * Settlement Calculation can subtract committed monthly SIPs from
 * income without the user re-typing them each month.
 *
 * Data shape: { id, name, amount, active, createdAt }
 */

const Sips = {
    bodyVisible: false, // section starts collapsed (matches Portfolio default)

    init() {
        if (!Array.isArray(window.DB.sips)) {
            window.DB.sips = [];
        }
    },

    /**
     * Active SIPs in the order entered. Settlement uses this.
     * Returns shape: [{ name, amount }] (mirrors recurring-expense items)
     */
    getActiveForSettlement() {
        return (window.DB.sips || [])
            .filter(s => s && s.active !== false && parseFloat(s.amount) > 0)
            .map(s => ({ name: s.name, amount: parseFloat(s.amount) || 0 }));
    },

    /**
     * Total monthly amount across all ACTIVE SIPs (used for the section header).
     */
    getActiveTotal() {
        return this.getActiveForSettlement().reduce((sum, s) => sum + s.amount, 0);
    },

    // -----------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------

    addOrUpdate(id, name, amount, active) {
        const trimmedName = (name || '').trim();
        const numericAmount = parseFloat(amount);

        if (!trimmedName) {
            window.Utils.showError('⚠️ Please enter a SIP name.');
            return false;
        }
        if (!isFinite(numericAmount) || numericAmount <= 0) {
            window.Utils.showError('⚠️ Amount must be a positive number.');
            return false;
        }

        if (!Array.isArray(window.DB.sips)) window.DB.sips = [];

        if (id) {
            const existing = window.DB.sips.find(s => String(s.id) === String(id));
            if (!existing) {
                window.Utils.showError('SIP not found.');
                return false;
            }
            existing.name = trimmedName;
            existing.amount = numericAmount;
            existing.active = !!active;
        } else {
            window.DB.sips.push({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name: trimmedName,
                amount: numericAmount,
                active: active !== false,
                createdAt: Date.now()
            });
        }

        window.Storage.save();
        this.render();
        window.Utils.showSuccess(id ? '✅ SIP updated' : '✅ SIP added to plan');
        return true;
    },

    async remove(id) {
        const ok = await window.Utils.confirm(
            'Remove this SIP from your plan? Actual purchases under Portfolio are not affected.',
            'Remove SIP'
        );
        if (!ok) return;
        window.DB.sips = (window.DB.sips || []).filter(s => String(s.id) !== String(id));
        window.Storage.save();
        this.render();
        window.Utils.showSuccess('SIP removed');
    },

    toggleActive(id) {
        const sip = (window.DB.sips || []).find(s => String(s.id) === String(id));
        if (!sip) return;
        sip.active = !sip.active;
        window.Storage.save();

        // In-place DOM update (avoids re-rendering the whole section on every toggle)
        const container = document.getElementById('investments-sips-section');
        const row = container && container.querySelector(`[data-sip-row="${CSS.escape(String(id))}"]`);
        const btn = container && container.querySelector(`[data-sip-toggle="${CSS.escape(String(id))}"]`);
        if (!row || !btn) {
            this.render(); // fallback if DOM isn't in expected shape
            return;
        }
        const active = sip.active !== false;
        row.classList.toggle('opacity-50', !active);
        btn.classList.toggle('bg-indigo-600', active);
        btn.classList.toggle('border-indigo-600', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('border-gray-300', !active);
        btn.title = active ? 'Active in settlement' : 'Disabled - not counted in settlement';
        btn.innerHTML = active
            ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'
            : '';

        this._updateHeader();
    },

    /**
     * Refresh just the section header total + active count (no full re-render).
     */
    _updateHeader() {
        const totalEl = document.getElementById('sips-header-total');
        const countEl = document.getElementById('sips-header-count');
        if (totalEl) totalEl.textContent = `₹${Utils.formatIndianNumber(Math.round(this.getActiveTotal()))}`;
        if (countEl) countEl.textContent = String((window.DB.sips || []).filter(s => s.active !== false).length);
    },

    // -----------------------------------------------------------
    // Modal
    // -----------------------------------------------------------

    openModal(id = null) {
        const isEdit = !!id;
        const sip = isEdit ? (window.DB.sips || []).find(s => String(s.id) === String(id)) : null;
        if (isEdit && !sip) {
            window.Utils.showError('SIP not found.');
            return;
        }

        document.getElementById('sip-modal-title').textContent = isEdit ? 'Edit SIP' : 'Add Planned SIP';
        document.getElementById('sip-id').value = isEdit ? sip.id : '';
        document.getElementById('sip-name').value = isEdit ? sip.name : '';
        document.getElementById('sip-amount').value = isEdit ? sip.amount : '';
        document.getElementById('sip-active').checked = isEdit ? sip.active !== false : true;

        const deleteBtn = document.getElementById('sip-delete-btn');
        if (deleteBtn) deleteBtn.classList.toggle('hidden', !isEdit);

        document.getElementById('sip-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('sip-name')?.focus(), 50);
    },

    closeModal() {
        document.getElementById('sip-modal').classList.add('hidden');
    },

    saveFromModal() {
        const id = document.getElementById('sip-id').value || null;
        const name = document.getElementById('sip-name').value;
        const amount = document.getElementById('sip-amount').value;
        const active = document.getElementById('sip-active').checked;
        if (this.addOrUpdate(id, name, amount, active)) {
            this.closeModal();
        }
    },

    async deleteFromModal() {
        const id = document.getElementById('sip-id').value;
        if (id) {
            this.closeModal();
            await this.remove(id);
        }
    },

    // -----------------------------------------------------------
    // Render
    // -----------------------------------------------------------

    toggleBody() {
        this.bodyVisible = !this.bodyVisible;

        // In-place show/hide (avoids re-rendering all rows just to collapse)
        const body = document.getElementById('sips-body');
        const header = document.getElementById('sips-header');
        const chevron = document.getElementById('sips-header-chevron');
        if (!body || !header || !chevron) {
            this.render();
            return;
        }
        body.classList.toggle('hidden', !this.bodyVisible);
        chevron.classList.toggle('-rotate-90', !this.bodyVisible);
        header.classList.toggle('rounded-t-xl', this.bodyVisible);
        header.classList.toggle('rounded-xl', !this.bodyVisible);
    },

    render() {
        const container = document.getElementById('investments-sips-section');
        if (!container) return;

        const sips = window.DB.sips || [];
        const activeCount = sips.filter(s => s.active !== false).length;
        const total = this.getActiveTotal();
        const isVisible = this.bodyVisible;

        const rowsHtml = sips.length === 0 ? `
            <div class="px-4 py-6 text-center text-gray-500 text-sm">
                No SIPs in your plan yet.
                <button onclick="Sips.openModal()" class="ml-1 text-indigo-600 font-semibold hover:underline">Add one</button>
                so settlement picks it up automatically.
            </div>
        ` : sips.map(s => {
            const active = s.active !== false;
            return `
                <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 ${active ? '' : 'opacity-50'}" data-sip-row="${s.id}">
                    <button onclick="Sips.toggleActive('${s.id}')" data-sip-toggle="${s.id}"
                            class="w-5 h-5 rounded border-2 ${active ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'} flex items-center justify-center transition-all flex-shrink-0"
                            title="${active ? 'Active in settlement' : 'Disabled - not counted in settlement'}">
                        ${active ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
                    </button>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-gray-800 truncate">${Utils.escapeHtml(s.name)}</p>
                        <p class="text-[10px] text-gray-500">Monthly plan</p>
                    </div>
                    <span class="text-sm font-bold text-indigo-700 flex-shrink-0">₹${Utils.formatIndianNumber(s.amount)}</span>
                    <button onclick="Sips.openModal('${s.id}')" class="p-1.5 text-gray-500 hover:text-indigo-600 transition-colors" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                    </button>
                </div>`;
        }).join('');

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md overflow-hidden mb-6">
                <!-- Header (clickable) -->
                <div id="sips-header" class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 ${isVisible ? 'rounded-t-xl' : 'rounded-xl'} cursor-pointer" onclick="Sips.toggleBody()">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <svg id="sips-header-chevron" class="w-5 h-5 transition-transform duration-200 ${isVisible ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                            <div>
                                <h3 class="text-lg font-bold leading-tight">SIPs</h3>
                                <p class="text-[11px] opacity-80 leading-tight">Planned monthly · <span id="sips-header-count">${activeCount}</span> active</p>
                            </div>
                        </div>
                        <p id="sips-header-total" class="text-2xl font-bold">₹${Utils.formatIndianNumber(Math.round(total))}</p>
                    </div>
                </div>

                <!-- Body -->
                <div id="sips-body" class="${isVisible ? '' : 'hidden'}">
                    <div class="bg-indigo-50 border-b border-indigo-100 px-3 py-2 text-[10px] text-indigo-700 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                        </svg>
                        <span>Planned only. Actual buys go under Portfolio. Settlement deducts active SIPs automatically.</span>
                    </div>
                    ${rowsHtml}
                    <div class="px-3 py-2 border-t border-gray-100 bg-gray-50">
                        <button onclick="Sips.openModal()"
                                class="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-indigo-700 border-2 border-dashed border-indigo-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            Add Planned SIP
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};

if (typeof window !== 'undefined') {
    window.Sips = Sips;
}
