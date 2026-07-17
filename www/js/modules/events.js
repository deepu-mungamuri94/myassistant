/**
 * Events Module
 * Handles event expense tracking and aggregation.
 *
 * Events are not a separate entity — an "event" is just an `event: "Goa Trip"`
 * string tag on an ordinary expense in window.DB.expenses. This module renders a
 * 3-level drill-down (Event → Title → individual expenses) inside the Expenses hub.
 *
 * Date-filter aware: getEventSummary / renderInExpensesList accept an optional
 * [startDate, endDate] range and delegate the actual in-range test to
 * Expenses.isExpenseInRange so events filter with the EXACT same budget-month-aware
 * semantics as the List/Calendar views. Passing null/null (the default) means
 * all-time, which preserves the original contract.
 */

const Events = {
    // Track expanded state for drill-down
    expandedEvents: new Set(),
    expandedTitles: new Map(), // Map<eventName, Set<title>>

    /**
     * Get event summary with hierarchical breakdown.
     * Structure: Event → Title → Individual Expenses (with category as tag).
     * @param {string} searchTerm - Optional search term to filter events/expenses
     * @param {string|null} startDate - Optional 'YYYY-MM-DD' range start (null = all-time)
     * @param {string|null} endDate - Optional 'YYYY-MM-DD' range end (null = all-time)
     */
    getEventSummary(searchTerm = '', startDate = null, endDate = null) {
        const eventMap = {};
        const search = searchTerm ? searchTerm.toLowerCase() : '';
        const hasRange = !!(startDate && endDate);
        // Reuse the app's single source of truth for range membership so Events filter
        // identically to List/Calendar. Degrade to all-time if Expenses isn't loaded.
        const inRange = (expense) => {
            if (!hasRange) return true;
            if (window.Expenses && typeof window.Expenses.isExpenseInRange === 'function') {
                return window.Expenses.isExpenseInRange(expense, startDate, endDate);
            }
            return true;
        };

        window.DB.expenses.forEach(expense => {
            if (!expense.event || !expense.event.trim()) return;

            // Date-range filter (fixes the old silent bypass where Events ignored it)
            if (!inRange(expense)) return;

            // Apply search filter
            if (search) {
                const matchesSearch =
                    (expense.event && expense.event.toLowerCase().includes(search)) ||
                    (expense.title && expense.title.toLowerCase().includes(search)) ||
                    (expense.description && expense.description.toLowerCase().includes(search)) ||
                    (expense.category && expense.category.toLowerCase().includes(search));

                if (!matchesSearch) return;
            }

            const eventName = expense.event.trim();

            if (!eventMap[eventName]) {
                eventMap[eventName] = {
                    name: eventName,
                    total: 0,
                    expenseCount: 0,
                    minDate: null,
                    maxDate: null,
                    byTitle: {}
                };
            }

            const event = eventMap[eventName];
            event.total += expense.amount;
            event.expenseCount++;

            // Track date range
            const expDate = new Date(expense.date);
            if (!event.minDate || expDate < event.minDate) event.minDate = expDate;
            if (!event.maxDate || expDate > event.maxDate) event.maxDate = expDate;

            // Group by title
            const title = expense.title;
            if (!event.byTitle[title]) {
                event.byTitle[title] = {
                    title: title,
                    total: 0,
                    count: 0,
                    expenses: []
                };
            }

            event.byTitle[title].total += expense.amount;
            event.byTitle[title].count++;
            event.byTitle[title].expenses.push({
                id: expense.id,
                date: expense.date,
                amount: expense.amount,
                description: expense.description,
                category: expense.category || 'Other'
            });
        });

        // Convert to array and format
        const events = Object.values(eventMap).map(event => {
            // Format date range
            let dateRange = '';
            if (event.minDate && event.maxDate) {
                const minMonth = event.minDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                const maxMonth = event.maxDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                dateRange = minMonth === maxMonth ? minMonth : `${minMonth} - ${maxMonth}`;
            }

            // Convert byTitle to array, sort by earliest date (ascending)
            const byTitle = Object.values(event.byTitle)
                .map(t => {
                    // Sort expenses by date (chronological)
                    t.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
                    // Track earliest date for sorting
                    t.earliestDate = t.expenses.length > 0 ? new Date(t.expenses[0].date) : new Date();
                    return t;
                })
                .sort((a, b) => a.earliestDate - b.earliestDate);

            return {
                name: event.name,
                total: event.total,
                expenseCount: event.expenseCount,
                dateRange: dateRange,
                byTitle: byTitle
            };
        });

        // Sort events by total (highest first)
        events.sort((a, b) => b.total - a.total);

        return events;
    },

    /**
     * Resolve category info (icon + gradient color) for display. Expense category
     * values are inconsistent (display NAME for user-picked, lowercase ID for auto
     * rows), so try name → id → shared default — same chain as Expenses._getCategoryInfo.
     */
    getCategoryInfo(categoryName) {
        const EC = window.ExpenseCategories;
        if (!EC) return { id: 'other', name: categoryName || 'Other', icon: '📁', color: 'from-gray-400 to-gray-600' };
        return (EC.getByName && EC.getByName(categoryName))
            || (EC.getById && EC.getById(categoryName))
            || EC.getCategoryOrDefault(categoryName);
    },

    /**
     * Small category avatar (emoji on gradient) — mirrors Expenses._categoryAvatar
     * so events read with the same visual kit.
     */
    categoryAvatar(categoryName, size = 'w-9 h-9') {
        const cat = this.getCategoryInfo(categoryName);
        return `<div class="${size} rounded-full bg-gradient-to-br ${cat.color} flex items-center justify-center flex-shrink-0 text-base">${cat.icon}</div>`;
    },

    /**
     * "Jul 1, 2026 - Jul 31, 2026" label for a passed range.
     */
    formatRangeLabel(startDate, endDate) {
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        const s = new Date(startDate).toLocaleDateString('en-US', options);
        const e = new Date(endDate).toLocaleDateString('en-US', options);
        return s === e ? s : `${s} - ${e}`;
    },

    /**
     * Render events into the expenses list container.
     * @param {HTMLElement} container - The container to render into
     * @param {string} searchTerm - Optional search term to filter events
     * @param {string|null} startDate - Optional 'YYYY-MM-DD' range start (null = all-time)
     * @param {string|null} endDate - Optional 'YYYY-MM-DD' range end (null = all-time)
     */
    renderInExpensesList(container, searchTerm = '', startDate = null, endDate = null) {
        const isAllTime = !(startDate && endDate);
        const events = this.getEventSummary(searchTerm, startDate, endDate);

        // Range note: shows current scope + a one-tap escape to the other scope.
        const rangeNote = `
            <div class="flex items-center justify-between gap-2 mb-3 px-3 py-2 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl">
                <span class="text-xs text-pink-700 flex items-center gap-1.5 min-w-0">
                    <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span class="truncate">${isAllTime ? 'Showing all events' : `Events in ${Utils.escapeHtml(this.formatRangeLabel(startDate, endDate))}`}</span>
                </span>
                <button onclick="if(window.Expenses) Expenses.toggleEventsAllTime();"
                        class="text-xs font-semibold text-pink-700 bg-white border border-pink-200 rounded-full px-3 py-1 hover:bg-pink-50 transition-colors flex-shrink-0"
                        aria-label="${isAllTime ? 'Filter events by the selected date range' : 'Show events from all time'}">
                    ${isAllTime ? 'Use date filter' : 'All time'}
                </button>
            </div>
        `;

        if (events.length === 0) {
            // Distinguish "no events at all" (onboarding) from "none in this range".
            container.innerHTML = isAllTime
                ? `
                    <div class="text-center py-12">
                        <div class="text-6xl mb-4">🎉</div>
                        <h3 class="text-xl font-bold text-gray-700 mb-2">No Events Yet</h3>
                        <p class="text-gray-500 mb-4">Track special occasions like birthdays, weddings, or trips by adding an event tag to your expenses.</p>
                        <p class="text-sm text-gray-400">Add Expense → Enter Event name</p>
                    </div>
                `
                : `
                    ${rangeNote}
                    <div class="text-center py-10">
                        <div class="text-5xl mb-3">🗓️</div>
                        <h3 class="text-lg font-bold text-gray-700 mb-2">No events in this period</h3>
                        <p class="text-gray-500 text-sm mb-4">There are no event-tagged expenses in ${Utils.escapeHtml(this.formatRangeLabel(startDate, endDate))}.</p>
                        <button onclick="if(window.Expenses) Expenses.toggleEventsAllTime();"
                                class="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:shadow-lg transition-all font-semibold text-sm">
                            View all events
                        </button>
                    </div>
                `;
            return;
        }

        // Render each event with collapsible structure (pink-rose identity)
        container.innerHTML = rangeNote + events.map(event => {
            const isExpanded = this.expandedEvents.has(event.name);
            const expandedTitles = this.expandedTitles.get(event.name) || new Set();
            // Safe for the onclick JS-string-in-HTML-attribute context; decodes back
            // to the RAW name at click time, so it also correctly keys expandedEvents.
            const eventKey = Utils.escapeJsAttr(event.name);

            return `
                <div class="bg-white rounded-2xl border border-pink-200 overflow-hidden mb-3 shadow-sm">
                    <!-- Level 1: Event Header -->
                    <button type="button" class="w-full text-left p-3 cursor-pointer bg-gradient-to-r from-pink-100 to-rose-100 hover:from-pink-200 hover:to-rose-200 transition-colors"
                         onclick="Events.toggleEventExpand('${eventKey}')"
                         aria-expanded="${isExpanded}" aria-label="Toggle ${Utils.escapeHtml(event.name)}">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2 min-w-0">
                                <svg class="w-4 h-4 text-pink-600 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                </svg>
                                <div class="min-w-0">
                                    <span class="font-bold text-sm text-pink-900 block truncate">🎉 ${Utils.escapeHtml(event.name)}</span>
                                    <p class="text-xs text-pink-600">${Utils.escapeHtml(event.dateRange)} • ${event.expenseCount} expense${event.expenseCount !== 1 ? 's' : ''}</p>
                                </div>
                            </div>
                            <span class="font-bold text-sm text-pink-900 tabular-nums flex-shrink-0">₹${Utils.formatIndianNumber(event.total)}</span>
                        </div>
                    </button>

                    <!-- Level 2: Grouped by Title -->
                    ${isExpanded ? `
                        <div class="p-2 space-y-2 bg-pink-50/60">
                            ${event.byTitle.map(titleGroup => {
                                const isTitleExpanded = expandedTitles.has(titleGroup.title);
                                const hasMultiple = titleGroup.count > 1;
                                const category = titleGroup.expenses[0].category;
                                const titleKey = Utils.escapeJsAttr(titleGroup.title);

                                return `
                                    <div class="bg-white rounded-xl border border-pink-100 overflow-hidden">
                                        <!-- Title Row -->
                                        <button type="button" class="w-full text-left p-2.5 px-3 cursor-pointer hover:bg-pink-50 transition-colors flex items-center justify-between gap-2"
                                             onclick="Events.toggleTitleExpand('${eventKey}', '${titleKey}')"
                                             aria-expanded="${isTitleExpanded}">
                                            <div class="flex items-center gap-2.5 flex-1 min-w-0">
                                                ${this.categoryAvatar(category, 'w-8 h-8')}
                                                <div class="min-w-0">
                                                    <div class="flex items-center gap-1.5">
                                                        <span class="font-semibold text-sm text-gray-800 truncate">${Utils.escapeHtml(titleGroup.title)}</span>
                                                        ${hasMultiple ? `<span class="text-[11px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full flex-shrink-0">${titleGroup.count}</span>` : ''}
                                                    </div>
                                                    <span class="text-xs text-gray-500 truncate block">${Utils.escapeHtml(this.getCategoryInfo(category).name)}</span>
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                                <span class="text-sm font-bold text-pink-700 tabular-nums">₹${Utils.formatIndianNumber(titleGroup.total)}</span>
                                                <svg class="w-3.5 h-3.5 text-pink-400 transition-transform ${isTitleExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                                </svg>
                                            </div>
                                        </button>

                                        <!-- Level 3: Individual expenses -->
                                        ${isTitleExpanded ? `
                                            <div class="border-t border-pink-100">
                                                ${titleGroup.expenses.map((exp, idx) => `
                                                    <div class="p-2.5 px-3 pl-6 ${idx > 0 ? 'border-t border-pink-50' : ''} bg-gray-50/70 flex justify-between items-start gap-2">
                                                        <div class="flex-1 min-w-0">
                                                            <span class="text-xs font-medium text-gray-600">
                                                                ${new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                            ${exp.description ? `<p class="text-xs text-gray-400 truncate">${Utils.escapeHtml(exp.description)}</p>` : ''}
                                                        </div>
                                                        <span class="text-xs font-semibold text-pink-600 tabular-nums ml-2 flex-shrink-0">₹${Utils.formatIndianNumber(exp.amount)}</span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    /**
     * Render category as a small tag/label (kept for any external callers).
     */
    renderCategoryTag(categoryName) {
        const catInfo = this.getCategoryInfo(categoryName);
        return `<span class="inline-flex items-center gap-0.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded flex-shrink-0">
            <span class="text-xs">${catInfo.icon}</span>
            <span>${Utils.escapeHtml(catInfo.name)}</span>
        </span>`;
    },

    /**
     * Toggle event expansion
     */
    toggleEventExpand(eventName) {
        if (this.expandedEvents.has(eventName)) {
            this.expandedEvents.delete(eventName);
        } else {
            this.expandedEvents.add(eventName);
        }
        // Re-render via Expenses
        if (window.Expenses) {
            window.Expenses.render();
        }
    },

    /**
     * Toggle title expansion within an event
     */
    toggleTitleExpand(eventName, title) {
        if (!this.expandedTitles.has(eventName)) {
            this.expandedTitles.set(eventName, new Set());
        }
        const titles = this.expandedTitles.get(eventName);
        if (titles.has(title)) {
            titles.delete(title);
        } else {
            titles.add(title);
        }
        // Re-render via Expenses
        if (window.Expenses) {
            window.Expenses.render();
        }
    },

    /**
     * Legacy render function (no longer used, kept for compatibility)
     */
    render() {
        // Redirect to expenses with events view mode
        if (window.Expenses) {
            window.Expenses.viewMode = 'events';
            window.Expenses.render();
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Events = Events;
}
