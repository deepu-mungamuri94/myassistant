/**
 * Health & Care Module (internally "PersonalCare"; UI: Products + Care Plans)
 * Catalog of medicines and skincare products (cold/flu, fever, skin care, baby care, first aid, other)
 * Also supports customizable routines (e.g. Skincare: Morning / Afternoon / Night) built from catalog items.
 *
 * NOTE on innerHTML usage below: all interpolated values are passed through
 * window.Utils.escapeHtml (text content) or window.Utils.escapeJsAttr
 * (onclick-string arguments) before being inlined, matching the established
 * convention in credentials.js / plans.js. This is a safe pattern given that
 * escaping, not sanitization, is the correct defense for template-built HTML.
 */

const PersonalCare = {
    expandedCategories: new Set(),
    expandedRoutines: new Set(),
    expandedSections: new Set(), // keys: `${routineId}:${sectionId}`
    activeFilter: 'all',
    activeTab: 'items', // 'items' | 'routines'
    searchTerm: '',

    // icon = emoji shown on chips, group headers and item tiles;
    // tint = soft background/text pair for the icon tile.
    CATEGORIES: {
        cold_flu: { label: 'Cold & Flu', icon: '🤧', tint: 'bg-sky-50 text-sky-700' },
        fever: { label: 'Fever', icon: '🌡️', tint: 'bg-orange-50 text-orange-700' },
        skin_care: { label: 'Skin Care', icon: '🧴', tint: 'bg-pink-50 text-pink-700' },
        baby_care: { label: 'Baby Care', icon: '🍼', tint: 'bg-amber-50 text-amber-700' },
        first_aid: { label: 'First Aid', icon: '🩹', tint: 'bg-emerald-50 text-emerald-700' },
        other: { label: 'Other', icon: '💊', tint: 'bg-slate-100 text-slate-700' }
    },

    /**
     * Add a new personal care item
     */
    add(item) {
        const record = {
            id: window.Utils.generateId(),
            name: item.name,
            category: item.category || 'other',
            description: item.description || '',
            uses: item.uses || '',
            price: item.price != null ? item.price : null,
            currency: item.currency || 'INR',
            person: item.person || '',
            age: item.age != null ? item.age : null,
            date: item.date || window.Utils.formatLocalDate(new Date()),
            createdAt: window.Utils.getCurrentTimestamp()
        };
        window.DB.personalCareItems.push(record);
        window.Storage.save();
        return record;
    },

    /**
     * Update an existing item
     */
    update(id, changes) {
        const item = this.getById(id);
        if (!item) return null;
        Object.assign(item, changes);
        window.Storage.save();
        return item;
    },

    /**
     * Delete an item by id
     */
    delete(id) {
        window.DB.personalCareItems = window.DB.personalCareItems.filter(i => String(i.id) !== String(id));
        window.Storage.save();
    },

    /**
     * Find an item by id
     */
    getById(id) {
        return window.DB.personalCareItems.find(i => String(i.id) === String(id));
    },

    /**
     * Toggle expand/collapse of a category group
     */
    toggleCategory(category) {
        if (this.expandedCategories.has(category)) {
            this.expandedCategories.delete(category);
        } else {
            this.expandedCategories.add(category);
        }
    },

    /**
     * Record a category group's open state (from its <details> ontoggle).
     * Everything starts collapsed; open groups are remembered for the session.
     */
    setCategoryOpen(category, isOpen) {
        if (isOpen) this.expandedCategories.add(category);
        else this.expandedCategories.delete(category);
    },

    /**
     * Record a routine section's open state (collapsed by default)
     */
    toggleSection(routineId, sectionId, isOpen) {
        const key = `${routineId}:${sectionId}`;
        if (isOpen) this.expandedSections.add(key);
        else this.expandedSections.delete(key);
    },

    /**
     * Toggle expand/collapse of a routine card
     */
    toggleRoutine(routineId, isOpen) {
        if (isOpen) {
            this.expandedRoutines.add(routineId);
        } else {
            this.expandedRoutines.delete(routineId);
        }
    },

    /**
     * Filter the list to a single category, or 'all'
     */
    setFilter(category) {
        this.activeFilter = category;
        this.render();
    },

    /**
     * Live search across name / uses / notes / person. Only re-renders the
     * list (not the search box) so the input keeps focus while typing.
     */
    setSearch(term) {
        this.searchTerm = (term || '').trim();
        this.renderItemsList();
    },

    /**
     * Friendly date for display: '2026-03-12' → '12 Mar 2026'
     */
    _formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = String(dateStr).split('-').map(Number);
        if (!y || !m || !d) return String(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d} ${months[m - 1]} ${y}`;
    },

    /**
     * Switch between the Items tab and the Routines tab
     */
    switchTab(tab) {
        this.activeTab = tab;
        this.render();
    },

    /**
     * Get all distinct product names used so far, most-recently-used first.
     * Used to power the name autocomplete (mirrors Expenses title suggestions).
     */
    getProductNameSuggestions(searchTerm) {
        const items = window.DB.personalCareItems || [];
        const sorted = [...items].sort((a, b) => {
            const dateA = new Date(a.date || a.createdAt || 0);
            const dateB = new Date(b.date || b.createdAt || 0);
            return dateB - dateA;
        });
        const seen = new Map();
        sorted.forEach(item => {
            if (item.name && !seen.has(item.name)) {
                seen.set(item.name, item);
            }
        });
        let names = Array.from(seen.values());
        if (searchTerm) {
            names = names.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return names.slice(0, 8);
    },

    /**
     * Get all distinct person names used so far, for the person-name autocomplete.
     */
    getPersonNameSuggestions() {
        return this._distinctLatest('person');
    },

    /**
     * Distinct non-empty values of a field, de-duplicated case-insensitively
     * (keeping the most recent spelling), sorted alphabetically.
     */
    _distinctLatest(field) {
        const byKey = new Map();
        this._latestFirst(window.DB.personalCareItems || []).forEach(i => {
            const value = (i[field] || '').trim();
            const key = value.toLowerCase();
            if (value && !byKey.has(key)) byKey.set(key, value);
        });
        return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
    },

    // Items sorted newest first (by date, falling back to createdAt)
    _latestFirst(items) {
        const time = i => new Date(i.date || i.createdAt || 0).getTime() || 0;
        return items.slice().sort((a, b) => time(b) - time(a));
    },

    /**
     * Age for a person from their most recent item that recorded an age,
     * rolled forward by the whole years elapsed since that item's date
     * (so a baby logged at 1 last year shows as 2 now). Null if unknown.
     */
    getAgeForPerson(name, today = new Date()) {
        const key = (name || '').trim().toLowerCase();
        if (!key) return null;
        const match = this._latestFirst(window.DB.personalCareItems || [])
            .find(i => (i.person || '').trim().toLowerCase() === key && i.age != null && i.age !== '');
        if (!match) return null;
        const age = Number(match.age);
        if (!Number.isFinite(age)) return null;
        let elapsed = 0;
        const [y, m, d] = String(match.date || '').split('-').map(Number);
        if (y && m && d) {
            elapsed = today.getFullYear() - y;
            const beforeAnniversary = (today.getMonth() + 1) < m || ((today.getMonth() + 1) === m && today.getDate() < d);
            if (beforeAnniversary) elapsed -= 1;
        }
        return age + Math.max(0, elapsed);
    },

    /**
     * Given a product name, find the most recently used category for it.
     * Powers auto-detection of category from history (mirrors how expense
     * title-autocomplete carries category along with it).
     */
    getLastCategoryForName(name) {
        if (!name) return null;
        const match = this._latestFirst(window.DB.personalCareItems || [])
            .find(i => i.name && i.name.toLowerCase() === name.trim().toLowerCase());
        return match ? match.category : null;
    },

    /**
     * Render the category filter as a compact dropdown beside the search bar.
     * "All" shows how many categories are in use; each category shows its
     * item count. Hidden when there are no items.
     */
    renderFilters() {
        const select = document.getElementById('personalcare-filter-select');
        const wrap = document.getElementById('personalcare-filter-wrap');
        if (!select) return;

        const items = window.DB.personalCareItems || [];
        if (wrap) wrap.classList.toggle('hidden', items.length === 0);
        if (items.length === 0) {
            select.innerHTML = '';
            this.activeFilter = 'all';
            return;
        }

        const counts = {};
        items.forEach(i => {
            const cat = i.category || 'other';
            counts[cat] = (counts[cat] || 0) + 1;
        });
        const usedCategories = Object.keys(this.CATEGORIES).filter(key => counts[key]);

        // A filter pointing at a now-empty category falls back to All.
        if (this.activeFilter !== 'all' && !counts[this.activeFilter]) {
            this.activeFilter = 'all';
        }

        const option = (value, label) =>
            `<option value="${window.Utils.escapeHtml(value)}"${this.activeFilter === value ? ' selected' : ''}>${label}</option>`;

        select.innerHTML = [option('all', `All (${usedCategories.length})`)].concat(
            usedCategories.map(key => {
                const cfg = this.CATEGORIES[key];
                return option(key, `${cfg.icon} ${window.Utils.escapeHtml(cfg.label)} (${counts[key]})`);
            })
        ).join('');
        select.value = this.activeFilter;

        // Tint the dropdown while a specific category is selected
        const filtered = this.activeFilter !== 'all';
        if (select.classList) {
            select.classList.toggle('border-rose-300', filtered);
            select.classList.toggle('bg-rose-50', filtered);
            select.classList.toggle('text-rose-700', filtered);
            select.classList.toggle('bg-white', !filtered);
            select.classList.toggle('text-gray-700', !filtered);
        }
    },

    /**
     * Render the Items / Routines segmented pill (same pattern as Plans)
     */
    renderTabs() {
        const itemsTab = document.getElementById('personalcare-tab-items');
        const routinesTab = document.getElementById('personalcare-tab-routines');
        if (!itemsTab || !routinesTab) return;

        const activeClass = 'flex-1 px-4 py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm transition-all flex items-center justify-center gap-1.5';
        const ghostClass = 'flex-1 px-4 py-2.5 text-sm font-bold rounded-lg text-gray-500 hover:text-gray-700 transition-all flex items-center justify-center gap-1.5';
        const counts = {
            items: (window.DB.personalCareItems || []).length,
            routines: (window.DB.personalCareRoutines || []).length
        };

        [['items', itemsTab], ['routines', routinesTab]].forEach(([tab, el]) => {
            const active = this.activeTab === tab;
            el.className = active ? activeClass : ghostClass;
            const chip = el.querySelector ? el.querySelector('.tab-count') : null;
            if (chip) {
                chip.textContent = counts[tab];
                chip.className = `tab-count px-2 py-0.5 rounded-full text-xs ${active ? 'bg-black/10' : 'bg-gray-200 text-gray-600'}`;
            }
        });
    },

    /**
     * Summary hero: how many items, people and routines are tracked.
     * Hidden until there is something to summarise.
     */
    renderSummary() {
        const el = document.getElementById('personalcare-summary');
        if (!el) return;

        const items = window.DB.personalCareItems || [];
        const routines = window.DB.personalCareRoutines || [];
        if (items.length === 0 && routines.length === 0) {
            el.innerHTML = '';
            return;
        }

        const people = new Set(items.map(i => (i.person || '').trim().toLowerCase()).filter(Boolean)).size;
        const stat = (value, label) => `
            <div class="text-center">
                <p class="text-xl font-extrabold leading-tight">${value}</p>
                <p class="text-[10px] uppercase tracking-wider text-white/80 font-semibold">${label}</p>
            </div>`;

        el.innerHTML = `
            <div class="relative overflow-hidden rounded-2xl p-4 shadow-lg text-white bg-gradient-to-br from-rose-500 via-rose-600 to-pink-600">
                <div class="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none"></div>
                <div class="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none"></div>
                <div class="relative">
                    <div class="flex items-center gap-2.5 mb-3">
                        <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 text-xl">🌸</div>
                        <div>
                            <p class="text-[10px] uppercase tracking-wider text-white/80 font-semibold">Health &amp; Care</p>
                            <p class="text-sm font-semibold text-white/95">Your family's products &amp; care plans</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 pt-3 border-t border-white/20">
                        ${stat(items.length, items.length === 1 ? 'Product' : 'Products')}
                        ${stat(people, people === 1 ? 'Person' : 'People')}
                        ${stat(routines.length, routines.length === 1 ? 'Care Plan' : 'Care Plans')}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render the whole page for the active tab
     */
    render() {
        this.renderSummary();
        this.renderTabs();

        const itemsContent = document.getElementById('personalcare-items-content');
        const routinesContent = document.getElementById('personalcare-routines-content');
        const addItemBtn = document.getElementById('personalcare-add-item-btn');
        const addRoutineBtn = document.getElementById('personalcare-add-routine-btn');

        if (itemsContent) itemsContent.classList.toggle('hidden', this.activeTab !== 'items');
        if (routinesContent) routinesContent.classList.toggle('hidden', this.activeTab !== 'routines');
        if (addItemBtn) addItemBtn.classList.toggle('hidden', this.activeTab !== 'items');
        if (addRoutineBtn) addRoutineBtn.classList.toggle('hidden', this.activeTab !== 'routines');

        if (this.activeTab === 'items') {
            this.renderFilters();
            this.renderItemsList();
        } else {
            this.renderRoutinesList();
        }
    },

    /**
     * Render the items list (grouped by category)
     */
    renderItemsList() {
        const list = document.getElementById('personalcare-list');
        if (!list) return;

        const items = window.DB.personalCareItems || [];

        if (items.length === 0) {
            list.innerHTML = this._renderEmptyState('💊', 'No products yet', 'Tap + to add a medicine or personal-care product you keep at home.');
            return;
        }

        const term = (this.searchTerm || '').toLowerCase();
        const filtered = items.filter(i => {
            if (this.activeFilter !== 'all' && (i.category || 'other') !== this.activeFilter) return false;
            if (!term) return true;
            return [i.name, i.uses, i.description, i.person]
                .some(field => (field || '').toLowerCase().includes(term));
        });

        if (filtered.length === 0) {
            list.innerHTML = term
                ? this._renderEmptyState('🔍', 'No matches', `Nothing found for “${window.Utils.escapeHtml(this.searchTerm)}”.`)
                : this._renderEmptyState('🗂️', 'Nothing here', 'No products in this category yet.');
            return;
        }

        const groupedByCategory = {};
        filtered.forEach(item => {
            const category = item.category || 'other';
            if (!groupedByCategory[category]) groupedByCategory[category] = [];
            groupedByCategory[category].push(item);
        });

        // Keep a stable category order (as defined in CATEGORIES)
        const order = Object.keys(this.CATEGORIES);
        const categories = Object.keys(groupedByCategory)
            .sort((a, b) => order.indexOf(a) - order.indexOf(b));

        list.innerHTML = categories.map(category => {
            const config = this.CATEGORIES[category] || this.CATEGORIES.other;
            const categoryItems = groupedByCategory[category];
            // Collapsed by default; while searching, open groups so matches are visible
            const isOpen = !!term || this.expandedCategories.has(category);

            return `
                <details class="personalcare-category-group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3"${isOpen ? ' open' : ''}${term ? '' : ` ontoggle="PersonalCare.setCategoryOpen('${window.Utils.escapeJsAttr(category)}', this.open)"`}>
                    <summary class="cursor-pointer flex items-center gap-3 px-4 py-3">
                        <span class="w-9 h-9 rounded-xl ${config.tint} flex items-center justify-center text-lg flex-shrink-0">${config.icon}</span>
                        <span class="flex-1 font-bold text-gray-800 text-sm">${window.Utils.escapeHtml(config.label)}</span>
                        <span class="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">${categoryItems.length}</span>
                        <svg class="details-arrow w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="border-t border-gray-100 divide-y divide-gray-100">
                        ${categoryItems.map(item => this._renderItemRow(item)).join('')}
                    </div>
                </details>
            `;
        }).join('');
    },

    /**
     * Shared friendly empty state (emoji bubble + title + hint)
     */
    _renderEmptyState(icon, title, subtitle) {
        return `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 text-center py-12 px-6">
                <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-3xl">${icon}</div>
                <p class="text-sm font-semibold text-gray-700">${title}</p>
                <p class="text-xs text-gray-400 mt-1">${subtitle}</p>
            </div>
        `;
    },

    /**
     * Render a single item row. Tapping the row opens it for editing;
     * the small trash button deletes (and doesn't trigger the edit).
     */
    _renderItemRow(item) {
        const config = this.CATEGORIES[item.category] || this.CATEGORIES.other;
        const price = item.price != null
            ? `${item.currency && item.currency !== 'INR' ? window.Utils.escapeHtml(item.currency) + ' ' : '₹'}${window.Utils.formatIndianNumber(item.price)}`
            : '';
        const person = item.person
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold">👤 ${window.Utils.escapeHtml(item.person)}${item.age != null ? ` · ${window.Utils.escapeHtml(item.age)}y` : ''}</span>`
            : '';
        const date = item.date
            ? `<span class="text-[11px] text-gray-400">${window.Utils.escapeHtml(this._formatDate(item.date))}</span>`
            : '';

        return `
            <div onclick="PersonalCare.editItem('${window.Utils.escapeJsAttr(item.id)}')" class="flex gap-3 px-4 py-3 cursor-pointer hover:bg-rose-50/60 active:bg-rose-50 transition-colors">
                <span class="w-10 h-10 rounded-xl ${config.tint} flex items-center justify-center text-lg flex-shrink-0">${config.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <p class="font-semibold text-gray-800 text-sm leading-snug">${window.Utils.escapeHtml(item.name)}</p>
                        ${price ? `<span class="text-sm font-bold text-gray-700 flex-shrink-0">${price}</span>` : ''}
                    </div>
                    ${item.uses ? `<p class="text-xs text-gray-600 mt-0.5 leading-relaxed">${window.Utils.escapeHtml(item.uses)}</p>` : ''}
                    ${item.description ? `<p class="text-xs text-gray-400 mt-0.5 leading-relaxed">${window.Utils.escapeHtml(item.description)}</p>` : ''}
                    <div class="flex items-center justify-between gap-2 mt-1.5">
                        <div class="flex items-center gap-2 flex-wrap">${person}${date}</div>
                        <button onclick="event.stopPropagation(); PersonalCare.handleDelete('${window.Utils.escapeJsAttr(item.id)}')" class="p-1.5 -mr-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0" title="Delete" aria-label="Delete product">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Open the add/edit modal. Pass an id to edit an existing item.
     */
    openModal(id) {
        const modal = document.getElementById('personalcare-modal');
        const title = document.getElementById('personalcare-modal-title');
        const idInput = document.getElementById('personalcare-modal-id');
        const nameInput = document.getElementById('personalcare-modal-name');
        const categoryInput = document.getElementById('personalcare-modal-category');
        const usesInput = document.getElementById('personalcare-modal-uses');
        const priceInput = document.getElementById('personalcare-modal-price');
        const personInput = document.getElementById('personalcare-modal-person');
        const ageInput = document.getElementById('personalcare-modal-age');
        const dateInput = document.getElementById('personalcare-modal-date');
        const descriptionInput = document.getElementById('personalcare-modal-description');

        const item = id != null ? this.getById(id) : null;

        if (item) {
            title.textContent = 'Edit Product';
            idInput.value = item.id;
            nameInput.value = item.name || '';
            categoryInput.value = item.category || 'other';
            usesInput.value = item.uses || '';
            priceInput.value = item.price != null ? item.price : '';
            personInput.value = item.person || '';
            ageInput.value = item.age != null ? item.age : '';
            dateInput.value = item.date || window.Utils.formatLocalDate(new Date());
            descriptionInput.value = item.description || '';
        } else {
            title.textContent = 'Add Product';
            idInput.value = '';
            nameInput.value = '';
            categoryInput.value = 'cold_flu';
            usesInput.value = '';
            priceInput.value = '';
            personInput.value = '';
            ageInput.value = '';
            dateInput.value = window.Utils.formatLocalDate(new Date());
            descriptionInput.value = '';
        }

        this._ageAutofilled = false;
        this._setAgeHint(false);
        this.hideSuggestions('name');
        this.hideSuggestions('person');
        modal.classList.remove('hidden');
    },

    /**
     * Custom suggestion dropdowns (same pattern as Investments' name field).
     * Native <datalist> renders poorly / not at all in Android WebView.
     */
    SUGGEST_FIELDS: {
        name: { input: 'personalcare-modal-name', box: 'personalcare-name-suggestions' },
        person: { input: 'personalcare-modal-person', box: 'personalcare-person-suggestions' },
        step: { input: 'personalcare-item-modal-title', box: 'personalcare-step-suggestions' }
    },

    /**
     * Candidate suggestions for a field as [{ value, hint }]
     */
    _suggestionsFor(field) {
        if (field === 'person') {
            return this.getPersonNameSuggestions().map(value => {
                const age = this.getAgeForPerson(value);
                return { value, hint: age != null ? `${age} y` : '' };
            });
        }
        const names = this._distinctLatest('name');
        if (field === 'name') {
            return names.map(value => {
                const cfg = this.CATEGORIES[this.getLastCategoryForName(value)];
                return { value, hint: cfg ? `${cfg.icon} ${cfg.label}` : '' };
            });
        }
        return names.map(value => ({ value, hint: '' }));
    },

    /**
     * Show matching suggestions under a field. An empty term lists everything
     * (handy for the short person list); prefix matches are ranked first.
     */
    showSuggestions(field, term) {
        const cfg = this.SUGGEST_FIELDS[field];
        const box = cfg && document.getElementById(cfg.box);
        if (!box) return;

        const q = (term || '').trim().toLowerCase();
        let matches = this._suggestionsFor(field).filter(s => s.value.toLowerCase().includes(q));
        // Nothing to suggest once the user has typed an exact, unique match
        if (matches.length === 1 && matches[0].value.toLowerCase() === q) matches = [];
        if (matches.length === 0) {
            this.hideSuggestions(field);
            return;
        }
        matches.sort((a, b) => {
            const pa = a.value.toLowerCase().startsWith(q) ? 0 : 1;
            const pb = b.value.toLowerCase().startsWith(q) ? 0 : 1;
            return pa - pb;
        });

        // mousedown preventDefault keeps focus in the input so its blur
        // doesn't hide the list before the tap registers.
        box.innerHTML = matches.slice(0, 50).map(s => `
            <div onmousedown="event.preventDefault()" onclick="PersonalCare.selectSuggestion('${field}', '${window.Utils.escapeJsAttr(s.value)}')"
                 class="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-rose-50 active:bg-rose-100 cursor-pointer border-b border-gray-100 last:border-b-0">
                <span class="text-sm text-gray-800 truncate">${window.Utils.escapeHtml(s.value)}</span>
                ${s.hint ? `<span class="text-[11px] text-gray-400 flex-shrink-0">${window.Utils.escapeHtml(s.hint)}</span>` : ''}
            </div>
        `).join('');
        box.classList.remove('hidden');
    },

    /**
     * Hide a suggestion list. `deferred` is used from onblur so a tap on an
     * option still lands before the list disappears.
     */
    hideSuggestions(field, deferred) {
        const hide = () => {
            const cfg = this.SUGGEST_FIELDS[field];
            const box = cfg && document.getElementById(cfg.box);
            if (!box) return;
            box.classList.add('hidden');
            box.innerHTML = '';
        };
        if (deferred) setTimeout(hide, 150);
        else hide();
    },

    selectSuggestion(field, value) {
        const cfg = this.SUGGEST_FIELDS[field];
        const input = cfg && document.getElementById(cfg.input);
        if (input) input.value = value;
        this.hideSuggestions(field);
        if (field === 'name') this.onNameInput(value);
        if (field === 'person') this.onPersonInput(value, true);
    },

    /**
     * Person typed/picked: fill Age from that person's history. A picked
     * suggestion always fills it; typing only fills an empty or previously
     * auto-filled age, so a manually entered age is never overwritten.
     */
    onPersonInput(name, force) {
        const ageInput = document.getElementById('personalcare-modal-age');
        if (!ageInput) return;
        const age = this.getAgeForPerson(name);
        const canFill = force || ageInput.value === '' || this._ageAutofilled;
        if (age != null && canFill) {
            ageInput.value = age;
            this._ageAutofilled = true;
            this._setAgeHint(true);
        } else if (age == null && this._ageAutofilled) {
            // Typed past a known name: drop the age we filled in for it
            ageInput.value = '';
            this._ageAutofilled = false;
            this._setAgeHint(false);
        }
    },

    // User edited the age by hand: stop treating it as auto-filled
    onAgeInput() {
        this._ageAutofilled = false;
        this._setAgeHint(false);
    },

    _setAgeHint(show) {
        const hint = document.getElementById('personalcare-age-hint');
        if (hint) hint.classList.toggle('hidden', !show);
    },

    /**
     * Called on product-name input: auto-detect category from the most
     * recent past item with the same name (mirrors expense-title autofill).
     */
    onNameInput(name) {
        const category = this.getLastCategoryForName(name);
        if (category) {
            const categoryInput = document.getElementById('personalcare-modal-category');
            if (categoryInput) categoryInput.value = category;
        }
    },

    /**
     * Open the modal pre-filled for editing an existing item
     */
    editItem(id) {
        this.openModal(id);
    },

    closeModal() {
        this.hideSuggestions('name');
        this.hideSuggestions('person');
        document.getElementById('personalcare-modal').classList.add('hidden');
    },

    saveFromModal() {
        const idInput = document.getElementById('personalcare-modal-id');
        const nameInput = document.getElementById('personalcare-modal-name');
        const categoryInput = document.getElementById('personalcare-modal-category');
        const usesInput = document.getElementById('personalcare-modal-uses');
        const priceInput = document.getElementById('personalcare-modal-price');
        const personInput = document.getElementById('personalcare-modal-person');
        const ageInput = document.getElementById('personalcare-modal-age');
        const dateInput = document.getElementById('personalcare-modal-date');
        const descriptionInput = document.getElementById('personalcare-modal-description');

        const name = nameInput.value.trim();
        if (!name) {
            window.Utils.showError('Product name is required');
            return;
        }

        const payload = {
            name,
            category: categoryInput.value || 'other',
            uses: usesInput.value.trim(),
            price: priceInput.value !== '' ? parseFloat(priceInput.value) : null,
            person: personInput.value.trim(),
            age: ageInput.value !== '' ? parseInt(ageInput.value, 10) : null,
            date: dateInput.value || window.Utils.formatLocalDate(new Date()),
            description: descriptionInput.value.trim()
        };

        const id = idInput.value;
        if (id) {
            this.update(id, payload);
        } else {
            this.add(payload);
        }
        // Keep the saved item visible: its (otherwise collapsed) group opens
        this.expandedCategories.add(payload.category);

        this.closeModal();
        this.render();
        window.Utils.showSuccess(id ? 'Product updated' : 'Product added');
    },

    /**
     * Delete with confirmation
     */
    async handleDelete(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this product. Are you sure?',
            'Delete Product'
        );
        if (!confirmed) return;

        this.delete(id);
        this.render();
        window.Utils.showSuccess('Product deleted');
    },

    // ===================== Routines =====================

    /**
     * Add a new routine (e.g. "Skincare") with empty sections list.
     */
    addRoutine(name) {
        const record = {
            id: window.Utils.generateId(),
            name,
            sections: [],
            createdAt: window.Utils.getCurrentTimestamp()
        };
        window.DB.personalCareRoutines.push(record);
        window.Storage.save();
        return record;
    },

    /**
     * Delete a routine by id
     */
    deleteRoutine(id) {
        window.DB.personalCareRoutines = window.DB.personalCareRoutines.filter(r => String(r.id) !== String(id));
        window.Storage.save();
    },

    /**
     * Find a routine by id
     */
    getRoutineById(id) {
        return window.DB.personalCareRoutines.find(r => String(r.id) === String(id));
    },

    /**
     * Add a custom heading/section to a routine (e.g. "Morning", "Night")
     */
    addRoutineSection(routineId, heading) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;
        const section = {
            id: window.Utils.generateId(),
            heading,
            items: []
        };
        routine.sections.push(section);
        window.Storage.save();
        return section;
    },

    /**
     * Remove a section from a routine
     */
    deleteRoutineSection(routineId, sectionId) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return;
        routine.sections = routine.sections.filter(s => String(s.id) !== String(sectionId));
        window.Storage.save();
    },

    /**
     * Add a numbered flow step to a section: a bold title, an optional
     * italic tag/sub-label (e.g. "Target dark joints (1-2 mins)"), and an
     * optional instructional description. Description may contain
     * **bold** markers (e.g. around a product name) which render() turns
     * into <strong> text.
     */
    addRoutineItem(routineId, sectionId, title, tag, description) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;
        const section = routine.sections.find(s => String(s.id) === String(sectionId));
        if (!section) return null;
        const item = {
            id: window.Utils.generateId(),
            title,
            tag: tag || '',
            description: description || ''
        };
        section.items.push(item);
        window.Storage.save();
        return item;
    },

    /**
     * Rename a routine
     */
    updateRoutine(id, name) {
        const routine = this.getRoutineById(id);
        if (!routine) return null;
        routine.name = name;
        window.Storage.save();
        return routine;
    },

    /**
     * Rename a section within a routine
     */
    updateRoutineSection(routineId, sectionId, heading) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;
        const section = routine.sections.find(s => String(s.id) === String(sectionId));
        if (!section) return null;
        section.heading = heading;
        window.Storage.save();
        return section;
    },

    /**
     * Edit a step's title / tag / description in place (keeps its id and position)
     */
    updateRoutineItem(routineId, sectionId, itemId, title, tag, description) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;
        const section = routine.sections.find(s => String(s.id) === String(sectionId));
        if (!section) return null;
        const item = section.items.find(i => String(i.id) === String(itemId));
        if (!item) return null;
        item.title = title;
        item.tag = tag || '';
        item.description = description || '';
        window.Storage.save();
        return item;
    },

    /**
     * Read an optional modal field (hidden edit-id inputs may be absent)
     */
    _fieldValue(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    },

    _setModalHeading(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },

    // Delete buttons in the routine modals are only shown in edit mode
    _toggleModalDelete(id, show) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !show);
    },

    /**
     * Remove a step from a routine section
     */
    deleteRoutineItem(routineId, sectionId, itemId) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return;
        const section = routine.sections.find(s => String(s.id) === String(sectionId));
        if (!section) return;
        section.items = section.items.filter(i => String(i.id) !== String(itemId));
        window.Storage.save();
    },

    /**
     * Render the routines tab (list of routines, each with its sections/items)
     */
    renderRoutinesList() {
        const list = document.getElementById('personalcare-routines-list');
        if (!list) return;

        const routines = window.DB.personalCareRoutines || [];

        if (routines.length === 0) {
            list.innerHTML = this._renderEmptyState('✨', 'No care plans yet', 'Tap + to plan how and when to use your products (e.g. Skincare with Morning / Night steps).');
            return;
        }

        list.innerHTML = routines.map(routine => this._renderRoutineCard(routine)).join('');
    },

    /**
     * Pick a friendly emoji for a section from its name (Morning → ☀️, Night → 🌙)
     */
    _sectionIcon(heading) {
        const h = (heading || '').toLowerCase();
        if (/morning|sunrise|\bam\b|wake/.test(h)) return '☀️';
        if (/afternoon|noon|midday|touch/.test(h)) return '🌤️';
        if (/evening|night|\bpm\b|bed|sleep/.test(h)) return '🌙';
        if (/week|sunday|saturday/.test(h)) return '📅';
        return '✨';
    },

    // Small inline pencil used for edit affordances in routines
    _pencilIcon(size = 'w-4 h-4') {
        return `<svg class="${size}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 18l1.464-4.536z"/></svg>`;
    },

    _renderRoutineCard(routine) {
        const isOpen = this.expandedRoutines.has(routine.id);
        const rid = window.Utils.escapeJsAttr(routine.id);
        const sectionCount = routine.sections.length;
        const stepCount = routine.sections.reduce((sum, s) => sum + (s.items || []).length, 0);
        const meta = sectionCount === 0
            ? 'Empty — tap to start'
            : `${sectionCount} ${sectionCount === 1 ? 'section' : 'sections'} · ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`;

        return `
            <details class="personalcare-routine-group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3"${isOpen ? ' open' : ''} ontoggle="PersonalCare.toggleRoutine('${rid}', this.open)">
                <summary class="cursor-pointer flex items-center gap-3 px-4 py-3.5">
                    <span class="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xl flex-shrink-0">✨</span>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 truncate">${window.Utils.escapeHtml(routine.name)}</p>
                        <p class="text-xs text-gray-400">${meta}</p>
                    </div>
                    <button onclick="event.preventDefault(); event.stopPropagation(); PersonalCare.openRoutineModal('${rid}')" class="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Edit Care Plan" aria-label="Edit care plan">
                        ${this._pencilIcon()}
                    </button>
                    <svg class="details-arrow w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </summary>
                <div class="border-t border-gray-100 p-3 space-y-3 bg-gray-50/50">
                    ${routine.sections.map(section => this._renderRoutineSection(routine, section)).join('')}
                    <button onclick="PersonalCare.openSectionModal('${rid}')" class="w-full py-2.5 rounded-xl border-2 border-dashed border-rose-200 text-rose-600 text-sm font-semibold hover:bg-rose-50 hover:border-rose-300 transition-all">
                        + Add section <span class="font-normal text-rose-400">(e.g. Morning, Night)</span>
                    </button>
                </div>
            </details>
        `;
    },

    _renderRoutineSection(routine, section) {
        const items = section.items;
        const rid = window.Utils.escapeJsAttr(routine.id);
        const sid = window.Utils.escapeJsAttr(section.id);
        const isOpen = this.expandedSections.has(`${routine.id}:${section.id}`);
        const count = items.length;
        return `
            <details class="personalcare-routine-section bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"${isOpen ? ' open' : ''} ontoggle="PersonalCare.toggleSection('${rid}', '${sid}', this.open)">
                <summary class="cursor-pointer flex items-center gap-2 px-3 py-2.5">
                    <span class="text-base">${this._sectionIcon(section.heading)}</span>
                    <span class="flex-1 min-w-0 font-bold text-sm text-gray-800 truncate">${window.Utils.escapeHtml(section.heading)}</span>
                    <span class="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">${count} ${count === 1 ? 'step' : 'steps'}</span>
                    <button onclick="event.preventDefault(); event.stopPropagation(); PersonalCare.openSectionModal('${rid}', '${sid}')" class="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Edit Section" aria-label="Edit section">
                        ${this._pencilIcon('w-3.5 h-3.5')}
                    </button>
                    <svg class="details-arrow w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </summary>
                <div class="px-3 pt-3 pb-2 border-t border-gray-100">
                    ${items.map((item, idx) => this._renderRoutineStep(routine, section, item, idx, items.length)).join('')}
                    <button onclick="PersonalCare.openRoutineItemModal('${rid}', '${sid}')" class="flex items-center gap-3 w-full py-1.5 text-left text-sm font-semibold text-rose-500 hover:text-rose-700 transition-colors">
                        <span class="w-6 h-6 rounded-full border-2 border-dashed border-rose-300 flex items-center justify-center text-xs flex-shrink-0">+</span>
                        Add step
                    </button>
                </div>
            </details>
        `;
    },

    /**
     * Render a single numbered flow step within a section, connected by a
     * dotted line to the next step (mirrors a step-by-step routine diagram).
     * The whole step is tappable to edit it (delete lives in the edit form).
     * The connector always continues down to the "Add step" row below.
     */
    _renderRoutineStep(routine, section, item, idx, total) {
        return `
            <div onclick="PersonalCare.openRoutineItemModal('${window.Utils.escapeJsAttr(routine.id)}', '${window.Utils.escapeJsAttr(section.id)}', '${window.Utils.escapeJsAttr(item.id)}')" class="relative flex gap-3 pb-4 cursor-pointer group" title="Tap to edit">
                <div class="absolute left-[11px] top-6 bottom-0 border-l-2 border-dotted border-rose-200"></div>
                <div class="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-[11px] font-bold text-white shadow-sm">${idx + 1}</div>
                <div class="flex-1 min-w-0 pt-0.5 rounded-lg group-hover:bg-rose-50/60 group-active:bg-rose-50 -mx-1.5 px-1.5 transition-colors">
                    <p class="text-sm font-semibold text-gray-800 leading-snug">${window.Utils.escapeHtml(item.title)}</p>
                    ${item.tag ? `<p class="text-xs italic text-rose-400 mt-0.5">${window.Utils.escapeHtml(item.tag)}</p>` : ''}
                    ${item.description ? `<p class="text-[13px] text-gray-600 mt-1 leading-relaxed">${this._renderStepDescription(item.description)}</p>` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Escape the step description, then render **bold** markers as <strong>.
     * Safe because the bolded text is itself the already-escaped substring.
     */
    _renderStepDescription(description) {
        const escaped = window.Utils.escapeHtml(description);
        return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    },

    /**
     * Open the small modal for creating a new routine (e.g. "Skincare"),
     * or for renaming an existing one when routineId is given.
     */
    openRoutineModal(routineId) {
        const routine = routineId ? this.getRoutineById(routineId) : null;
        const idInput = document.getElementById('personalcare-routine-modal-id');
        if (idInput) idInput.value = routine ? routine.id : '';
        document.getElementById('personalcare-routine-modal-name').value = routine ? routine.name : '';
        this._setModalHeading('personalcare-routine-modal-heading-text', routine ? 'Edit Care Plan' : 'Add Care Plan');
        this._toggleModalDelete('personalcare-routine-modal-delete', !!routine);
        document.getElementById('personalcare-routine-modal').classList.remove('hidden');
    },

    closeRoutineModal() {
        document.getElementById('personalcare-routine-modal').classList.add('hidden');
    },

    saveRoutineModal() {
        const input = document.getElementById('personalcare-routine-modal-name');
        const name = input.value.trim();
        if (!name) {
            window.Utils.showError('Care plan name is required');
            return;
        }
        const editingId = this._fieldValue('personalcare-routine-modal-id');
        if (editingId) {
            this.updateRoutine(editingId, name);
        } else {
            const routine = this.addRoutine(name);
            if (routine) this.expandedRoutines.add(routine.id);
        }
        this.closeRoutineModal();
        this.render();
        window.Utils.showSuccess(editingId ? 'Care plan updated' : 'Care plan added');
    },

    /**
     * Open the small modal for adding a section (e.g. "Morning") to a routine,
     * or for renaming an existing section when sectionId is given.
     */
    openSectionModal(routineId, sectionId) {
        const routine = this.getRoutineById(routineId);
        const section = (routine && sectionId)
            ? routine.sections.find(s => String(s.id) === String(sectionId))
            : null;
        document.getElementById('personalcare-section-modal-routine-id').value = routineId;
        const idInput = document.getElementById('personalcare-section-modal-section-id');
        if (idInput) idInput.value = section ? section.id : '';
        document.getElementById('personalcare-section-modal-heading').value = section ? section.heading : '';
        this._setModalHeading('personalcare-section-modal-heading-text', section ? 'Edit Section' : 'Add Section');
        this._toggleModalDelete('personalcare-section-modal-delete', !!section);
        document.getElementById('personalcare-section-modal').classList.remove('hidden');
    },

    closeSectionModal() {
        document.getElementById('personalcare-section-modal').classList.add('hidden');
    },

    saveSectionModal() {
        const routineId = document.getElementById('personalcare-section-modal-routine-id').value;
        const heading = document.getElementById('personalcare-section-modal-heading').value.trim();
        if (!heading) {
            window.Utils.showError('Section name is required');
            return;
        }
        const editingId = this._fieldValue('personalcare-section-modal-section-id');
        if (editingId) {
            this.updateRoutineSection(routineId, editingId, heading);
        } else {
            const section = this.addRoutineSection(routineId, heading);
            if (section) {
                this.expandedRoutines.add(routineId);
                this.expandedSections.add(`${routineId}:${section.id}`);
            }
        }
        this.closeSectionModal();
        this.render();
        window.Utils.showSuccess(editingId ? 'Section updated' : 'Section added');
    },

    /**
     * Open the small modal for adding a numbered flow step to a section.
     * Step Title's suggestions are seeded from past product names for
     * convenience, but the field accepts any free text (e.g. "Body Wash",
     * "Melt the SPF") since a step is a flow action, not necessarily a product.
     * When itemId is given, the modal is prefilled to edit that step.
     */
    openRoutineItemModal(routineId, sectionId, itemId) {
        const routine = this.getRoutineById(routineId);
        const section = routine ? routine.sections.find(s => String(s.id) === String(sectionId)) : null;
        const item = (section && itemId) ? section.items.find(i => String(i.id) === String(itemId)) : null;
        document.getElementById('personalcare-item-modal-routine-id').value = routineId;
        document.getElementById('personalcare-item-modal-section-id').value = sectionId;
        const idInput = document.getElementById('personalcare-item-modal-item-id');
        if (idInput) idInput.value = item ? item.id : '';
        document.getElementById('personalcare-item-modal-title').value = item ? item.title : '';
        document.getElementById('personalcare-item-modal-tag').value = item ? (item.tag || '') : '';
        document.getElementById('personalcare-item-modal-description').value = item ? (item.description || '') : '';
        this._setModalHeading('personalcare-item-modal-heading-text', item ? 'Edit Step' : 'Add Step');
        this._toggleModalDelete('personalcare-item-modal-delete', !!item);
        this.hideSuggestions('step');
        document.getElementById('personalcare-item-modal').classList.remove('hidden');
    },

    closeRoutineItemModal() {
        this.hideSuggestions('step');
        document.getElementById('personalcare-item-modal').classList.add('hidden');
    },

    saveRoutineItemModal() {
        const routineId = document.getElementById('personalcare-item-modal-routine-id').value;
        const sectionId = document.getElementById('personalcare-item-modal-section-id').value;
        const title = document.getElementById('personalcare-item-modal-title').value.trim();
        const tag = document.getElementById('personalcare-item-modal-tag').value.trim();
        const description = document.getElementById('personalcare-item-modal-description').value.trim();
        if (!title) {
            window.Utils.showError('Step title is required');
            return;
        }
        const editingId = this._fieldValue('personalcare-item-modal-item-id');
        if (editingId) {
            this.updateRoutineItem(routineId, sectionId, editingId, title, tag, description);
        } else {
            if (this.addRoutineItem(routineId, sectionId, title, tag, description)) {
                this.expandedRoutines.add(routineId);
                this.expandedSections.add(`${routineId}:${sectionId}`);
            }
        }
        this.closeRoutineItemModal();
        this.render();
        window.Utils.showSuccess(editingId ? 'Step updated' : 'Step added');
    },

    async deleteFromRoutineModal() {
        const id = this._fieldValue('personalcare-routine-modal-id');
        if (!id) return;
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this care plan and all its sections. Are you sure?',
            'Delete Care Plan'
        );
        if (!confirmed) return;
        this.deleteRoutine(id);
        this.closeRoutineModal();
        this.render();
        window.Utils.showSuccess('Care plan deleted');
    },

    async deleteFromSectionModal() {
        const routineId = this._fieldValue('personalcare-section-modal-routine-id');
        const sectionId = this._fieldValue('personalcare-section-modal-section-id');
        if (!routineId || !sectionId) return;
        const confirmed = await window.Utils.confirm(
            'Delete this section and all its steps?',
            'Delete Section'
        );
        if (!confirmed) return;
        this.deleteRoutineSection(routineId, sectionId);
        this.closeSectionModal();
        this.render();
        window.Utils.showSuccess('Section deleted');
    },

    async deleteFromRoutineItemModal() {
        const routineId = this._fieldValue('personalcare-item-modal-routine-id');
        const sectionId = this._fieldValue('personalcare-item-modal-section-id');
        const itemId = this._fieldValue('personalcare-item-modal-item-id');
        if (!routineId || !sectionId || !itemId) return;
        const confirmed = await window.Utils.confirm('Delete this step?', 'Delete Step');
        if (!confirmed) return;
        this.deleteRoutineItem(routineId, sectionId, itemId);
        this.closeRoutineItemModal();
        this.render();
        window.Utils.showSuccess('Step deleted');
    },

    async handleDeleteRoutine(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this care plan and all its sections. Are you sure?',
            'Delete Care Plan'
        );
        if (!confirmed) return;
        this.deleteRoutine(id);
        this.render();
        window.Utils.showSuccess('Care plan deleted');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.PersonalCare = PersonalCare;
}
