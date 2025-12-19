/**
 * Events Module
 * Handles event expense tracking and aggregation
 */

const Events = {
    // Track expanded state for drill-down
    expandedEvents: new Set(),
    expandedTitles: new Map(), // Map<eventName, Set<title>>
    
    /**
     * Get event summary with hierarchical breakdown
     * Structure: Event → Title → Individual Expenses (with category as tag)
     * @param {string} searchTerm - Optional search term to filter events/expenses
     */
    getEventSummary(searchTerm = '') {
        const eventMap = {};
        const search = searchTerm ? searchTerm.toLowerCase() : '';
        
        window.DB.expenses.forEach(expense => {
            if (!expense.event || !expense.event.trim()) return;
            
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
            
            // Convert byTitle to array, sort by total (highest first)
            const byTitle = Object.values(event.byTitle)
                .map(t => {
                    // Sort expenses by date (chronological)
                    t.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
                    return t;
                })
                .sort((a, b) => b.total - a.total);
            
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
     * Get category info for display
     */
    getCategoryInfo(categoryName) {
        if (window.ExpenseCategories && window.ExpenseCategories.getCategoryOrDefault) {
            return window.ExpenseCategories.getCategoryOrDefault(categoryName);
        }
        return { name: categoryName, icon: '📁', color: 'bg-gray-500' };
    },
    
    /**
     * Render events into the expenses list container
     * @param {HTMLElement} container - The container to render into
     * @param {string} searchTerm - Optional search term to filter events
     */
    renderInExpensesList(container, searchTerm = '') {
        const events = this.getEventSummary(searchTerm);
        
        if (events.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">🎉</div>
                    <h3 class="text-xl font-bold text-gray-700 mb-2">No Events Yet</h3>
                    <p class="text-gray-500 mb-4">Track special occasions like birthdays, weddings, or trips by adding an event tag to your expenses.</p>
                    <p class="text-sm text-gray-400">Add Expense → Enter Event name</p>
                </div>
            `;
            return;
        }
        
        // Render each event with collapsible structure (matching expense page styling)
        container.innerHTML = events.map(event => {
            const isExpanded = this.expandedEvents.has(event.name);
            const expandedTitles = this.expandedTitles.get(event.name) || new Set();
            
            return `
                <div class="bg-white rounded-xl border border-pink-200 overflow-hidden mb-3">
                    <!-- Level 1: Event Header -->
                    <div class="p-3 cursor-pointer bg-gradient-to-r from-pink-100 to-rose-100 hover:from-pink-200 hover:to-rose-200 transition-colors" 
                         onclick="Events.toggleEventExpand('${Utils.escapeHtml(event.name).replace(/'/g, "\\'")}')">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-pink-600 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                </svg>
                                <div>
                                    <span class="font-bold text-sm text-pink-900">🎉 ${Utils.escapeHtml(event.name)}</span>
                                    <p class="text-xs text-pink-600">${event.dateRange} • ${event.expenseCount} expense${event.expenseCount !== 1 ? 's' : ''}</p>
                                </div>
                            </div>
                            <span class="font-bold text-sm text-pink-900">${Utils.formatCurrency(event.total)}</span>
                        </div>
                    </div>
                    
                    <!-- Level 2: Grouped by Title -->
                    ${isExpanded ? `
                        <div class="p-2 space-y-1 bg-pink-50">
                            ${event.byTitle.map(titleGroup => {
                                const isTitleExpanded = expandedTitles.has(titleGroup.title);
                                const hasMultiple = titleGroup.count > 1;
                                const category = titleGroup.expenses[0].category;
                                
                                return `
                                    <div class="bg-white rounded-lg border border-pink-100 overflow-hidden">
                                        <!-- Title Row (consistent for all items) -->
                                        <div class="p-2 px-3 cursor-pointer hover:bg-pink-50 transition-colors flex items-center justify-between"
                                             onclick="Events.toggleTitleExpand('${Utils.escapeHtml(event.name).replace(/'/g, "\\'")}', '${Utils.escapeHtml(titleGroup.title).replace(/'/g, "\\'")}')">
                                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                                <svg class="w-3 h-3 text-pink-400 transition-transform flex-shrink-0 ${isTitleExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                                </svg>
                                                <span class="font-medium text-sm text-gray-800 truncate">${Utils.escapeHtml(titleGroup.title)}</span>
                                                ${this.renderCategoryTag(category)}
                                                ${hasMultiple ? `<span class="text-xs bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full flex-shrink-0">${titleGroup.count}</span>` : ''}
                                            </div>
                                            <span class="text-sm font-semibold text-pink-700 ml-2">${Utils.formatCurrency(titleGroup.total)}</span>
                                        </div>
                                        
                                        <!-- Expanded Details (for all items when expanded) -->
                                        ${isTitleExpanded ? `
                                            <div class="border-t border-pink-100">
                                                ${titleGroup.expenses.map((exp, idx) => `
                                                    <div class="p-2 px-3 pl-6 ${idx > 0 ? 'border-t border-pink-50' : ''} bg-gray-50">
                                                        <div class="flex justify-between items-start">
                                                            <div class="flex-1 min-w-0">
                                                                <span class="text-xs text-gray-600">
                                                                    ${new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                                ${exp.description ? `<p class="text-xs text-gray-400 truncate">${Utils.escapeHtml(exp.description)}</p>` : ''}
                                                            </div>
                                                            <span class="text-xs font-semibold text-pink-600 ml-2">${Utils.formatCurrency(exp.amount)}</span>
                                                        </div>
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
     * Render category as a small tag/label
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
