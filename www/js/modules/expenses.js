/**
 * Expenses Module
 * Handles expense tracking and management
 */

const Expenses = {
    // Filter state (pagination removed)
    startDate: null,
    endDate: null,
    searchTerm: '',
    expandedMonths: new Set(), // Track which months are expanded
    includeLoansInTotal: false, // Toggle for including loans in total
    viewMode: 'expenses', // 'expenses' or 'events' (external contract: set by index.html + events.js)
    // View toggle within the expenses view: 'list' | 'calendar' (default: calendar)
    bodyView: 'calendar',
    // Calendar view state (month browser, mirrors RecurringExpenses)
    calYear: null,
    calMonth: null,
    calSelectedDay: null,
    // Events view: when true, the Events breakdown ignores the date filter (all-time escape)
    eventsAllTime: false,

    /**
     * Initialize with current month dates
     */
    initializeFilters() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        
        this.startDate = `${year}-${month}-01`; // First day of current month
        this.endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`; // Last day of current month
    },

    /**
     * Helper: resolve category info (icon + gradient color) for an expense category.
     * Expense rows are inconsistent: user-picked categories store the display NAME
     * ('Food & Dining'), while auto-added EMI/recurring rows store lowercase IDs
     * ('emi'). Try name first, then id, then the shared fallback — so an EMI row
     * still gets 💳 instead of the generic 📦.
     */
    _getCategoryInfo(categoryName) {
        const EC = window.ExpenseCategories;
        if (!EC) return { id: 'other', name: categoryName || 'Other', icon: '📦', color: 'from-gray-400 to-gray-600' };
        return EC.getByName(categoryName) || EC.getById(categoryName) || EC.getCategoryOrDefault(categoryName);
    },

    /**
     * Helper: emoji-on-gradient avatar for a category (mirrors RecurringExpenses).
     */
    _categoryAvatar(categoryName) {
        const cat = this._getCategoryInfo(categoryName);
        return `<div class="w-10 h-10 rounded-full bg-gradient-to-br ${cat.color} flex items-center justify-center flex-shrink-0 text-xl">${cat.icon}</div>`;
    },

    /**
     * Add a new expense
     */
    add(title, amount, category, date, description = '', suggestedCard = null, event = null, needWant = null) {
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
            event: event || null, // Optional event tag for grouping related expenses
            needWant: needWant || null, // 'need', 'want', or null (for category fallback)
            createdAt: Utils.getCurrentTimestamp()
        };
        
        window.DB.expenses.push(expense);
        window.Storage.save();
        
        return expense;
    },
    
    /**
     * Update an existing expense
     */
    update(id, updates) {
        const expense = this.getById(id);
        if (!expense) {
            throw new Error('Expense not found');
        }
        
        // Update allowed fields
        if (updates.title !== undefined) expense.title = updates.title;
        if (updates.amount !== undefined) expense.amount = parseFloat(updates.amount);
        if (updates.category !== undefined) expense.category = updates.category;
        if (updates.date !== undefined) expense.date = updates.date;
        if (updates.description !== undefined) expense.description = updates.description;
        if (updates.suggestedCard !== undefined) expense.suggestedCard = updates.suggestedCard;
        if (updates.event !== undefined) expense.event = updates.event || null;
        if (updates.needWant !== undefined) expense.needWant = updates.needWant || null;
        
        window.Storage.save();
        return expense;
    },
    
    /**
     * Get all unique event names for autocomplete
     */
    getEventNames() {
        const events = new Set();
        window.DB.expenses.forEach(e => {
            if (e.event && e.event.trim()) {
                events.add(e.event.trim());
            }
        });
        return Array.from(events).sort();
    },
    
    /**
     * Get event summary with hierarchical breakdown
     * Returns events with nested structure for 3-level drill-down
     */
    getEventSummary() {
        const eventMap = {};
        
        window.DB.expenses.forEach(expense => {
            if (!expense.event || !expense.event.trim()) return;
            
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
                category: expense.category
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
     * Delete an expense
     */
    delete(id) {
        const expense = this.getById(id);
        
        // If it's an auto-added recurring expense, mark as dismissed
        if (expense && this.isAutoRecurringExpense(expense)) {
            const dismissal = {
                title: expense.title,
                date: expense.date,
                amount: expense.amount,
                category: expense.category,
                recurringId: expense.recurringId || null, // Store recurringId for better tracking
                dismissedAt: Utils.getCurrentTimestamp()
            };
            
            if (!window.DB.dismissedRecurringExpenses) {
                window.DB.dismissedRecurringExpenses = [];
            }
            
            // Add to dismissed list
            window.DB.dismissedRecurringExpenses.push(dismissal);
            
            // Remove the month marking from the recurring expense's addedToExpenses
            // This allows the user to manually add it again if they change their mind
            if (expense.recurringId && window.RecurringExpenses) {
                const recurring = window.DB.recurringExpenses.find(r => String(r.id) === String(expense.recurringId));
                if (recurring && recurring.addedToExpenses) {
                    const expenseDate = new Date(expense.date);
                    const monthKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
                    
                    // Remove this month from addedToExpenses
                    recurring.addedToExpenses = recurring.addedToExpenses.filter(m => m !== monthKey);
                    console.log(`Removed month ${monthKey} from recurring "${recurring.name}" after deletion`);
                }
            }
        }
        
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
     * Uses actual expense date for day-based filters (Today, Last 7 Days)
     * Uses budget month for month/year-based filters (This Month, This Year, Custom Range)
     */
    getFilteredExpenses() {
        let filtered = window.DB.expenses;

        // Apply date filter. Calendar view answers "when did I actually spend?", so it
        // filters by ACTUAL date (a July-28 purchase tracked in August stays on July 28,
        // matching the grid). List view keeps budget-month remapping (see isExpenseInRange),
        // consistent with the dashboard and month-grouping.
        if (this.startDate && this.endDate) {
            const inRange = this.bodyView === 'calendar'
                ? (e) => this.isExpenseInActualDateRange(e, this.startDate, this.endDate)
                : (e) => this.isExpenseInRange(e, this.startDate, this.endDate);
            filtered = filtered.filter(inRange);
        }

        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(e => 
                (e.title && e.title.toLowerCase().includes(term)) ||
                (e.description && e.description.toLowerCase().includes(term)) ||
                (e.category && e.category.toLowerCase().includes(term)) ||
                e.amount.toString().includes(term)
            );
        }
        
        // Sort by expense date (ascending - earliest first)
        return filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
    },
    
    /**
     * Get budget month/year for an expense
     * Uses budgetMonth/budgetYear if set, otherwise falls back to expense date
     */
    getExpenseBudgetMonth(expense) {
        if (expense.budgetMonth && expense.budgetYear) {
            return { month: expense.budgetMonth, year: expense.budgetYear };
        }
        const expenseDate = new Date(expense.date);
        return {
            month: expenseDate.getMonth() + 1,
            year: expenseDate.getFullYear()
        };
    },

    /**
     * Single source of truth for "is this expense inside [startDate, endDate]?".
     * Mirrors the app's dual semantics: day-based ranges (≤7 days: Today / This Week)
     * use the actual expense date; month/year ranges honor budgetMonth remapping so a
     * "paid in May, track in June" expense lands in its budget month. Shared by
     * getFilteredExpenses (List/Calendar) and the Events view so every view filters
     * identically. Dates are 'YYYY-MM-DD' strings.
     */
    isExpenseInRange(expense, startDate, endDate) {
        if (!startDate || !endDate) return true;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const isDayBasedFilter = daysDiff <= 7; // Today or Last 7 Days

        if (isDayBasedFilter) {
            // Day-based ranges compare the actual expense date.
            return this.isExpenseInActualDateRange(expense, startDate, endDate);
        }

        // Month/year-based: compare the budget month (mid-month) against whole-month bounds
        const { month, year } = this.getExpenseBudgetMonth(expense);
        const budgetDate = new Date(year, month - 1, 15);
        const startOfRange = new Date(start.getFullYear(), start.getMonth(), 1);
        const endOfRange = new Date(end.getFullYear(), end.getMonth() + 1, 0); // last day of end month
        return budgetDate >= startOfRange && budgetDate <= endOfRange;
    },

    /**
     * "Is this expense's ACTUAL date inside [startDate, endDate]?" — midnight-to-midnight
     * inclusive, ignoring budgetMonth remapping. The Calendar view uses this (a calendar
     * answers "when did I actually spend?", so a July-28 purchase tracked in August still
     * belongs on July 28) and so does the ≤7-day branch of isExpenseInRange.
     */
    isExpenseInActualDateRange(expense, startDate, endDate) {
        if (!startDate || !endDate) return true;
        const expenseDate = new Date(expense.date);
        expenseDate.setHours(0, 0, 0, 0);
        const startBound = new Date(startDate);
        startBound.setHours(0, 0, 0, 0);
        const endBound = new Date(endDate);
        endBound.setHours(23, 59, 59, 999);
        return expenseDate >= startBound && expenseDate <= endBound;
    },
    
    /**
     * Group expenses by budget month (uses budgetMonth if set, otherwise expense date)
     */
    groupByMonth(expenses) {
        const groups = {};
        
        expenses.forEach(expense => {
            // Use budget month if available, otherwise fall back to expense date
            const { month, year } = this.getExpenseBudgetMonth(expense);
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            
            if (!groups[monthKey]) {
                groups[monthKey] = {
                    key: monthKey,
                    label: monthLabel,
                    expenses: [],
                    total: 0
                };
            }
            
            groups[monthKey].expenses.push(expense);
            
            // Only add to total if it's not a loan EMI OR if loans are included
            if (this.includeLoansInTotal || !this.isLoanEMIExpense(expense)) {
                groups[monthKey].total += expense.amount;
            }
        });
        
        // Sort expenses within each month by date (ascending - earliest first)
        Object.values(groups).forEach(group => {
            group.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
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
     * Check if an expense is a loan EMI
     */
    isLoanEMIExpense(expense) {
        // Check if title matches loan EMI pattern: "<Bank> <Type> EMI"
        // Examples: "HDFC Home EMI", "SBI Car EMI", "ICICI Personal EMI"
        // Exclude card EMIs which start with "Card EMI:" or "EMI:"
        return expense.title && 
               expense.title.includes(' EMI') && 
               expense.category === 'emi' && 
               !expense.title.startsWith('Card EMI:') &&
               !expense.title.startsWith('EMI:');
    },
    
    /**
     * Check if an expense is an auto-recurring expense (loan EMI, card EMI, or custom recurring)
     */
    isAutoRecurringExpense(expense) {
        // Loan EMIs
        if (this.isLoanEMIExpense(expense)) return true;
        
        // Card EMIs (start with "Card EMI:" or "EMI:")
        if (expense.category === 'emi' && expense.title && 
            (expense.title.startsWith('Card EMI:') || expense.title.startsWith('EMI:'))) return true;
        
        // Custom recurring expenses (legacy: category is 'recurring', new: isRecurring flag)
        if (expense.category === 'recurring' || expense.isRecurring) return true;
        
        return false;
    },
    
    /**
     * Format category display (EMI uppercase, Recurring capitalized)
     */
    formatCategoryDisplay(category) {
        if (category === 'emi') return 'EMI';
        // Don't show "Recurring" as a category - it should show the actual category
        // Legacy expenses with category='recurring' should be migrated
        if (category === 'recurring') return 'Other';
        return category;
    },
    
    /**
     * Get full details link for auto-recurring expense
     */
    getFullDetailsLink(expense) {
        if (!this.isAutoRecurringExpense(expense)) return '';
        
        // Escape for the onclick JS-string-in-HTML-attribute context (both JS and
        // HTML layers). The bank-name-derived title is user-controlled, so a plain
        // JS-quote escape without HTML-escaping is an attribute-breakout XSS.
        const escapeJs = (str) => Utils.escapeJsAttr(str);

        // Loan EMI - navigate to loans page
        if (this.isLoanEMIExpense(expense)) {
            // Check if the loan still exists
            const loans = window.DB.loans || [];
            const loanExists = loans.some(l => {
                const displayTitle = l.loanType === 'Other' && l.customLoanType 
                    ? `${l.bankName} ${l.customLoanType} EMI`
                    : `${l.bankName} ${l.loanType} EMI`;
                return expense.title === displayTitle || expense.title.includes(l.bankName);
            });
            
            if (loanExists) {
                return `<button onclick="Expenses.showLoanDetails('${escapeJs(expense.title)}')" class="text-xs text-blue-600 hover:text-blue-800 mt-1" style="text-decoration:none;">🔗 More Info...</button>`;
            } else {
                // Loan was deleted
                return `<span class="text-xs text-gray-400 italic mt-1">⚠️ Loan deleted</span>`;
            }
        }
        
        // Card EMI - show EMI details modal (pass expense ID to access suggestedCard)
        if (expense.category === 'emi' && expense.title && (expense.title.startsWith('Card EMI:') || expense.title.startsWith('EMI:'))) {
            // Check if the card still exists
            const cardName = expense.suggestedCard;
            let cardExists = false;
            
            if (cardName && window.DB.cards) {
                cardExists = window.DB.cards.some(c => c.name === cardName);
            }
            
            if (cardExists) {
                return `<button onclick="Expenses.showCardEMIDetails(${expense.id})" class="text-xs text-blue-600 hover:text-blue-800 mt-1" style="text-decoration:none;">🔗 More Info...</button>`;
            } else {
                // Card was deleted
                return `<span class="text-xs text-gray-400 italic mt-1">⚠️ Card deleted</span>`;
            }
        }
        
        // Custom recurring expense - navigate to recurring page
        if (expense.category === 'recurring' || expense.isRecurring) {
            // Check if the recurring expense still exists (by ID if available, otherwise by name)
            let recurringExists = false;
            
            if (expense.recurringId && window.DB.recurringExpenses) {
                // Check by ID (more reliable, handles name changes)
                recurringExists = window.DB.recurringExpenses.some(r => 
                    String(r.id) === String(expense.recurringId)
                );
            } else if (window.DB.recurringExpenses) {
                // Fallback to name check for legacy expenses
                recurringExists = window.DB.recurringExpenses.some(r => r.name === expense.title);
            }
            
            if (recurringExists) {
                // Use recurringId if available (more reliable), otherwise use title
                const identifier = expense.recurringId ? expense.recurringId : escapeJs(expense.title);
                const idParam = expense.recurringId ? identifier : `'${identifier}'`;
                return `<button onclick="Expenses.showRecurringDetails(${idParam})" class="text-xs text-blue-600 hover:text-blue-800 mt-1" style="text-decoration:none;">🔗 More Info...</button>`;
            } else {
                // Recurring expense template was deleted
                return `<span class="text-xs text-gray-400 italic mt-1">⚠️ Schedule deleted</span>`;
            }
        }
        
        return '';
    },
    
    /**
     * Truncate name to max length with ellipsis
     */
    truncateName(name, maxLength = 22) {
        if (!name) return '';
        if (name.length <= maxLength + 3) return name; // +3 for "..."
        return name.substring(0, maxLength) + '...';
    },
    
    /**
     * Get just the payment method icon (no text)
     */
    getPaymentMethodIcon(method) {
        if (!method || !method.type) return '';
        
        switch(method.type) {
            case 'cash':
                return `<span class="text-green-600 text-sm" title="Cash">💵</span>`;
            case 'upi':
                if (method.id === 'phonepe') return `<img src="assets/icons/phonepe.webp" class="w-4 h-4 rounded" alt="PhonePe">`;
                if (method.id === 'gpay') return `<img src="assets/icons/gpay.webp" class="w-4 h-4 rounded" alt="GPay">`;
                if (method.id === 'paytm') return `<img src="assets/icons/paytm.webp" class="w-4 h-4 rounded" alt="Paytm">`;
                return `<img src="assets/icons/upi.svg" class="w-4 h-4 rounded" alt="UPI">`;
            case 'credit_card':
                return `<span class="text-purple-600 text-sm" title="Credit Card">💳</span>`;
            case 'debit_card':
                return `<span class="text-teal-600 text-sm" title="Debit Card">💳</span>`;
            default:
                return '';
        }
    },
    
    /**
     * Show expense details modal
     */
    showExpenseDetails(expenseId) {
        const expense = this.getAll().find(e => e.id === expenseId);
        if (!expense) {
            Utils.showError('Expense not found');
            return;
        }
        
        const date = new Date(expense.date);
        const dateStr = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        
        // Get payment method display
        let paymentMethodHtml = '<span class="text-gray-400">Not specified</span>';
        let isCardClickable = false;
        let cardId = null;
        
        if (expense.paymentMethod && window.getPaymentMethodDisplayText) {
            const method = expense.paymentMethod;
            // Check if it's a credit/debit card and if card still exists
            if ((method.type === 'credit_card' || method.type === 'debit_card') && method.id) {
                const card = (window.DB.cards || []).find(c => String(c.id) === String(method.id));
                if (card) {
                    isCardClickable = true;
                    cardId = card.id;
                    paymentMethodHtml = `<span class="text-blue-600 underline cursor-pointer">${window.getPaymentMethodDisplayText(method, true, 'normal')}</span>`;
                } else {
                    // Card deleted, show with last4 if available
                    paymentMethodHtml = window.getPaymentMethodDisplayText(method, true, 'normal') + ' <span class="text-gray-400 text-xs">(deleted)</span>';
                }
            } else {
                paymentMethodHtml = window.getPaymentMethodDisplayText(method, true, 'normal');
            }
        } else if (expense.suggestedCard) {
            // Check if suggested card still exists
            const card = (window.DB.cards || []).find(c => c.name === expense.suggestedCard);
            if (card) {
                isCardClickable = true;
                cardId = card.id;
                paymentMethodHtml = `<span class="text-blue-600 underline cursor-pointer">💳 ${Utils.escapeHtml(expense.suggestedCard)}</span>`;
            } else {
                paymentMethodHtml = `<span class="text-green-600">💳 ${Utils.escapeHtml(expense.suggestedCard)}</span>`;
            }
        }
        
        // Get budget month display
        let budgetMonthHtml = '';
        if (expense.budgetMonth && expense.budgetYear) {
            const budgetDate = new Date(expense.budgetYear, expense.budgetMonth - 1);
            budgetMonthHtml = budgetDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        } else {
            budgetMonthHtml = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        }
        
        // Category emoji
        const categoryEmojis = {
            'food': '🍔', 'transport': '🚗', 'shopping': '🛒', 'entertainment': '🎬',
            'health': '💊', 'utilities': '💡', 'education': '📚', 'travel': '✈️',
            'groceries': '🥬', 'rent': '🏠', 'emi': '💳', 'insurance': '🛡️',
            'investment': '📈', 'bills': '📄', 'personal': '👤', 'recurring': '🔄',
            'other': '📦'
        };
        const categoryEmoji = categoryEmojis[expense.category?.toLowerCase()] || '📦';
        
        const modalHtml = `
            <div id="expense-details-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center" onclick="if(event.target === this) this.remove()">
                <div class="bg-white rounded-t-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto animate-slide-up">
                    <!-- Header -->
                    <div class="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-800">Expense Details</h3>
                        <button onclick="document.getElementById('expense-details-modal').remove()" class="p-2 hover:bg-gray-100 rounded-full">
                            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <!-- Content -->
                    <div class="p-4 space-y-4">
                        <!-- Amount & Title -->
                        <div class="text-center pb-4 border-b border-gray-100">
                            <p class="text-3xl font-bold text-purple-700">₹${parseFloat(expense.amount).toLocaleString()}</p>
                            <p class="text-lg text-gray-800 mt-1">${Utils.escapeHtml(expense.title)}</p>
                            <p class="text-sm text-gray-500 mt-1">${dateStr}</p>
                        </div>
                        
                        <!-- Details Grid -->
                        <div class="space-y-3">
                            <div class="flex justify-between items-center py-2 border-b border-gray-50">
                                <span class="text-gray-500 text-sm">Category</span>
                                <span class="font-medium">${categoryEmoji} ${Utils.escapeHtml(expense.category || 'Other')}</span>
                            </div>
                            
                            <div class="flex justify-between items-center py-2 border-b border-gray-50">
                                <span class="text-gray-500 text-sm">Payment Method</span>
                                <span class="font-medium" ${isCardClickable ? `onclick="document.getElementById('expense-details-modal').remove(); Cards.showCardSummaryModal('${cardId}')"` : ''}>${paymentMethodHtml}</span>
                            </div>
                            
                            <div class="flex justify-between items-center py-2 border-b border-gray-50">
                                <span class="text-gray-500 text-sm">Budget Month</span>
                                <span class="font-medium">${budgetMonthHtml}</span>
                            </div>
                            
                            ${expense.description ? `
                            <div class="py-2 border-b border-gray-50">
                                <span class="text-gray-500 text-sm block mb-1">Description</span>
                                <p class="text-gray-800">${Utils.escapeHtml(expense.description)}</p>
                            </div>
                            ` : ''}
                            
                            ${expense.isRecurring || expense.recurringId ? `
                            <div class="flex justify-between items-center py-2 border-b border-gray-50">
                                <span class="text-gray-500 text-sm">Type</span>
                                <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">🔄 Recurring</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <!-- Actions -->
                        <div class="flex gap-3 pt-4">
                            <button onclick="document.getElementById('expense-details-modal').remove(); openExpenseModal(${expense.id})" 
                                class="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors">
                                ✏️ Edit
                            </button>
                            <button onclick="document.getElementById('expense-details-modal').remove(); Expenses.deleteWithConfirm(${expense.id})" 
                                class="py-3 px-6 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    /**
     * Show loan details in view-only modal
     */
    showLoanDetails(loanTitle) {
        // Find the loan by title
        const loans = window.DB.loans || [];
        const loan = loans.find(l => {
            const displayTitle = l.loanType === 'Other' && l.customLoanType 
                ? `${l.bankName} ${l.customLoanType} EMI`
                : `${l.bankName} ${l.loanType} EMI`;
            return loanTitle === displayTitle || loanTitle.includes(l.bankName);
        });
        
        if (loan && window.Loans && window.Loans.showDetailsModal) {
            // Show loan details in view modal
            window.Loans.showDetailsModal(loan.id);
        } else if (loan && window.openLoanModal) {
            // Fallback to edit modal if view modal doesn't exist
            window.openLoanModal(loan.id);
        } else {
            Utils.showError('Loan not found. It may have been deleted.');
        }
    },
    
    /**
     * Show card EMI details in view-only modal
     */
    showCardEMIDetails(expenseId) {
        // Get the expense
        const expense = this.getById(expenseId);
        if (!expense) {
            Utils.showError('Expense not found');
            return;
        }
        
        // Get EMI reason from title (remove "Card EMI: " or "EMI: " prefix)
        let emiReason = expense.title.replace('Card EMI: ', '').replace('EMI: ', '').trim();
        let cardName = expense.suggestedCard;
        
        // Handle old format "CardName - Reason" if suggestedCard is missing
        if (!cardName && emiReason.includes(' - ')) {
            const parts = emiReason.split(' - ');
            cardName = parts[0].trim();
            emiReason = parts.slice(1).join(' - ').trim();
        }
        
        if (!cardName) {
            // Try to find the card by searching all cards for this EMI reason
            const cards = window.DB.cards || [];
            const foundCard = cards.find(c => c.emis && c.emis.some(e => e.reason === emiReason));
            if (foundCard) {
                cardName = foundCard.name;
            } else {
                Utils.showError('Card information not found');
                return;
            }
        }
        
        // Find the card
        const cards = window.DB.cards || [];
        const card = cards.find(c => c.name === cardName);
        
        if (!card) {
            Utils.showError(`Card not found: ${cardName}. It may have been deleted.`);
            return;
        }
        
        if (window.Cards && window.Cards.showEMIDetailsModal) {
            // Show specific EMI details in modal
            window.Cards.showEMIDetailsModal(card.name, emiReason);
        } else {
            Utils.showError('EMI details not available');
        }
    },
    
    /**
     * Show recurring expense details in view-only modal
     * @param {string|number} nameOrId - Can be recurringId or recurringName
     */
    showRecurringDetails(nameOrId) {
        // Find the recurring expense by ID or name
        const recurringExpenses = window.DB.recurringExpenses || [];
        let recurring = null;
        
        // Try to find by ID first (if it's a number or numeric string)
        if (!isNaN(nameOrId)) {
            recurring = recurringExpenses.find(r => String(r.id) === String(nameOrId));
        }
        
        // If not found by ID, try by name (for backward compatibility)
        if (!recurring) {
            recurring = recurringExpenses.find(r => r.name === nameOrId);
        }
        
        if (recurring && window.RecurringExpenses && window.RecurringExpenses.showDetailsModal) {
            // Show recurring details in view modal
            window.RecurringExpenses.showDetailsModal(recurring.id);
        } else if (recurring && window.openRecurringExpenseModal) {
            // Fallback to edit modal if view modal doesn't exist
            window.openRecurringExpenseModal(recurring.id);
        } else {
            Utils.showError('Recurring expense schedule not found. It may have been deleted.');
        }
    },
    
    /**
     * Check if a recurring expense has been dismissed
     */
    isDismissed(title, date, amount, recurringId = null) {
        if (!window.DB.dismissedRecurringExpenses) return false;
        
        return window.DB.dismissedRecurringExpenses.some(d => {
            // First check by recurringId if available (handles name changes)
            if (recurringId && d.recurringId && String(d.recurringId) === String(recurringId)) {
                // Check if it's the same date
                return d.date === date;
            }
            // Fallback to title/date/amount matching (for legacy dismissed entries)
            return d.title === title && 
                   d.date === date && 
                   Math.abs(d.amount - amount) < 0.01;
        });
    },
    
    /**
     * Manually add a recurring expense to expenses
     * @param {string} scheduledDate - The original scheduled date (for tracking purposes)
     */
    addRecurringExpense(title, amount, category, scheduledDate, description, recurringId = null) {
        // Use today's date for the actual expense (since it's being added manually)
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Remove from dismissed list if it was dismissed
        if (window.DB.dismissedRecurringExpenses) {
            window.DB.dismissedRecurringExpenses = window.DB.dismissedRecurringExpenses.filter(d => {
                // Check by recurringId first (handles name changes)
                if (recurringId && d.recurringId && String(d.recurringId) === String(recurringId)) {
                    return d.date !== scheduledDate; // Remove if same scheduled date
                }
                // Fallback to title/date/amount matching
                return !(d.title === title && d.date === scheduledDate && Math.abs(d.amount - amount) < 0.01);
            });
        }
        
        // Add to expenses with TODAY'S date (manual addition)
        const expense = this.add(title, amount, category, todayStr, description, null);

        // If this is from a recurring expense, mark the SCHEDULED month as added to prevent duplicates
        if (recurringId && window.RecurringExpenses) {
            const recurring = window.DB.recurringExpenses.find(r => String(r.id) === String(recurringId));
            if (recurring) {
                // Extract year-month from the SCHEDULED date (not today's date)
                const scheduledDateObj = new Date(scheduledDate);
                const monthKey = `${scheduledDateObj.getFullYear()}-${String(scheduledDateObj.getMonth() + 1).padStart(2, '0')}`;

                // Mark this month as added if not already
                if (!recurring.addedToExpenses) {
                    recurring.addedToExpenses = [];
                }
                if (!recurring.addedToExpenses.includes(monthKey)) {
                    recurring.addedToExpenses.push(monthKey);
                    window.Storage.save();
                    console.log(`Marked recurring expense "${recurring.name}" as added for ${monthKey} (manually added on ${todayStr})`);
                }

                // Store recurring ID + payment method in the expense. Until now
                // the manual "Add" path didn't carry paymentMethod over, so the
                // user had to re-pick it every time. The auto-add path on the
                // recurring side does this — match that behaviour here.
                if (expense) {
                    expense.recurringId = recurringId;
                    expense.isRecurring = true;

                    if (recurring.paymentMethod) {
                        expense.paymentMethod = recurring.paymentMethod;

                        // If paid via credit card, bump the card's outstanding
                        // — same side-effect the auto-add path applies.
                        if (recurring.paymentMethod.type === 'credit_card' && recurring.paymentMethod.id) {
                            const card = (window.DB.cards || []).find(c => String(c.id) === String(recurring.paymentMethod.id));
                            if (card) {
                                const oldAmount = parseFloat(card.outstanding) || 0;
                                card.outstanding = oldAmount + parseFloat(amount);
                            }
                        }
                    }

                    window.Storage.save();
                }
            }
        }

        this.render();
        Utils.showSuccess('Added to expenses!');
    },
    
    /**
     * Add recurring expense by ID - helper function to avoid string escaping issues
     * @param {string} recurringId - The recurring expense ID
     * @param {string} scheduledDate - The scheduled date for this occurrence
     */
    addRecurringExpenseById(recurringId, scheduledDate) {
        // Find the recurring expense from the getRecurringExpenses() data
        const recurringData = this.getRecurringExpenses();
        const allRecurring = [...recurringData.upcoming, ...recurringData.completed];
        
        // Find the expense by recurringId and date
        const expense = allRecurring.find(exp => 
            String(exp.recurringId) === String(recurringId) && exp.date === scheduledDate
        );
        
        if (!expense) {
            Utils.showError('Recurring expense not found');
            return;
        }
        
        // Call the original function with the proper data
        this.addRecurringExpense(
            expense.title,
            expense.amount,
            expense.category,
            scheduledDate,
            expense.description || '',
            recurringId
        );
    },
    
    /**
     * Check if viewing a single month (for recurring expenses display)
     * Only returns true for "Current Month" filter (starts from 1st of month)
     */
    isSingleMonth() {
        if (!this.startDate || !this.endDate) return false;
        
        const start = new Date(this.startDate);
        const end = new Date(this.endDate);
        
        // Must be same month and year
        if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
            return false;
        }
        
        // Must start from the 1st day of the month (not "Today" or "This Week")
        return start.getDate() === 1;
    },
    
    /**
     * Check if we should show recurring expenses
     * Show only for current period filters (Today, This Week, This Month)
     * Hide for broad filters (All Time, This Year, Custom Range spanning multiple months)
     */
    shouldShowRecurringExpenses() {
        if (!this.startDate || !this.endDate) return false;
        
        const start = new Date(this.startDate);
        const end = new Date(this.endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate the span in days
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Hide if spanning more than 31 days (likely "This Year" or "All Time")
        if (daysDiff > 31) {
            return false;
        }
        
        // Must be viewing current or future period (not historical)
        if (end < today) {
            return false;
        }
        
        // Show for current month view (starts from 1st of the month)
        if (this.isSingleMonth()) {
            return true;
        }
        
        // Also allow if it's a short period (≤7 days) that includes today
        if (daysDiff <= 7 && start <= today && end >= today) {
            return true; // This Week or Today
        }
        
        return false;
    },
    
    /**
     * Update the summary section with total, count, and date range
     */
    updateSummary(expenses) {
        // Separate loan EMI expenses from regular expenses
        const loanEmiExpenses = expenses.filter(exp => this.isLoanEMIExpense(exp));
        const regularExpenses = expenses.filter(exp => !this.isLoanEMIExpense(exp));
        
        // Calculate totals
        const regularTotal = regularExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const loanEmiTotal = loanEmiExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        
        // Calculate final total based on toggle
        const finalTotal = this.includeLoansInTotal ? regularTotal + loanEmiTotal : regularTotal;
        
        // Update total amount
        const totalEl = document.getElementById('expenses-total-amount');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(finalTotal);
        
        // Show loans section for normal expenses view
        const loansContainer = document.getElementById('loans-toggle-container');
        if (loansContainer) loansContainer.classList.remove('hidden');
        
        // Update toggle switch appearance
        const toggleBtn = document.getElementById('toggle-loans-btn');
        const toggleSlider = document.getElementById('toggle-loans-slider');
        if (toggleBtn && toggleSlider) {
            if (this.includeLoansInTotal) {
                toggleBtn.className = 'relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 bg-green-500';
                toggleSlider.className = 'inline-block w-4 h-4 transform rounded-full bg-white shadow-lg transition-transform translate-x-4';
                toggleBtn.title = 'Loans Included - Click to Exclude';
            } else {
                toggleBtn.className = 'relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 bg-gray-300';
                toggleSlider.className = 'inline-block w-4 h-4 transform rounded-full bg-white shadow-lg transition-transform translate-x-0.5';
                toggleBtn.title = 'Loans Excluded - Click to Include';
            }
        }
        
        // Update loan info display
        const loanInfoEl = document.getElementById('expenses-loan-info');
        const loanAmountEl = document.getElementById('loan-emi-amount');
        if (loanInfoEl && loanAmountEl) {
            if (this.includeLoansInTotal && loanEmiTotal > 0) {
                loanAmountEl.textContent = Utils.formatCurrency(loanEmiTotal);
                loanInfoEl.classList.remove('hidden');
            } else {
                loanInfoEl.classList.add('hidden');
            }
        }
        
        // Update transaction count
        const countEl = document.getElementById('expenses-transaction-info');
        if (countEl) countEl.textContent = `${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}`;
        
        // Update date range
        const dateRangeEl = document.getElementById('expenses-date-range');
        if (dateRangeEl && this.startDate && this.endDate) {
            dateRangeEl.textContent = this.formatDateRangeLabel();
        }
    },

    /**
     * Human-readable "Jul 1, 2026 - Jul 31, 2026" label for the active range.
     * Shared by the expenses and events summaries so they read identically.
     */
    formatDateRangeLabel() {
        if (!this.startDate || !this.endDate) return 'All time';
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        const startDate = new Date(this.startDate);
        const endDate = new Date(this.endDate);
        return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
    },

    /**
     * Update summary section for Events view
     */
    updateEventsSummary() {
        if (!window.Events) return;

        // Match the same range the events list is rendering (all-time when toggled)
        const evStart = this.eventsAllTime ? null : this.startDate;
        const evEnd = this.eventsAllTime ? null : this.endDate;
        const events = window.Events.getEventSummary(this.searchTerm, evStart, evEnd);

        // Calculate totals across all events
        let totalAmount = 0;
        let totalExpenseCount = 0;

        events.forEach(event => {
            totalAmount += event.total;
            totalExpenseCount += event.expenseCount;
        });

        // Update total amount
        const totalEl = document.getElementById('expenses-total-amount');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(totalAmount);

        // Hide entire loans section for events view
        const loansContainer = document.getElementById('loans-toggle-container');
        if (loansContainer) loansContainer.classList.add('hidden');

        // Hide loan info
        const loanInfoEl = document.getElementById('expenses-loan-info');
        if (loanInfoEl) loanInfoEl.classList.add('hidden');

        // Update transaction count
        const countEl = document.getElementById('expenses-transaction-info');
        if (countEl) countEl.textContent = `${events.length} event${events.length !== 1 ? 's' : ''} • ${totalExpenseCount} expense${totalExpenseCount !== 1 ? 's' : ''}`;

        // Reflect the actual scope of what's shown (range vs. all-time)
        const dateRangeEl = document.getElementById('expenses-date-range');
        if (dateRangeEl) dateRangeEl.textContent = this.eventsAllTime ? 'All events (all time)' : this.formatDateRangeLabel();
    },

    /**
     * Toggle the Events view between "obey the date filter" and "all time".
     * Wired from the range note the Events view renders.
     */
    toggleEventsAllTime() {
        this.eventsAllTime = !this.eventsAllTime;
        this.render();
    },
    
    /**
     * Update filters and re-render
     */
    updateFilters(startDate, endDate, searchTerm) {
        if (startDate !== undefined) this.startDate = startDate;
        if (endDate !== undefined) this.endDate = endDate;
        if (searchTerm !== undefined) this.searchTerm = searchTerm;
        this.render();
    },
    
    /**
     * Get recurring expenses (both upcoming and completed in current month)
     */
    getRecurringExpenses() {
        const today = new Date();
        const upcoming = [];
        const completed = [];
        
        // Get credit card EMIs
        if (window.Cards && window.DB.cards) {
            window.DB.cards.forEach(card => {
                // Only process credit cards (not debit cards)
                if (card.cardType === 'debit') {
                    return;
                }
                if (!card.emis || card.emis.length === 0) {
                    return;
                }
                
                card.emis.forEach(emi => {
                    if (!emi.firstEmiDate || emi.completed || !emi.emiAmount) return;
                    
                    const firstDate = new Date(emi.firstEmiDate);
                    const emiDay = firstDate.getDate();
                    
                    // Calculate which EMI payment number this month would be
                    // This is based on months from first EMI date to current month
                    const monthsElapsed = (today.getFullYear() - firstDate.getFullYear()) * 12 
                                      + (today.getMonth() - firstDate.getMonth());
                    
                    // EMI number is simply monthsElapsed + 1
                    // (January = 1st EMI, February = 2nd EMI, etc.)
                    const emiNumber = monthsElapsed + 1;
                    
                    // Only if this EMI number is within total EMIs and not already completed
                    if (emiNumber > 0 && emiNumber <= emi.totalCount) {
                        const emiDate = new Date(today.getFullYear(), today.getMonth(), emiDay);
                        const emiDateStr = Utils.formatLocalDate(emiDate);
                        
                        const emiExpense = {
                            title: `Card EMI: ${emi.reason}`,
                            amount: parseFloat(emi.emiAmount),
                            category: 'emi',
                            date: emiDateStr,
                            description: `${card.name} EMI payment ${emiNumber}/${emi.totalCount}`,
                            suggestedCard: card.name,
                            isRecurring: true
                        };
                        
                        // Check if it exists in expenses already (check old and new formats)
                        const exists = window.DB.expenses.find(exp => {
                            const titleMatch = exp.title === emiExpense.title || 
                                               exp.title === `EMI: ${emi.reason}` ||
                                               exp.title === `EMI: ${card.name} - ${emi.reason}`;
                            const dateMatch = exp.date === emiDateStr;
                            const amountMatch = Math.abs(exp.amount - emiExpense.amount) < 0.01;
                            return titleMatch && dateMatch && amountMatch;
                        });
                        
                        if (exists) {
                            // Already added to expenses
                            completed.push(emiExpense);
                        } else {
                            // Not yet added
                            upcoming.push(emiExpense);
                        }
                    }
                });
            });
        }
        
        // Get loan EMIs
        if (window.Loans && window.DB.loans) {
            window.DB.loans.forEach(loan => {
                // Check if loan has started yet
                const firstDate = new Date(loan.firstEmiDate);
                if (firstDate > today) {
                    return; // Loan hasn't started yet
                }
                
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                if (remaining.emisRemaining === 0) {
                    return; // Skip closed loans
                }
                
                const emi = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                const emiDay = firstDate.getDate();
                
                // Check if EMI is due this month
                const thisMonthEmiDate = new Date(today.getFullYear(), today.getMonth(), emiDay);
                const emiDateStr = Utils.formatLocalDate(thisMonthEmiDate);
                
                const loanEmi = {
                    title: `${loan.bankName} ${loan.loanType || 'Loan'} EMI`,
                    amount: parseFloat(emi),
                    category: 'emi',
                    date: emiDateStr,
                    description: loan.reason || 'Monthly payment',
                    suggestedCard: null,
                    isRecurring: true,
                    isLoan: true
                };
                
                // Check if it exists in expenses already
                const exists = window.DB.expenses.find(exp => 
                    exp.title === loanEmi.title &&
                    exp.date === emiDateStr &&
                    Math.abs(exp.amount - loanEmi.amount) < 0.01
                );
                
                if (exists) {
                    completed.push(loanEmi);
                } else {
                    // If date has passed but not added to expenses, still show as upcoming
                    upcoming.push(loanEmi);
                }
            });
        }
        
        // Get custom recurring expenses
        if (window.RecurringExpenses) {
            const upcomingRecurring = window.RecurringExpenses.getUpcoming();
            upcomingRecurring.forEach(recurring => {
                upcoming.push({
                    title: recurring.name,
                    amount: recurring.amount,
                    category: recurring.category || 'Other', // Use actual category from template
                    date: recurring.dueDate,
                    description: recurring.description || 'Recurring expense',
                    suggestedCard: null,
                    isRecurring: true,
                    recurringId: recurring.id // Store recurring ID for tracking
                });
            });
            
            const completedRecurring = window.RecurringExpenses.getCompleted();
            completedRecurring.forEach(recurring => {
                completed.push({
                    title: recurring.name,
                    amount: recurring.amount,
                    category: recurring.category || 'Other', // Use actual category from template
                    date: recurring.dueDate,
                    description: recurring.description || 'Recurring expense',
                    suggestedCard: null,
                    isRecurring: true,
                    recurringId: recurring.id // Store recurring ID for tracking
                });
            });
        }
        
        // Sort by date
        upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
        completed.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return { upcoming, completed };
    },
    
    /**
     * Toggle loans inclusion in total
     */
    toggleLoansInTotal() {
        this.includeLoansInTotal = !this.includeLoansInTotal;
        this.render();
    },
    
    /**
     * Render expenses list with pagination
     */
    render() {
        const list = document.getElementById('expenses-list');

        if (!list) return;

        // Ensure the active range exists before ANY view reads it (events branch
        // returns early, so this must run first).
        if (!this.startDate || !this.endDate) {
            this.initializeFilters();
            const startInput0 = document.getElementById('expense-start-date');
            const endInput0 = document.getElementById('expense-end-date');
            if (startInput0) startInput0.value = this.startDate;
            if (endInput0) endInput0.value = this.endDate;
        }

        // Check if in events view mode
        if (this.viewMode === 'events') {
            if (window.Events) {
                // Events obey the same date filter as the list, unless the user taps
                // "All time". Pass null/null to mean unbounded (all-time).
                const evStart = this.eventsAllTime ? null : this.startDate;
                const evEnd = this.eventsAllTime ? null : this.endDate;
                window.Events.renderInExpensesList(list, this.searchTerm, evStart, evEnd);
                this.updateEventsSummary();
            }
            return;
        }
        
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
        
        // Auto-add loan EMI expenses (if any are due)
        if (window.Loans && window.Loans.autoAddToExpenses) {
            try {
                const loanCount = window.Loans.autoAddToExpenses();
                totalAdded += loanCount;
            } catch (error) {
                console.error('Error auto-adding loan EMI expenses:', error);
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
            Utils.showSuccess(`Auto-added ${totalAdded} recurring expense(s)`);
        }
        // (Filter init already ran at the top of render, before the events branch.)

        // Initialize calendar browser state (mirrors RecurringExpenses)
        const calNow = new Date();
        if (this.calYear === null || this.calMonth === null) {
            this.calYear = calNow.getFullYear();
            this.calMonth = calNow.getMonth() + 1;
            this.calSelectedDay = calNow.getDate();
        }

        // In Calendar view the active range IS the browsed month, so the summary card
        // (total / count / date label) tracks month navigation. Must run BEFORE
        // getFilteredExpenses/updateSummary so every downstream read sees that range.
        if (this.bodyView === 'calendar') {
            this._syncRangeToCalendarMonth();
        }

        const filteredExpenses = this.getFilteredExpenses();

        // Update summary section
        this.updateSummary(filteredExpenses);

        // Recurring due this period (only for current-period filters). We surface just
        // the not-yet-added ("pending") ones as add-cards; already-added recurring show
        // inline in the timeline with a 🔁 badge (see renderGroupedByDate).
        const shouldShowRecurring = this.shouldShowRecurringExpenses();
        const pendingRecurring = shouldShowRecurring ? this._getPendingRecurring() : [];

        // First-run onboarding: nothing at all to show yet
        if (window.DB.expenses.length === 0 && pendingRecurring.length === 0) {
            list.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">🧾</div>
                    <p class="text-gray-500 text-sm mb-4">No expenses yet</p>
                    <button onclick="openExpenseModal()"
                            class="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all transform hover:scale-105 font-semibold">
                        + Add your first expense
                    </button>
                </div>
            `;
            this.updateControlsState();
            return;
        }

        // Segmented view toggle (List | Calendar) always sits above the body
        let html = this._renderViewToggle();

        if (this.bodyView === 'calendar') {
            html += this._renderCalendarView(filteredExpenses);
        } else {
            html += this._renderListView(filteredExpenses, pendingRecurring);
        }

        list.innerHTML = html;

        // Enable/disable filter and toggle buttons based on expenses existence
        this.updateControlsState();
    },

    /**
     * Segmented List | Calendar toggle (mirrors the approved Recurring pattern).
     */
    _renderViewToggle() {
        const isList = this.bodyView !== 'calendar';
        const isCal = this.bodyView === 'calendar';
        return `
            <div class="mb-3">
                <div class="flex bg-gray-100 rounded-xl p-1 gap-1">
                    <button onclick="Expenses.showList()" aria-pressed="${isList}" class="flex-1 px-4 py-2 text-sm font-bold rounded-lg ${isList ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'} transition-all flex items-center justify-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                        List
                    </button>
                    <button onclick="Expenses.showCalendar()" aria-pressed="${isCal}" class="flex-1 px-4 py-2 text-sm font-bold rounded-lg ${isCal ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'} transition-all flex items-center justify-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        Calendar
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Switch to List view
     */
    showList() {
        this.bodyView = 'list';
        this.render();
    },

    /**
     * Switch to Calendar view (keeps the currently-browsed month).
     */
    showCalendar() {
        this.bodyView = 'calendar';
        this.render();
    },

    /**
     * Jump to the Calendar view scoped to the CURRENT month. This is the app's default
     * "Current Month" surface — the summary and grid both track today's month. Unlike
     * showCalendar(), it resets the browsed month to today (so it doesn't strand the
     * user on a previously-paged month).
     */
    showCurrentMonthCalendar() {
        const t = new Date();
        this.calYear = t.getFullYear();
        this.calMonth = t.getMonth() + 1;
        this.calSelectedDay = t.getDate();
        this.bodyView = 'calendar';
        this.render();
    },

    /**
     * Build the "due this period, not yet added" recurring list — the only recurring
     * rows we surface as add-cards. Already-added recurring live inline in the timeline.
     * Honors dismissals so a deleted auto-row doesn't reappear as pending.
     */
    _getPendingRecurring() {
        const { upcoming } = this.getRecurringExpenses();
        const filtered = upcoming.filter(exp => {
            // Skip if an equivalent expense already exists (by recurringId within the
            // month, else title/date/amount) — mirrors the old existsInExpenses check.
            const exists = window.DB.expenses.find(e => {
                if (exp.recurringId && e.recurringId && String(e.recurringId) === String(exp.recurringId)) {
                    const a = new Date(exp.date), b = new Date(e.date);
                    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
                }
                return e.title === exp.title && e.date === exp.date && Math.abs(e.amount - exp.amount) < 0.01;
            });
            if (exists) return false;

            // Tag dismissed items (they remain visible but get visual distinction)
            if (this.isDismissed(exp.title, exp.date, exp.amount, exp.recurringId || null)) {
                exp.dismissed = true;
            }
            return true;
        });

        // Sort: non-dismissed first, dismissed at the end
        return filtered.sort((a, b) => {
            if (a.dismissed && !b.dismissed) return 1;
            if (!a.dismissed && b.dismissed) return -1;
            return 0;
        });
    },

    /**
     * Render a single "pending recurring" add-card. Custom recurring (has recurringId)
     * gets a one-tap + Add; card/loan EMIs (no recurringId) auto-add on their due date,
     * so they show a "🔁 auto" tag instead of a button that couldn't work.
     */
    _renderPendingRecurringCard(exp) {
        const cat = this._getCategoryInfo(exp.category);
        // Show upcoming payment number if description carries an "n/total" pattern
        let displayDescription = exp.description || '';
        if (exp.recurringId && window.DB.recurringExpenses) {
            const recurring = window.DB.recurringExpenses.find(r => String(r.id) === String(exp.recurringId));
            if (recurring && recurring.addedToExpenses) {
                const nextPaymentNumber = recurring.addedToExpenses.length + 1;
                displayDescription = displayDescription.replace(/(\d+)\/(\d+)/, (m, cur, tot) => `${nextPaymentNumber}/${tot}`);
            }
        }
        const action = exp.recurringId
            ? `<button onclick="Expenses.addRecurringExpenseById('${Utils.escapeHtml(String(exp.recurringId))}', '${exp.date}'); event.stopPropagation();"
                    class="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all flex items-center gap-1 flex-shrink-0"
                    aria-label="Add ${Utils.escapeHtml(exp.title)} to expenses">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                    Add
                </button>`
            : `<span class="px-2 py-1 bg-amber-100 text-amber-700 text-[11px] font-medium rounded-lg flex-shrink-0" title="Auto-added on its due date">🔁 auto</span>`;

        // Visual distinction for dismissed items: amber border + dismissed badge
        const borderClass = exp.dismissed ? 'border-amber-300 bg-amber-50/30' : 'border-purple-300 bg-white';
        const dismissedBadge = exp.dismissed
            ? `<span class="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-600 text-[10px] font-medium rounded">dismissed</span>`
            : '';

        return `
            <div class="flex items-center gap-3 p-3 rounded-xl border border-dashed ${borderClass}">
                ${this._categoryAvatar(exp.category)}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-800 truncate">${Utils.escapeHtml(exp.title)}${dismissedBadge}</p>
                    <p class="text-xs text-gray-500 truncate">${displayDescription ? Utils.escapeHtml(displayDescription) + ' • ' : ''}Due ${Utils.formatDate(exp.date)}</p>
                </div>
                <div class="text-right flex items-center gap-2">
                    <span class="text-sm font-bold text-purple-700 tabular-nums">₹${Utils.formatIndianNumber(parseFloat(exp.amount))}</span>
                    ${action}
                </div>
            </div>
        `;
    },

    /**
     * Render the List body: optional "due this month" pending recurring cards, then the
     * date-grouped timeline (recurring rows carry an inline 🔁 badge). Month-grouped when
     * the range spans months, else grouped by day.
     */
    _renderListView(filteredExpenses, pendingRecurring) {
        let html = '';

        // Pending recurring ("due this month") — collapsible so it never dominates
        if (pendingRecurring.length > 0) {
            const pendingTotal = pendingRecurring.reduce((s, e) => s + e.amount, 0);
            html += `
                <details class="mb-3" open>
                    <summary class="cursor-pointer flex items-center justify-between px-1 py-1.5 list-none">
                        <span class="flex items-center gap-2 text-sm font-semibold text-purple-800">
                            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            Due this month (${pendingRecurring.length})
                        </span>
                        <span class="text-sm font-bold text-purple-700 tabular-nums">₹${Utils.formatIndianNumber(pendingTotal)}</span>
                    </summary>
                    <div class="space-y-2 mt-2">
                        ${pendingRecurring.map(exp => this._renderPendingRecurringCard(exp)).join('')}
                    </div>
                </details>
            `;
        }

        // The timeline shows every expense in range (recurring rows carry a 🔁 badge
        // inline, so no separate pill filter is needed).
        const toRender = filteredExpenses;

        if (toRender.length === 0) {
            html += `<p class="text-gray-500 text-center py-8 text-sm">No expenses found for the selected filters.</p>`;
            return html;
        }

        // Timeline: month-grouped when the range spans months, else date-grouped
        if (this.isMultiMonth()) {
            const monthGroups = this.groupByMonth(toRender);
            html += monthGroups.map(group => {
                const isExpanded = this.expandedMonths.has(group.key);
                return `
                    <div class="mb-4 bg-white rounded-2xl border border-purple-200 overflow-hidden shadow-sm">
                        <div class="p-4 bg-gradient-to-r from-purple-100 to-pink-100 cursor-pointer hover:from-purple-200 hover:to-pink-200 transition-all"
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
                                    <p class="text-xl font-bold text-purple-900 tabular-nums">₹${Utils.formatIndianNumber(group.total)}</p>
                                    <p class="text-xs text-purple-600">${isExpanded ? 'Tap to collapse' : 'Tap to expand'}</p>
                                </div>
                            </div>
                        </div>
                        ${isExpanded ? `<div class="p-3 space-y-2 bg-purple-50/50">${this.renderGroupedByDate(group.expenses)}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            html += this.renderGroupedByDate(toRender);
        }

        return html;
    },

    /**
     * Render Calendar view — a month grid of spend, mirroring the verified Recurring
     * calendar math. Cells show category dots for days with expenses; tapping a day
     * reveals that day's transactions below. Uses actual expense date (not budget month).
     * Sourced from the same filtered set as the summary (actual-date-in-month + search),
     * so the grid, the day panel, and the summary card can never disagree.
     */
    _renderCalendarView(filteredExpenses = null) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const today = new Date();
        const isCurrentMonth = this.calYear === today.getFullYear() && this.calMonth === today.getMonth() + 1;
        const todayDate = today.getDate();

        // Build day map for the browsed month from actual expense dates. Fall back to the
        // full store if a caller invokes us without the pre-filtered set (defensive).
        const source = filteredExpenses || window.DB.expenses;
        const dayMap = {};
        source.forEach(e => {
            const d = new Date(e.date);
            if (d.getFullYear() === this.calYear && d.getMonth() + 1 === this.calMonth) {
                const day = d.getDate();
                if (!dayMap[day]) dayMap[day] = [];
                dayMap[day].push(e);
            }
        });

        let html = `<div id="expenses-cal-view">`;
        html += `
            <div class="flex items-center justify-between mb-3">
                <button class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" onclick="Expenses.calPrevMonth()" aria-label="Previous month">
                    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="flex items-center gap-3">
                    <h2 class="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">${monthNames[this.calMonth - 1]} ${this.calYear}</h2>
                    <button class="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold hover:bg-purple-200" onclick="Expenses.calToday()">Today</button>
                </div>
                <button class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" onclick="Expenses.calNextMonth()" aria-label="Next month">
                    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
        `;

        const firstDay = new Date(this.calYear, this.calMonth - 1, 1).getDay();
        const daysInMonth = new Date(this.calYear, this.calMonth, 0).getDate();

        html += `
            <div class="mb-4">
                <div class="bg-purple-50/50 rounded-2xl p-3">
                    <div class="grid grid-cols-7 gap-1 mb-2">
                        ${dayNames.map(d => `<div class="text-center text-xs font-semibold text-gray-500">${d}</div>`).join('')}
                    </div>
                    <div class="grid grid-cols-7 gap-1">
        `;

        for (let i = 0; i < firstDay; i++) {
            html += `<div style="aspect-ratio: 1;"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const items = dayMap[day] || [];
            const isTodayCell = isCurrentMonth && day === todayDate;
            const isSelected = day === this.calSelectedDay;
            // Day total mirrors the summary/detail-panel rule (loan EMIs only when toggled on).
            const dayAmount = items.reduce((sum, e) => (this.includeLoansInTotal || !this.isLoanEMIExpense(e)) ? sum + e.amount : sum, 0);

            let cellClass = 'rounded-lg flex flex-col items-center justify-center font-medium transition-colors cursor-pointer';
            if (isSelected) {
                cellClass += ' bg-gradient-to-br from-purple-600 to-pink-600 text-white';
            } else if (isTodayCell) {
                cellClass += ' ring-2 ring-purple-500 text-gray-700 hover:bg-purple-100';
            } else {
                cellClass += ' text-gray-700 hover:bg-purple-100';
            }

            const dayLabel = `Select day ${day}${items.length ? `, ${items.length} expense${items.length > 1 ? 's' : ''} totalling ₹${Utils.formatIndianNumber(dayAmount)}` : ''}`;
            html += `<button style="aspect-ratio: 1; position: relative;" class="${cellClass}" onclick="Expenses.calSelectDay(${day})" aria-label="${dayLabel}">`;
            html += `<span class="text-sm leading-none">${day}</span>`;
            // Compact spend total under the date (e.g. ₹2.2k) — a glanceable amount that
            // replaces the old category dots. Exact figures live in the detail panel below.
            if (dayAmount > 0) {
                html += `<span class="leading-none mt-0.5 tabular-nums ${isSelected ? 'text-white/90' : 'text-purple-600'}" style="font-size: 9px;">₹${Utils.formatCompactNumber(dayAmount)}</span>`;
            }
            html += `</button>`;
        }

        html += `
                    </div>
                </div>
            </div>
        `;

        // Selected-day detail panel
        const dayItems = (dayMap[this.calSelectedDay] || []).slice().sort((a, b) => {
            return new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime();
        });
        const dayOfWeek = new Date(this.calYear, this.calMonth - 1, this.calSelectedDay).getDay();
        const dayNamesLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayTotal = dayItems.reduce((sum, e) => this.includeLoansInTotal || !this.isLoanEMIExpense(e) ? sum + e.amount : sum, 0);

        html += `<div>`;
        html += `<div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">${isCurrentMonth && this.calSelectedDay === todayDate ? 'Today • ' : ''}${dayNamesLong[dayOfWeek]}, ${this.calSelectedDay} ${monthNames[this.calMonth - 1]}</h3>
            ${dayItems.length ? `<div class="text-xs font-bold text-purple-600 tabular-nums">₹${Utils.formatIndianNumber(dayTotal)}</div>` : ''}
        </div>`;

        if (dayItems.length === 0) {
            html += `<div class="bg-gray-50 rounded-xl p-8 text-center"><div class="text-4xl mb-2">📅</div><div class="text-sm text-gray-500">No expenses this day</div></div>`;
        } else {
            html += `<div class="space-y-2">${dayItems.map(e => this._renderExpenseCard(e)).join('')}</div>`;
        }
        html += `</div></div>`;

        return html;
    },

    /**
     * Point the active date range at the currently-browsed calendar month
     * (1st → last day). Keeps the summary card and the calendar grid in lockstep so
     * paging prev/next months re-totals the summary. Also updates the header filter
     * label so it reads the browsed month (e.g. "July 2026") rather than a stale preset.
     */
    _syncRangeToCalendarMonth() {
        const y = this.calYear;
        const m = this.calMonth;
        const lastDay = new Date(y, m, 0).getDate();
        this.startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        this.endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const filterLabel = document.getElementById('date-filter-label');
        const filterLabelInfo = document.getElementById('date-filter-label-info');
        if (filterLabel) filterLabel.textContent = monthLabel;
        if (filterLabelInfo) filterLabelInfo.textContent = monthLabel;
    },

    // Calendar month navigation (mirrors RecurringExpenses)
    calPrevMonth() {
        if (this.calMonth === 1) { this.calMonth = 12; this.calYear--; } else { this.calMonth--; }
        this.calSelectedDay = 1;
        this.render();
    },
    calNextMonth() {
        if (this.calMonth === 12) { this.calMonth = 1; this.calYear++; } else { this.calMonth++; }
        this.calSelectedDay = 1;
        this.render();
    },
    calToday() {
        const t = new Date();
        this.calYear = t.getFullYear();
        this.calMonth = t.getMonth() + 1;
        this.calSelectedDay = t.getDate();
        this.render();
    },
    calSelectDay(day) {
        this.calSelectedDay = day;
        this.render();
    },

    /**
     * Render a single modernized expense card (category avatar + title + chips + amount).
     * Shared by the calendar day panel and the list timeline.
     */
    _renderExpenseCard(expense) {
        const expDateObj = new Date(expense.date);
        const bm = this.getExpenseBudgetMonth(expense);
        const trackedBadge = (bm.month !== (expDateObj.getMonth() + 1) || bm.year !== expDateObj.getFullYear())
            ? `<span class="text-[11px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">tracked in ${new Date(bm.year, bm.month - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</span>`
            : '';
        const isRecurring = expense.isRecurring || expense.category === 'emi';
        const eventChip = expense.event ? `<span class="text-[11px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">🎉 ${Utils.escapeHtml(expense.event)}</span>` : '';
        return `
            <div class="p-3 bg-white rounded-xl border border-purple-100 hover:bg-purple-50 transition-all">
                <div class="flex items-start gap-3">
                    <div onclick="Expenses.showExpenseDetails(${expense.id})" class="cursor-pointer">${this._categoryAvatar(expense.category)}</div>
                    <div onclick="Expenses.showExpenseDetails(${expense.id})" class="flex-1 min-w-0 cursor-pointer">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${expense.paymentMethod ? this.getPaymentMethodIcon(expense.paymentMethod) : ''}
                            <h4 class="font-semibold text-purple-800 text-sm" title="${Utils.escapeHtml(expense.title || expense.description || '')}">${Utils.escapeHtml(this.truncateName(expense.title || expense.description, 22))}</h4>
                            <span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                                ${isRecurring ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' : ''}
                                <span>${Utils.escapeHtml(this.formatCategoryDisplay(expense.category))}</span>
                            </span>
                            ${eventChip}
                            ${trackedBadge}
                        </div>
                        <div class="flex items-center justify-between mt-1">
                            <div class="min-w-0 flex-1">
                                ${expense.description ? `<p class="text-xs text-gray-600 truncate">${Utils.escapeHtml(expense.description)}</p>` : ''}
                                ${expense.suggestedCard && !expense.paymentMethod ? `<p class="text-xs text-green-600">💳 ${Utils.escapeHtml(expense.suggestedCard)}</p>` : ''}
                                ${this.getFullDetailsLink(expense)}
                            </div>
                            <p class="text-base font-bold text-purple-700 tabular-nums ml-3 flex-shrink-0">₹${Utils.formatIndianNumber(parseFloat(expense.amount))}</p>
                        </div>
                    </div>
                    <div class="flex flex-col gap-1 flex-shrink-0">
                        <button onclick="openExpenseModal(${expense.id})" class="text-green-600 hover:text-green-800 p-1.5" title="Edit" aria-label="Edit expense">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onclick="Expenses.deleteWithConfirm(${expense.id})" class="text-red-500 hover:text-red-700 p-1.5" title="Delete" aria-label="Delete expense">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render expenses grouped by date
     */
    renderGroupedByDate(expenses) {
        // Group expenses by date
        const groupedByDate = {};
        expenses.forEach(expense => {
            const date = expense.date;
            if (!groupedByDate[date]) {
                groupedByDate[date] = [];
            }
            groupedByDate[date].push(expense);
        });
        
        // Sort dates in descending order (most recent first)
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
        
        let html = '';
        
        // Add expand/collapse all button
        if (sortedDates.length > 0) {
            html += `
                <div class="flex justify-end mb-3">
                    <button id="toggle-date-groups-btn" onclick="Expenses.toggleAllDateGroups()" class="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg transition-all duration-200 text-xs font-semibold">
                        📁 Collapse All
                    </button>
                </div>
            `;
        }
        
        html += sortedDates.map((date, index) => {
            // Sort expenses within the day by time descending (most recent first)
            const dayExpenses = groupedByDate[date].sort((a, b) => {
                const timeA = new Date(a.createdAt || a.date).getTime();
                const timeB = new Date(b.createdAt || b.date).getTime();
                return timeB - timeA; // Descending order
            });
            const dayTotal = dayExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
            const dateObj = new Date(date);
            const formattedDate = dateObj.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            return `
                <details class="expense-date-group mb-0" open>
                    <summary class="cursor-pointer bg-gradient-to-r from-purple-100 to-fuchsia-100 hover:from-purple-200 hover:to-fuchsia-200 border border-purple-200 p-3 transition-all list-none">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 transition-transform details-arrow text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <span class="font-bold text-sm text-purple-900">${formattedDate}</span>
                                <span class="text-[10px] font-semibold text-purple-700 bg-white/70 px-1.5 py-0.5 rounded-full">${dayExpenses.length}</span>
                            </div>
                            <span class="font-bold text-sm text-purple-900 tabular-nums">₹${Utils.formatIndianNumber(dayTotal)}</span>
                        </div>
                    </summary>
                    <div class="p-2 space-y-2 border-l border-r border-b border-purple-200 rounded-b-xl bg-purple-50/30">
                        ${dayExpenses.map(expense => this._renderExpenseCard(expense)).join('')}
                    </div>
                </details>
            `;
        }).join('');

        return html;
    },
    
    /**
     * Toggle expand/collapse all date groups
     */
    toggleAllDateGroups() {
        const groups = document.querySelectorAll('.expense-date-group');
        const allExpanded = Array.from(groups).every(group => group.hasAttribute('open'));
        
        groups.forEach(group => {
            if (allExpanded) {
                group.removeAttribute('open');
            } else {
                group.setAttribute('open', '');
            }
        });
        
        // Update button text
        const button = document.getElementById('toggle-date-groups-btn');
        if (button) {
            button.textContent = allExpanded ? '📂 Expand All' : '📁 Collapse All';
        }
    },
    
    /**
     * Enable/disable filter and toggle buttons
     */
    updateControlsState() {
        const hasExpenses = window.DB && window.DB.expenses && window.DB.expenses.length > 0;
        const filterButton = document.getElementById('expense-filter-btn');
        const toggleButton = document.getElementById('toggle-loans-btn');
        
        if (filterButton) {
            if (hasExpenses) {
                filterButton.disabled = false;
                filterButton.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                filterButton.disabled = true;
                filterButton.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
        
        if (toggleButton) {
            if (hasExpenses) {
                toggleButton.disabled = false;
                toggleButton.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                toggleButton.disabled = true;
                toggleButton.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
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
        Utils.showSuccess('Expense deleted');
    },
    
    /**
     * Migrate expenses with category='recurring' to use actual categories from their recurring templates
     */
    migrateRecurringCategories() {
        let migrated = 0;
        let noTemplate = 0;
        
        window.DB.expenses.forEach(expense => {
            // Only migrate expenses that have category='recurring'
            // Don't touch expenses that already have proper categories
            if (expense.category === 'recurring') {
                if (expense.recurringId) {
                    // Find the recurring template
                    const recurring = window.DB.recurringExpenses.find(r => 
                        String(r.id) === String(expense.recurringId)
                    );
                    
                    if (recurring && recurring.category) {
                        // Update expense to use the recurring template's category
                        expense.category = recurring.category;
                        expense.isRecurring = true; // Ensure flag is set
                        migrated++;
                        console.log(`  ↳ Migrated: ${expense.title} (${expense.date}) -> ${recurring.category}`);
                    } else if (!recurring) {
                        // Recurring template was deleted, set to 'Other'
                        expense.category = 'Other';
                        expense.isRecurring = true;
                        noTemplate++;
                        console.log(`  ↳ Orphaned: ${expense.title} (${expense.date}) -> Other`);
                    } else {
                        // Recurring template exists but has no category (shouldn't happen after migration)
                        expense.category = 'Other';
                        expense.isRecurring = true;
                        noTemplate++;
                        console.log(`  ↳ No category: ${expense.title} (${expense.date}) -> Other`);
                    }
                } else {
                    // Legacy expense without recurringId, set to 'Other'
                    expense.category = 'Other';
                    expense.isRecurring = true;
                    noTemplate++;
                    console.log(`  ↳ Legacy: ${expense.title} (${expense.date}) -> Other`);
                }
            }
        });
        
        if (migrated > 0 || noTemplate > 0) {
            window.Storage.save();
            console.log(`✅ Migrated ${migrated} recurring expense(s) to use template categories`);
            if (noTemplate > 0) {
                console.log(`⚠️  Set ${noTemplate} orphaned recurring expense(s) to 'Other' category`);
            }
        }
        
        return migrated + noTemplate;
    }
};

/**
 * Migration: Fix old EMI expense titles
 */
function migrateOldEMIExpenses(showToast = false) {
    if (!window.DB || !window.DB.expenses) {
        return 0;
    }
    
    let migrated = 0;
    window.DB.expenses.forEach(expense => {
        // Check if it's a card EMI expense
        if (expense.category === 'emi' && expense.title) {
            let needsMigration = false;
            let emiReason = '';
            let cardName = '';
            
            // Old format 1: "EMI: CardName - Reason"
            if (expense.title.startsWith('EMI:') && expense.title.includes(' - ')) {
                const titleWithoutPrefix = expense.title.replace('EMI: ', '').trim();
                const parts = titleWithoutPrefix.split(' - ');
                cardName = parts[0].trim();
                emiReason = parts.slice(1).join(' - ').trim();
                needsMigration = true;
            }
            // Old format 2: "EMI: Reason" (without card name)
            else if (expense.title.startsWith('EMI:') && !expense.title.startsWith('Card EMI:')) {
                emiReason = expense.title.replace('EMI: ', '').trim();
                cardName = expense.suggestedCard || '';
                needsMigration = true;
            }
            // New format but missing suggestedCard: "Card EMI: Reason"
            else if (expense.title.startsWith('Card EMI:') && !expense.suggestedCard) {
                emiReason = expense.title.replace('Card EMI: ', '').trim();
                
                // Try to extract card name from description
                if (expense.description) {
                    // Description format: "CardName EMI payment X/Y" or "Auto-added EMI payment X/Y for CardName"
                    const forMatch = expense.description.match(/for (.+)$/);
                    if (forMatch) {
                        cardName = forMatch[1].trim();
                    } else {
                        // Try to match "CardName EMI payment"
                        const emiMatch = expense.description.match(/^(.+?)\s+EMI payment/);
                        if (emiMatch) {
                            cardName = emiMatch[1].trim();
                        }
                    }
                }
                
                // If still no card name, try to find by EMI reason in cards
                if (!cardName && window.DB.cards) {
                    const foundCard = window.DB.cards.find(c => 
                        c.emis && c.emis.some(e => e.reason === emiReason)
                    );
                    if (foundCard) {
                        cardName = foundCard.name;
                    }
                }
                
                if (cardName) {
                    needsMigration = true;
                }
            }
            
            if (needsMigration && emiReason) {
                // Update title to new format
                expense.title = `Card EMI: ${emiReason}`;
                
                // Ensure suggestedCard is set
                if (cardName && !expense.suggestedCard) {
                    expense.suggestedCard = cardName;
                }
                
                // Update description to include card name if not already
                if (cardName && expense.description && !expense.description.includes(cardName)) {
                    expense.description = `${cardName} - ${expense.description}`;
                }
                
                migrated++;
            }
        }
    });
    
    if (migrated > 0) {
        window.Storage.save();
        console.log(`✅ Migrated ${migrated} EMI expense(s) to new format`);
        if (showToast && window.Utils) {
            Utils.showSuccess(`Migrated ${migrated} EMI expense(s) to new format`);
        }
    }
    
    return migrated;
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Expenses = Expenses;
    window.Expenses.migrateOldEMIExpenses = migrateOldEMIExpenses;
    
    // Run migration immediately when expenses module loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                try {
                    const count = migrateOldEMIExpenses(false);
                    if (count > 0 && window.Expenses.render) {
                        window.Expenses.render(); // Re-render if expenses are being viewed
                    }
                } catch (error) {
                    console.error('EMI migration error:', error);
                }
            }, 500);
        });
    } else {
        // Document already loaded
        setTimeout(() => {
            try {
                const count = migrateOldEMIExpenses(false);
                if (count > 0 && window.Expenses.render) {
                    window.Expenses.render(); // Re-render if expenses are being viewed
                }
            } catch (error) {
                console.error('EMI migration error:', error);
            }
        }, 500);
    }
}

