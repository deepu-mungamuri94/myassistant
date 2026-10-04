/**
 * Personal Care Module
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
    activeFilter: 'all',
    activeTab: 'items', // 'items' | 'routines'

    CATEGORIES: {
        cold_flu: { label: 'Cold & Flu', color: 'from-sky-400 to-blue-400', headerColor: 'from-sky-200 to-blue-200 hover:from-sky-300 hover:to-blue-300' },
        fever: { label: 'Fever', color: 'from-red-400 to-orange-400', headerColor: 'from-red-200 to-orange-200 hover:from-red-300 hover:to-orange-300' },
        skin_care: { label: 'Skin Care', color: 'from-pink-400 to-rose-400', headerColor: 'from-pink-200 to-rose-200 hover:from-pink-300 hover:to-rose-300' },
        baby_care: { label: 'Baby Care', color: 'from-amber-400 to-yellow-400', headerColor: 'from-amber-200 to-yellow-200 hover:from-amber-300 hover:to-yellow-300' },
        first_aid: { label: 'First Aid', color: 'from-emerald-400 to-teal-400', headerColor: 'from-emerald-200 to-teal-200 hover:from-emerald-300 hover:to-teal-300' },
        other: { label: 'Other', color: 'from-gray-400 to-slate-400', headerColor: 'from-gray-200 to-slate-200 hover:from-gray-300 hover:to-slate-300' }
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
        const items = window.DB.personalCareItems || [];
        const names = new Set();
        items.forEach(i => { if (i.person) names.add(i.person); });
        return Array.from(names).sort();
    },

    /**
     * Given a product name, find the most recently used category for it.
     * Powers auto-detection of category from history (mirrors how expense
     * title-autocomplete carries category along with it).
     */
    getLastCategoryForName(name) {
        if (!name) return null;
        const items = window.DB.personalCareItems || [];
        const matches = items
            .filter(i => i.name && i.name.toLowerCase() === name.toLowerCase())
            .sort((a, b) => {
                const dateA = new Date(a.date || a.createdAt || 0);
                const dateB = new Date(b.date || a.createdAt || 0);
                return dateB - dateA;
            });
        return matches.length > 0 ? matches[0].category : null;
    },

    /**
     * Render the category filter dropdown (grouped-by-category selector)
     */
    renderFilters() {
        const select = document.getElementById('personalcare-filter-select');
        if (!select) return;

        const items = window.DB.personalCareItems || [];
        const counts = {};
        items.forEach(i => {
            const cat = i.category || 'other';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        const options = [`<option value="all">All Categories (${items.length})</option>`].concat(
            Object.keys(this.CATEGORIES)
                .filter(key => counts[key])
                .map(key => `<option value="${key}">${window.Utils.escapeHtml(this.CATEGORIES[key].label)} (${counts[key]})</option>`)
        );

        select.innerHTML = options.join('');
        select.value = this.activeFilter;
    },

    /**
     * Render the Items / Routines tab switcher
     */
    renderTabs() {
        const itemsTab = document.getElementById('personalcare-tab-items');
        const routinesTab = document.getElementById('personalcare-tab-routines');
        if (!itemsTab || !routinesTab) return;

        const activeClass = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-rose-500 text-rose-600 flex items-center justify-center gap-2';
        const inactiveClass = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';

        itemsTab.className = this.activeTab === 'items' ? activeClass : inactiveClass;
        routinesTab.className = this.activeTab === 'routines' ? activeClass : inactiveClass;
    },

    /**
     * Render the grouped item list
     */
    render() {
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
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 px-4">
                    <div class="bg-gradient-to-br from-rose-100 to-pink-100 rounded-full p-6 mb-4">
                        <svg class="w-16 h-16 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 2a1 1 0 00-1 1v3H5a3 3 0 00-3 3v9a3 3 0 003 3h14a3 3 0 003-3v-9a3 3 0 00-3-3h-3V3a1 1 0 00-1-1H9z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11v4m-2-2h4"/>
                        </svg>
                    </div>
                    <p class="text-gray-500 text-center font-medium">No items yet</p>
                    <p class="text-gray-400 text-sm text-center mt-1">Tap the + button to add medicines or skincare products</p>
                </div>
            `;
            return;
        }

        const filtered = this.activeFilter === 'all'
            ? items
            : items.filter(i => i.category === this.activeFilter);

        if (filtered.length === 0) {
            list.innerHTML = `<p class="text-gray-400 text-sm text-center py-10">No items in this category</p>`;
            return;
        }

        const groupedByCategory = {};
        filtered.forEach(item => {
            const category = item.category || 'other';
            if (!groupedByCategory[category]) groupedByCategory[category] = [];
            groupedByCategory[category].push(item);
        });

        list.innerHTML = Object.keys(groupedByCategory).map(category => {
            const config = this.CATEGORIES[category] || this.CATEGORIES.other;
            const categoryItems = groupedByCategory[category];
            const count = categoryItems.length;

            return `
                <details class="personalcare-category-group bg-white rounded-lg border border-gray-200 overflow-hidden mb-2" open>
                    <summary class="cursor-pointer px-4 py-2.5 bg-gradient-to-r ${config.headerColor} transition-colors flex justify-between items-center" onclick="PersonalCare.toggleCategory('${window.Utils.escapeJsAttr(category)}')">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 transition-transform duration-200 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                            <span class="font-semibold text-gray-700 text-sm">${window.Utils.escapeHtml(config.label)}</span>
                        </div>
                        <span class="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br ${config.color} text-white text-xs font-bold">${count}</span>
                    </summary>
                    <div class="divide-y divide-gray-200">
                        ${categoryItems.map(item => this._renderItemRow(item)).join('')}
                    </div>
                </details>
            `;
        }).join('');
    },

    /**
     * Render a single item row
     */
    _renderItemRow(item) {
        const price = item.price != null ? `${window.Utils.escapeHtml(item.currency || 'INR')} ${window.Utils.formatIndianNumber(item.price)}` : '';
        const personAge = item.person
            ? `${window.Utils.escapeHtml(item.person)}${item.age != null ? ` (${window.Utils.escapeHtml(item.age)})` : ''}`
            : '';
        const date = item.date ? window.Utils.escapeHtml(item.date) : '';

        return `
            <div class="px-4 py-3 hover:bg-rose-50 transition-colors">
                <div class="flex justify-between items-center mb-1">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        <span class="font-semibold text-gray-800 text-sm truncate">${window.Utils.escapeHtml(item.name)}</span>
                    </div>
                    <div class="flex gap-1 ml-2 flex-shrink-0">
                        <button onclick="PersonalCare.editItem('${window.Utils.escapeJsAttr(item.id)}')" class="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-all" title="Edit">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="PersonalCare.handleDelete('${window.Utils.escapeJsAttr(item.id)}')" class="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-all" title="Delete">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                ${item.uses ? `<p class="text-xs text-gray-600 leading-relaxed pl-0">${window.Utils.escapeHtml(item.uses)}</p>` : ''}
                ${item.description ? `<p class="text-xs text-gray-500 leading-relaxed pl-0 mt-0.5">${window.Utils.escapeHtml(item.description)}</p>` : ''}
                <div class="flex justify-between items-center mt-1">
                    <span class="text-xs text-gray-400">${[personAge, date].filter(Boolean).join(' · ')}</span>
                    <span class="text-xs font-semibold text-rose-600">${price}</span>
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
            title.textContent = 'Edit Item';
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
            title.textContent = 'Add Item';
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

        this.renderNameSuggestionsList();
        this.renderPersonSuggestionsList();
        modal.classList.remove('hidden');
    },

    /**
     * Populate the product-name datalist from history (name autocomplete)
     */
    renderNameSuggestionsList() {
        const datalist = document.getElementById('personalcare-name-list');
        if (!datalist) return;
        const items = window.DB.personalCareItems || [];
        const names = Array.from(new Set(items.map(i => i.name).filter(Boolean))).sort();
        datalist.innerHTML = names.map(name => `<option value="${window.Utils.escapeHtml(name)}">`).join('');
    },

    /**
     * Populate the person-name datalist from history
     */
    renderPersonSuggestionsList() {
        const datalist = document.getElementById('personalcare-person-list');
        if (!datalist) return;
        datalist.innerHTML = this.getPersonNameSuggestions()
            .map(name => `<option value="${window.Utils.escapeHtml(name)}">`).join('');
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

        this.closeModal();
        this.render();
        window.Utils.showSuccess(id ? 'Item updated' : 'Item added');
    },

    /**
     * Delete with confirmation
     */
    async handleDelete(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this item. Are you sure?',
            'Delete Item'
        );
        if (!confirmed) return;

        this.delete(id);
        this.render();
        window.Utils.showSuccess('Item deleted');
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
     * Remove a product from a routine section
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
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 px-4">
                    <div class="bg-gradient-to-br from-rose-100 to-pink-100 rounded-full p-6 mb-4">
                        <svg class="w-16 h-16 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                        </svg>
                    </div>
                    <p class="text-gray-500 text-center font-medium">No routines yet</p>
                    <p class="text-gray-400 text-sm text-center mt-1">Create a routine (e.g. Skincare) and add Morning / Night sections</p>
                </div>
            `;
            return;
        }

        list.innerHTML = routines.map(routine => this._renderRoutineCard(routine)).join('');
    },

    _renderRoutineCard(routine) {
        const isOpen = this.expandedRoutines.has(routine.id);
        return `
            <details class="personalcare-routine-group bg-white rounded-xl border-2 border-rose-200 overflow-hidden mb-3"${isOpen ? ' open' : ''} ontoggle="PersonalCare.toggleRoutine('${window.Utils.escapeJsAttr(routine.id)}', this.open)">
                <summary class="cursor-pointer flex justify-between items-center px-4 py-3 bg-gradient-to-r from-rose-100 to-pink-100">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 transition-transform duration-200 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                        <span class="font-bold text-gray-800">${window.Utils.escapeHtml(routine.name)}</span>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="event.preventDefault(); event.stopPropagation(); PersonalCare.openSectionModal('${window.Utils.escapeJsAttr(routine.id)}')" class="p-1.5 text-rose-600 hover:bg-rose-200 rounded-lg transition-all" title="Add Section">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                        <button onclick="event.preventDefault(); event.stopPropagation(); PersonalCare.handleDeleteRoutine('${window.Utils.escapeJsAttr(routine.id)}')" class="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-all" title="Delete Routine">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </summary>
                <div class="p-3 space-y-3">
                    ${routine.sections.length === 0
                        ? `<p class="text-gray-400 text-sm text-center py-4">No sections yet. Tap + to add one (e.g. Morning, Night).</p>`
                        : routine.sections.map(section => this._renderRoutineSection(routine, section)).join('')}
                </div>
            </details>
        `;
    },

    _renderRoutineSection(routine, section) {
        const items = section.items;
        return `
            <div class="border border-rose-100 rounded-lg overflow-hidden">
                <div class="flex justify-between items-center px-3 py-2 bg-rose-50">
                    <span class="font-semibold text-sm text-gray-700">${window.Utils.escapeHtml(section.heading)}</span>
                    <div class="flex gap-1">
                        <button onclick="PersonalCare.openRoutineItemModal('${window.Utils.escapeJsAttr(routine.id)}', '${window.Utils.escapeJsAttr(section.id)}')" class="p-1 text-rose-600 hover:bg-rose-200 rounded transition-all" title="Add Step">
                            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                        <button onclick="PersonalCare.deleteRoutineSection('${window.Utils.escapeJsAttr(routine.id)}', '${window.Utils.escapeJsAttr(section.id)}'); PersonalCare.render();" class="p-1 text-red-500 hover:bg-red-100 rounded transition-all" title="Delete Section">
                            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="px-3 py-2">
                    ${items.length === 0
                        ? `<p class="text-gray-400 text-xs text-center py-3">No steps yet. Tap + to add one.</p>`
                        : items.map((item, idx) => this._renderRoutineStep(routine, section, item, idx, items.length)).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Render a single numbered flow step within a section, connected by a
     * dotted line to the next step (mirrors a step-by-step routine diagram).
     */
    _renderRoutineStep(routine, section, item, idx, total) {
        const isLast = idx === total - 1;
        return `
            <div class="relative flex gap-3 ${isLast ? '' : 'pb-4'}">
                ${isLast ? '' : `<div class="absolute left-[11px] top-6 bottom-0 border-l-2 border-dotted border-rose-200"></div>`}
                <div class="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-white border-2 border-rose-400 flex items-center justify-center text-xs font-bold text-rose-600">${idx + 1}</div>
                <div class="flex-1 min-w-0 pt-0.5">
                    <div class="flex justify-between items-start gap-2">
                        <span class="text-sm font-semibold text-gray-800">${window.Utils.escapeHtml(item.title)}</span>
                        <button onclick="PersonalCare.deleteRoutineItem('${window.Utils.escapeJsAttr(routine.id)}', '${window.Utils.escapeJsAttr(section.id)}', '${window.Utils.escapeJsAttr(item.id)}'); PersonalCare.render();" class="p-1 text-red-500 hover:bg-red-100 rounded transition-all flex-shrink-0" title="Remove">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    ${item.tag ? `<p class="text-xs italic text-gray-400 mt-0.5">${window.Utils.escapeHtml(item.tag)}</p>` : ''}
                    ${item.description ? `<p class="text-sm text-gray-600 mt-1 leading-relaxed">${this._renderStepDescription(item.description)}</p>` : ''}
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
     * Open the small modal for creating a new routine (e.g. "Skincare")
     */
    openRoutineModal() {
        const input = document.getElementById('personalcare-routine-modal-name');
        input.value = '';
        document.getElementById('personalcare-routine-modal').classList.remove('hidden');
    },

    closeRoutineModal() {
        document.getElementById('personalcare-routine-modal').classList.add('hidden');
    },

    saveRoutineModal() {
        const input = document.getElementById('personalcare-routine-modal-name');
        const name = input.value.trim();
        if (!name) {
            window.Utils.showError('Routine name is required');
            return;
        }
        this.addRoutine(name);
        this.closeRoutineModal();
        this.render();
        window.Utils.showSuccess('Routine added');
    },

    /**
     * Open the small modal for adding a section (e.g. "Morning") to a routine
     */
    openSectionModal(routineId) {
        document.getElementById('personalcare-section-modal-routine-id').value = routineId;
        document.getElementById('personalcare-section-modal-heading').value = '';
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
        this.addRoutineSection(routineId, heading);
        this.closeSectionModal();
        this.render();
        window.Utils.showSuccess('Section added');
    },

    /**
     * Open the small modal for adding a numbered flow step to a section.
     * Step Title's datalist is seeded from past product names for
     * convenience, but the field accepts any free text (e.g. "Body Wash",
     * "Melt the SPF") since a step is a flow action, not necessarily a product.
     */
    openRoutineItemModal(routineId, sectionId) {
        document.getElementById('personalcare-item-modal-routine-id').value = routineId;
        document.getElementById('personalcare-item-modal-section-id').value = sectionId;
        document.getElementById('personalcare-item-modal-title').value = '';
        document.getElementById('personalcare-item-modal-tag').value = '';
        document.getElementById('personalcare-item-modal-description').value = '';
        const datalist = document.getElementById('personalcare-routine-product-list');
        if (datalist) {
            const names = Array.from(new Set((window.DB.personalCareItems || []).map(i => i.name).filter(Boolean))).sort();
            datalist.innerHTML = names.map(name => `<option value="${window.Utils.escapeHtml(name)}">`).join('');
        }
        document.getElementById('personalcare-item-modal').classList.remove('hidden');
    },

    closeRoutineItemModal() {
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
        this.addRoutineItem(routineId, sectionId, title, tag, description);
        this.closeRoutineItemModal();
        this.render();
        window.Utils.showSuccess('Step added');
    },

    async handleDeleteRoutine(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this routine and all its sections. Are you sure?',
            'Delete Routine'
        );
        if (!confirmed) return;
        this.deleteRoutine(id);
        this.render();
        window.Utils.showSuccess('Routine deleted');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.PersonalCare = PersonalCare;
}
