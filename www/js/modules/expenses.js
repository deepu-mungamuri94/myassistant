/**
 * Expenses Module
 * Handles expense tracking and management
 */

const Expenses = {
    // Pagination and filter state
    currentPage: 1,
    itemsPerPage: 10,
    startDate: null,
    endDate: null,
    searchTerm: '',
    expandedMonths: new Set(), // Track which months are expanded
    
    /**
     * Initialize with current month dates
     */
    initializeFilters() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        this.startDate = `${year}-${month}-01`; // First day of current month
        this.endDate = `${year}-${month}-${day}`; // Today
        this.currentPage = 1;
    },
    
    /**
     * Add a new expense
     */
    add(title, amount, category, date, description = '', suggestedCard = null) {
        if (!title || !amount || !category || !date) {
            throw new Error('Please fill in all required fields');
        }
        
        const expense = {
            id: Utils.generateId(),
            title,
            description,
            amount: parseFloat(amount),
            category,
            date,
            suggestedCard,
            createdAt: Utils.getCurrentTimestamp()
        };
        
        window.DB.expenses.push(expense);
        window.Storage.save();
        
        return expense;
    },

    /**
     * Delete an expense
     */
    delete(id) {
        window.DB.expenses = window.DB.expenses.filter(e => e.id !== id);
        window.Storage.save();
    },

    /**
     * Get all expenses
     */
    getAll() {
        return window.DB.expenses;
    },

    /**
     * Get expense by ID
     */
    getById(id) {
        return window.DB.expenses.find(e => e.id === id);
    },

    /**
     * Get expenses by date range
     */
    getByDateRange(startDate, endDate) {
        return window.DB.expenses.filter(e => {
            const expenseDate = new Date(e.date);
            return expenseDate >= new Date(startDate) && expenseDate <= new Date(endDate);
        });
    },

    /**
     * Get expenses by category
     */
    getByCategory(category) {
        return window.DB.expenses.filter(e => e.category === category);
    },

    /**
     * Calculate total expenses
     */
    getTotalAmount(expenses = null) {
        const expensesToSum = expenses || window.DB.expenses;
        return expensesToSum.reduce((sum, e) => sum + e.amount, 0);
    },

    /**
     * Get expense categories
     */
    getCategories() {
        return [
            'Food & Dining',
            'Shopping',
            'Transportation',
            'Entertainment',
            'Bills & Utilities',
            'Healthcare',
            'Travel',
            'Education',
            'Groceries',
            'Other'
        ];
    },

    /**
     * Get filtered expenses based on date range and search
     */
    getFilteredExpenses() {
        let filtered = window.DB.expenses;
        
        // Apply date filter
        if (this.startDate && this.endDate) {
            filtered = filtered.filter(e => {
                const expenseDate = new Date(e.date);
                const start = new Date(this.startDate);
                const end = new Date(this.endDate);
                end.setHours(23, 59, 59, 999); // Include end date fully
                return expenseDate >= start && expenseDate <= end;
            });
        }
        
        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(e => 
                e.description.toLowerCase().includes(term) ||
                e.category.toLowerCase().includes(term) ||
                e.amount.toString().includes(term)
            );
        }
        
        // Sort by createdAt (most recently added first)
        return filtered.sort((a, b) => b.createdAt - a.createdAt);
    },
    
    /**
     * Group expenses by month
     */
    groupByMonth(expenses) {
        const groups = {};
        
        expenses.forEach(expense => {
            const date = new Date(expense.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            
            if (!groups[monthKey]) {
                groups[monthKey] = {
                    key: monthKey,
                    label: monthLabel,
                    expenses: [],
                    total: 0
                };
            }
            
            groups[monthKey].expenses.push(expense);
            groups[monthKey].total += expense.amount;
        });
        
        // Convert to array and sort by month (newest first)
        return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
    },
    
    /**
     * Toggle month expansion
     */
    toggleMonth(monthKey) {
        if (this.expandedMonths.has(monthKey)) {
            this.expandedMonths.delete(monthKey);
        } else {
            this.expandedMonths.add(monthKey);
        }
        this.render();
    },
    
    /**
     * Check if date range spans multiple months
     */
    isMultiMonth() {
        if (!this.startDate || !this.endDate) return false;
        const start = new Date(this.startDate);
        const end = new Date(this.endDate);
        return start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear();
    },
    
    /**
     * Check if viewing a single month (for recurring expenses display)
     */
    isSingleMonth() {
        if (!this.startDate || !this.endDate) return false;
        
        const start = new Date(this.startDate);
        const end = new Date(this.endDate);
        
        // Check if same month and year
        return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    },
    
    /**
     * Update the summary section with total, count, and date range
     */
    updateSummary(expenses) {
        // Calculate total
        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        
        // Update total amount
        const totalEl = document.getElementById('expenses-total-amount');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(total);
        
        // Update transaction count
        const countEl = document.getElementById('expenses-transaction-info');
        if (countEl) countEl.textContent = `${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}`;
        
        // Update date range
        const dateRangeEl = document.getElementById('expenses-date-range');
        if (dateRangeEl && this.startDate && this.endDate) {
            const startDate = new Date(this.startDate);
            const endDate = new Date(this.endDate);
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            dateRangeEl.textContent = `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
        }
    },
    
    /**
     * Update filters and re-render
     */
    updateFilters(startDate, endDate, searchTerm) {
        if (startDate !== undefined) this.startDate = startDate;
        if (endDate !== undefined) this.endDate = endDate;
        if (searchTerm !== undefined) this.searchTerm = searchTerm;
        this.currentPage = 1; // Reset to first page on filter change
        this.render();
    },
    
    /**
     * Change page
     */
    goToPage(page) {
        this.currentPage = page;
        this.render();
    },
    
    /**
     * Change items per page
     */
    setItemsPerPage(count) {
        this.itemsPerPage = parseInt(count);
        this.currentPage = 1;
        this.render();
    },
    
    /**
     * Get recurring expenses (both upcoming and completed in current month)
     */
    getRecurringExpenses() {
        const today = new Date();
        const upcoming = [];
        const completed = [];
        
        // Get upcoming EMIs
        if (window.Cards && window.DB.cards) {
            window.DB.cards.forEach(card => {
                if (!card.emis || card.emis.length === 0) return;
                
                card.emis.forEach(emi => {
                    if (!emi.firstEmiDate || emi.completed || !emi.emiAmount) return;
                    
                    const firstDate = new Date(emi.firstEmiDate);
                    
                    // Calculate which EMI payment number this month would be
                    let monthsElapsed = (today.getFullYear() - firstDate.getFullYear()) * 12 
                                      + (today.getMonth() - firstDate.getMonth());
                    
                    const emiNumber = monthsElapsed + 1;
                    
                    // Only if this EMI number is within total EMIs
                    if (emiNumber > 0 && emiNumber <= emi.totalCount) {
                        const emiDate = new Date(today.getFullYear(), today.getMonth(), firstDate.getDate());
                        const emiDateStr = emiDate.toISOString().split('T')[0];
                        
                        const emiExpense = {
                            title: `EMI: ${emi.reason}`,
                            amount: parseFloat(emi.emiAmount),
                            category: 'emi',
                            date: emiDateStr,
                            description: `EMI payment ${emiNumber}/${emi.totalCount}`,
                            suggestedCard: card.name,
                            isRecurring: true
                        };
                        
                        // Check if date has passed
                        if (today.getDate() < firstDate.getDate()) {
                            upcoming.push(emiExpense);
                        } else {
                            // Check if it exists in expenses
                            const exists = window.DB.expenses.find(exp => 
                                exp.title === emiExpense.title &&
                                exp.date === emiDateStr &&
                                exp.amount === emiExpense.amount
                            );
                            if (exists) {
                                completed.push(emiExpense);
                            }
                        }
                    }
                });
            });
        }
        
        // Get custom recurring expenses
        if (window.RecurringExpenses) {
            const upcomingRecurring = window.RecurringExpenses.getUpcoming();
            upcomingRecurring.forEach(recurring => {
                upcoming.push({
                    title: recurring.name,
                    amount: recurring.amount,
                    category: 'recurring',
                    date: recurring.dueDate,
                    description: recurring.description || 'Recurring expense',
                    suggestedCard: null,
                    isRecurring: true
                });
            });
            
            const completedRecurring = window.RecurringExpenses.getCompleted();
            completedRecurring.forEach(recurring => {
                completed.push({
                    title: recurring.name,
                    amount: recurring.amount,
                    category: 'recurring',
                    date: recurring.dueDate,
                    description: recurring.description || 'Recurring expense',
                    suggestedCard: null,
                    isRecurring: true
                });
            });
        }
        
        // Sort by date
        upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
        completed.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return { upcoming, completed };
    },
    
    /**
     * Render expenses list with pagination
     */
    render() {
        const list = document.getElementById('expenses-list');
        
        if (!list) return;
        
        // Auto-add EMI payments to expenses (if any are due)
        let totalAdded = 0;
        if (window.Cards && window.Cards.autoAddEMIExpenses) {
            try {
                const emiCount = window.Cards.autoAddEMIExpenses();
                totalAdded += emiCount;
            } catch (error) {
                console.error('Error auto-adding EMI expenses:', error);
            }
        }
        
        // Auto-add recurring expenses (if any are due)
        if (window.RecurringExpenses && window.RecurringExpenses.autoAddToExpenses) {
            try {
                const recurringCount = window.RecurringExpenses.autoAddToExpenses();
                totalAdded += recurringCount;
            } catch (error) {
                console.error('Error auto-adding recurring expenses:', error);
            }
        }
        
        if (totalAdded > 0) {
            window.Toast.success(`Auto-added ${totalAdded} recurring expense(s)`);
        }
        
        // Initialize filters if not set
        if (!this.startDate || !this.endDate) {
            this.initializeFilters();
            // Update date inputs
            const startInput = document.getElementById('expense-start-date');
            const endInput = document.getElementById('expense-end-date');
            if (startInput) startInput.value = this.startDate;
            if (endInput) endInput.value = this.endDate;
        }
        
        const filteredExpenses = this.getFilteredExpenses();
        
        // Update summary section
        this.updateSummary(filteredExpenses);
        
        // Check if viewing a single month (for recurring expenses display)
        const isSingleMonth = this.isSingleMonth();
        console.log('isSingleMonth:', isSingleMonth, 'startDate:', this.startDate, 'endDate:', this.endDate);
        
        // Get recurring expenses (upcoming and completed) - only for monthly view
        let upcomingRecurring = [];
        let completedRecurring = [];
        let totalRecurring = 0;
        
        if (isSingleMonth) {
            const recurringData = this.getRecurringExpenses();
            upcomingRecurring = recurringData.upcoming;
            completedRecurring = recurringData.completed;
            totalRecurring = upcomingRecurring.length + completedRecurring.length;
            console.log('Recurring data:', { upcoming: upcomingRecurring.length, completed: completedRecurring.length, total: totalRecurring });
        }
        
        if (filteredExpenses.length === 0 && totalRecurring === 0) {
            list.innerHTML = `
                <p class="text-gray-500 text-center py-8">
                    ${window.DB.expenses.length === 0 
                        ? 'No expenses yet. Add your first one!' 
                        : 'No expenses found for the selected filters.'}
                </p>
            `;
            return;
        }
        
        // Calculate pagination
        const totalItems = filteredExpenses.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedExpenses = filteredExpenses.slice(startIndex, endIndex);
        
        // Calculate total
        const total = this.getTotalAmount(filteredExpenses);
        const recurringTotal = [...upcomingRecurring, ...completedRecurring].reduce((sum, e) => sum + e.amount, 0);
        
        // Clear list
        list.innerHTML = '';
        
        // Render recurring expenses section (if any)
        if (totalRecurring > 0) {
            list.innerHTML += `
                <details class="mb-3 bg-white rounded-xl border-2 border-orange-300 overflow-hidden">
                    <summary class="cursor-pointer px-4 py-3 hover:bg-orange-50 transition-colors flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span class="text-orange-600">🔁</span>
                            <span class="font-semibold text-orange-900 text-sm">Recurring (${totalRecurring})</span>
                        </div>
                        <span class="font-bold text-orange-800 text-sm">${Utils.formatCurrency(recurringTotal)}</span>
                    </summary>
                    <div class="px-4 pb-3">
                        ${upcomingRecurring.length > 0 ? `
                            <div class="mb-2">
                                <p class="text-xs font-semibold text-blue-600 mb-1.5">🕐 Upcoming (${upcomingRecurring.length})</p>
                                <div class="space-y-1.5">
                                    ${upcomingRecurring.map(exp => `
                                        <div class="flex justify-between items-center py-1.5 px-2 bg-blue-50 rounded border border-blue-100">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(exp.title)}</p>
                                                <p class="text-xs text-gray-500">${Utils.formatDate(exp.date)}</p>
                                            </div>
                                            <span class="text-sm font-semibold text-blue-700 ml-2">${Utils.formatCurrency(exp.amount)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${completedRecurring.length > 0 ? `
                            <div>
                                <p class="text-xs font-semibold text-green-600 mb-1.5">✓ Completed (${completedRecurring.length})</p>
                                <div class="space-y-1.5">
                                    ${completedRecurring.map(exp => `
                                        <div class="flex justify-between items-center py-1.5 px-2 bg-green-50 rounded border border-green-100">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-gray-700 truncate">${Utils.escapeHtml(exp.title)}</p>
                                                <p class="text-xs text-gray-500">${Utils.formatDate(exp.date)}</p>
                                            </div>
                                            <span class="text-sm font-semibold text-green-700 ml-2">${Utils.formatCurrency(exp.amount)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </details>
            `;
        }
        
        // Check if multi-month view
        const useMonthGrouping = this.isMultiMonth();
        
        if (useMonthGrouping) {
            // Group by month and render with expand/collapse
            const monthGroups = this.groupByMonth(paginatedExpenses);
            
            list.innerHTML += monthGroups.map(group => {
                const isExpanded = this.expandedMonths.has(group.key);
                return `
                    <div class="mb-4 bg-white rounded-xl border-2 border-purple-300 overflow-hidden">
                        <!-- Month Header -->
                        <div class="p-4 bg-gradient-to-r from-purple-200 to-pink-200 cursor-pointer hover:from-purple-300 hover:to-pink-300 transition-all"
                             onclick="Expenses.toggleMonth('${group.key}')">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-3">
                                    <svg class="w-5 h-5 text-purple-700 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                    </svg>
                                    <div>
                                        <h3 class="font-bold text-purple-900">${group.label}</h3>
                                        <p class="text-xs text-purple-600">${group.expenses.length} transaction${group.expenses.length !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <p class="text-xl font-bold text-purple-900">${Utils.formatCurrency(group.total)}</p>
                                    <p class="text-xs text-purple-600">${isExpanded ? 'Click to collapse' : 'Click to expand'}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Month Expenses (Collapsible) -->
                        ${isExpanded ? `
                            <div class="p-3 space-y-2 bg-purple-50">
                                ${group.expenses.map(expense => `
                                    <div class="p-3 bg-white rounded-lg border border-purple-200 hover:shadow-md transition-all">
                                        <!-- Top Row: Title with Category + Actions -->
                                        <div class="flex justify-between items-start mb-1">
                                            <div class="flex-1 flex items-center gap-2">
                                                <h4 class="font-bold text-purple-800 text-sm">${Utils.escapeHtml(expense.title || expense.description)}</h4>
                                                <span class="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded">${Utils.escapeHtml(expense.category)}</span>
                                            </div>
                                            <div class="flex gap-1">
                                                <button onclick="openExpenseModal(${expense.id})" class="text-green-600 hover:text-green-800 p-1" title="Edit">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                                    </svg>
                                                </button>
                                                <button onclick="Expenses.deleteWithConfirm(${expense.id})" class="text-red-500 hover:text-red-700 p-1" title="Delete">
                                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- Bottom Row: Description + Amount/Date -->
                                        <div class="flex justify-between items-start">
                                            <div class="flex-1">
                                                ${expense.description ? `<p class="text-xs text-gray-600">${Utils.escapeHtml(expense.description)}</p>` : '<p class="text-xs text-gray-400 italic">No description</p>'}
                                            </div>
                                            <div class="text-right ml-3">
                                                <p class="text-base font-bold text-purple-700">₹${parseFloat(expense.amount).toLocaleString()}</p>
                                                <p class="text-xs text-gray-500">${Utils.formatDate(expense.date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } else {
            // Render flat list for single month
            list.innerHTML += paginatedExpenses.map(expense => `
                <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 hover:shadow-md transition-all">
                    <!-- Top Row: Title with Category + Actions -->
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex-1 flex items-center gap-2 flex-wrap">
                            <h4 class="font-bold text-purple-800">${Utils.escapeHtml(expense.title || expense.description)}</h4>
                            <span class="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded">${Utils.escapeHtml(expense.category)}</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="openExpenseModal(${expense.id})" class="text-green-600 hover:text-green-800 p-1" title="Edit">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="Expenses.deleteWithConfirm(${expense.id})" class="text-red-500 hover:text-red-700 p-1" title="Delete">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Bottom Row: Description + Amount/Date -->
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            ${expense.description ? `<p class="text-sm text-gray-600">${Utils.escapeHtml(expense.description)}</p>` : '<p class="text-sm text-gray-400 italic">No description</p>'}
                            ${expense.suggestedCard ? `<p class="text-xs text-green-600 mt-1">💳 ${Utils.escapeHtml(expense.suggestedCard)}</p>` : ''}
                        </div>
                        <div class="text-right ml-4">
                            <p class="text-lg font-bold text-purple-700">₹${parseFloat(expense.amount).toLocaleString()}</p>
                            <p class="text-xs text-gray-500">${Utils.formatDate(expense.date)}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Render pagination controls if needed
        if (totalPages > 1) {
            list.innerHTML += `
                <div class="mt-6 flex items-center justify-between bg-white/90 p-4 rounded-xl border border-purple-200">
                    <div class="flex items-center gap-2">
                        <label class="text-sm text-gray-600">Per page:</label>
                        <select onchange="Expenses.setItemsPerPage(this.value)" class="px-2 py-1 border border-gray-300 rounded text-sm">
                            <option value="5" ${this.itemsPerPage === 5 ? 'selected' : ''}>5</option>
                            <option value="10" ${this.itemsPerPage === 10 ? 'selected' : ''}>10</option>
                            <option value="20" ${this.itemsPerPage === 20 ? 'selected' : ''}>20</option>
                            <option value="50" ${this.itemsPerPage === 50 ? 'selected' : ''}>50</option>
                        </select>
                        <span class="text-sm text-gray-600 ml-2">
                            Showing ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}
                        </span>
                    </div>
                    
                    <div class="flex gap-1">
                        <button onclick="Expenses.goToPage(1)" 
                                ${this.currentPage === 1 ? 'disabled' : ''}
                                class="px-3 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                            ««
                        </button>
                        <button onclick="Expenses.goToPage(${this.currentPage - 1})" 
                                ${this.currentPage === 1 ? 'disabled' : ''}
                                class="px-3 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                            «
                        </button>
                        
                        ${this.renderPaginationButtons(totalPages)}
                        
                        <button onclick="Expenses.goToPage(${this.currentPage + 1})" 
                                ${this.currentPage === totalPages ? 'disabled' : ''}
                                class="px-3 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                            »
                        </button>
                        <button onclick="Expenses.goToPage(${totalPages})" 
                                ${this.currentPage === totalPages ? 'disabled' : ''}
                                class="px-3 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                            »»
                        </button>
                    </div>
                </div>
            `;
        }
    },
    
    /**
     * Render pagination buttons (show max 5 buttons)
     */
    renderPaginationButtons(totalPages) {
        let buttons = '';
        const maxButtons = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        
        // Adjust start if we're near the end
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            buttons += `
                <button onclick="Expenses.goToPage(${i})" 
                        class="px-3 py-1 rounded text-sm ${isActive 
                            ? 'bg-purple-600 text-white font-semibold' 
                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}">
                    ${i}
                </button>
            `;
        }
        
        return buttons;
    },

    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this expense. Are you sure?',
            'Delete Expense'
        );
        if (!confirmed) return;
        
        this.delete(id);
        this.render();
        window.Toast.show('Expense deleted', 'success');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Expenses = Expenses;
}

