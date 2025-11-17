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
    includeLoansInTotal: false, // Toggle for including loans in total
    
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
        const expense = this.getById(id);
        
        // If it's an auto-added recurring expense, mark as dismissed
        if (expense && this.isAutoRecurringExpense(expense)) {
            const dismissal = {
                title: expense.title,
                date: expense.date,
                amount: expense.amount,
                category: expense.category,
                dismissedAt: Utils.getCurrentTimestamp()
            };
            
            if (!window.DB.dismissedRecurringExpenses) {
                window.DB.dismissedRecurringExpenses = [];
            }
            
            // Add to dismissed list
            window.DB.dismissedRecurringExpenses.push(dismissal);
            console.log('Marked as dismissed:', dismissal);
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
     * Check if an expense is a loan EMI
     */
    isLoanEMIExpense(expense) {
        // Check if title matches loan EMI pattern: "<Bank> <Type> EMI"
        // Examples: "HDFC Home EMI", "SBI Car EMI", "ICICI Personal EMI"
        // Exclude card EMIs which start with "EMI:"
        return expense.title && 
               expense.title.includes(' EMI') && 
               expense.category === 'emi' && 
               !expense.title.startsWith('EMI:');
    },
    
    /**
     * Check if an expense is an auto-recurring expense (loan EMI, card EMI, or custom recurring)
     */
    isAutoRecurringExpense(expense) {
        // Loan EMIs
        if (this.isLoanEMIExpense(expense)) return true;
        
        // Card EMIs (start with "EMI:")
        if (expense.category === 'emi' && expense.title && expense.title.startsWith('EMI:')) return true;
        
        // Custom recurring expenses (category is 'recurring')
        if (expense.category === 'recurring') return true;
        
        return false;
    },
    
    /**
     * Format category display (EMI uppercase, Recurring capitalized)
     */
    formatCategoryDisplay(category) {
        if (category === 'emi') return 'EMI';
        if (category === 'recurring') return 'Recurring';
        return category;
    },
    
    /**
     * Get full details link for auto-recurring expense
     */
    getFullDetailsLink(expense) {
        if (!this.isAutoRecurringExpense(expense)) return '';
        
        // Escape for JavaScript context (replace single quotes with escaped quotes)
        const escapeJs = (str) => str.replace(/'/g, "\\'").replace(/"/g, '\\"');
        
        // Loan EMI - navigate to loans page
        if (this.isLoanEMIExpense(expense)) {
            return `<button onclick="Expenses.showLoanDetails('${escapeJs(expense.title)}')" class="text-xs text-blue-600 hover:text-blue-800 mt-1" style="text-decoration:none;">🔗 More Info...</button>`;
        }
        
        // Card EMI - show EMI details modal (pass expense ID to access suggestedCard)
        if (expense.category === 'emi' && expense.title && expense.title.startsWith('EMI:')) {
            return `<button onclick="Expenses.showCardEMIDetails(${expense.id})" class="text-xs text-blue-600 hover:text-blue-800 mt-1" style="text-decoration:none;">🔗 More Info...</button>`;
        }
        
        // Custom recurring expense - navigate to recurring page
        if (expense.category === 'recurring') {
            return `<button onclick="Expenses.showRecurringDetails('${escapeJs(expense.title)}')" class="text-xs text-blue-600 hover:text-blue-800 mt-1" style="text-decoration:none;">🔗 More Info...</button>`;
        }
        
        return '';
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
            window.Toast.error('Loan not found');
        }
    },
    
    /**
     * Show card EMI details in view-only modal
     */
    showCardEMIDetails(expenseId) {
        // Get the expense
        const expense = this.getById(expenseId);
        if (!expense) {
            window.Toast.error('Expense not found');
            return;
        }
        
        // Get EMI reason from title (remove "EMI: " prefix)
        let emiReason = expense.title.replace('EMI: ', '').trim();
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
                window.Toast.error('Card information not found');
                return;
            }
        }
        
        // Find the card
        const cards = window.DB.cards || [];
        const card = cards.find(c => c.name === cardName);
        
        if (!card) {
            window.Toast.error('Card not found');
            return;
        }
        
        if (window.Cards && window.Cards.showEMIDetailsModal) {
            // Show specific EMI details in modal
            window.Cards.showEMIDetailsModal(card.name, emiReason);
        } else {
            window.Toast.error('EMI details not available');
        }
    },
    
    /**
     * Show recurring expense details in view-only modal
     */
    showRecurringDetails(recurringName) {
        // Find the recurring expense by name
        const recurringExpenses = window.DB.recurringExpenses || [];
        const recurring = recurringExpenses.find(r => r.name === recurringName);
        
        if (recurring && window.RecurringExpenses && window.RecurringExpenses.showDetailsModal) {
            // Show recurring details in view modal
            window.RecurringExpenses.showDetailsModal(recurring.id);
        } else if (recurring && window.openRecurringExpenseModal) {
            // Fallback to edit modal if view modal doesn't exist
            window.openRecurringExpenseModal(recurring.id);
        } else {
            window.Toast.error('Recurring expense not found');
        }
    },
    
    /**
     * Check if a recurring expense has been dismissed
     */
    isDismissed(title, date, amount) {
        if (!window.DB.dismissedRecurringExpenses) return false;
        
        return window.DB.dismissedRecurringExpenses.some(d => 
            d.title === title && 
            d.date === date && 
            Math.abs(d.amount - amount) < 0.01
        );
    },
    
    /**
     * Manually add a recurring expense to expenses
     */
    addRecurringExpense(title, amount, category, date, description) {
        // Remove from dismissed list if it was dismissed
        if (window.DB.dismissedRecurringExpenses) {
            window.DB.dismissedRecurringExpenses = window.DB.dismissedRecurringExpenses.filter(d => 
                !(d.title === title && d.date === date && Math.abs(d.amount - amount) < 0.01)
            );
        }
        
        // Add to expenses
        this.add(title, amount, category, date, description, null);
        this.render();
        window.Toast.success('Added to expenses!');
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
        
        // Get credit card EMIs
        console.log('Cards module available:', !!window.Cards, 'DB cards:', window.DB.cards?.length || 0);
        if (window.Cards && window.DB.cards) {
            console.log('Checking card EMIs...', window.DB.cards.length, 'cards found');
            window.DB.cards.forEach(card => {
                console.log('Processing card:', card.name, 'Type:', card.cardType, 'EMIs:', card.emis?.length || 0);
                // Only process credit cards (not debit cards)
                if (card.cardType === 'debit') {
                    console.log('Skipping debit card:', card.name);
                    return;
                }
                if (!card.emis || card.emis.length === 0) {
                    console.log('No EMIs for card:', card.name);
                    return;
                }
                
                card.emis.forEach(emi => {
                    console.log('Processing EMI:', emi.reason, 'Completed:', emi.completed, 'Amount:', emi.emiAmount);
                    if (!emi.firstEmiDate || emi.completed || !emi.emiAmount) return;
                    
                    const firstDate = new Date(emi.firstEmiDate);
                    const emiDay = firstDate.getDate();
                    
                    // Calculate which EMI payment number this month would be
                    let monthsElapsed = (today.getFullYear() - firstDate.getFullYear()) * 12 
                                      + (today.getMonth() - firstDate.getMonth());
                    
                    // If current date hasn't reached the EMI day this month, subtract 1
                    if (today.getDate() < emiDay) {
                        monthsElapsed--;
                    }
                    
                    const emiNumber = monthsElapsed + 1;
                    
                    // Only if this EMI number is within total EMIs and not already completed
                    if (emiNumber > 0 && emiNumber <= emi.totalCount) {
                        const emiDate = new Date(today.getFullYear(), today.getMonth(), emiDay);
                        const emiDateStr = emiDate.toISOString().split('T')[0];
                        
                        const emiExpense = {
                            title: `EMI: ${emi.reason}`,
                            amount: parseFloat(emi.emiAmount),
                            category: 'emi',
                            date: emiDateStr,
                            description: `${card.name} EMI payment ${emiNumber}/${emi.totalCount}`,
                            suggestedCard: card.name,
                            isRecurring: true
                        };
                        
                        // Check if it exists in expenses already (check both old and new format)
                        const exists = window.DB.expenses.find(exp => {
                            const titleMatch = exp.title === emiExpense.title || 
                                               exp.title === `EMI: ${card.name} - ${emi.reason}`;
                            const dateMatch = exp.date === emiDateStr;
                            const amountMatch = Math.abs(exp.amount - emiExpense.amount) < 0.01;
                            return titleMatch && dateMatch && amountMatch;
                        });
                        
                        console.log('Card EMI:', emiExpense.title, 'Date:', emiDateStr, 'Exists:', !!exists);
                        
                        if (exists) {
                            // Already added to expenses
                            console.log('Card EMI already in expenses (completed):', emiExpense.title);
                            completed.push(emiExpense);
                        } else {
                            // Not yet added
                            if (today.getDate() < emiDay) {
                                // Date hasn't arrived yet
                                console.log('Card EMI upcoming (future):', emiExpense.title);
                                upcoming.push(emiExpense);
                            } else {
                                // Date passed but not added (should be auto-added)
                                console.log('Card EMI upcoming (past, should be added):', emiExpense.title);
                                upcoming.push(emiExpense);
                            }
                        }
                    }
                });
            });
        } else {
            console.log('Cards module or DB.cards not available');
        }
        
        // Get loan EMIs
        if (window.Loans && window.DB.loans) {
            console.log('Checking loans...', window.DB.loans.length, 'loans found');
            window.DB.loans.forEach(loan => {
                console.log('Processing loan:', loan.bankName, loan.loanType);
                
                // Check if loan has started yet
                const firstDate = new Date(loan.firstEmiDate);
                if (firstDate > today) {
                    console.log('Loan not started yet:', loan.bankName);
                    return; // Loan hasn't started yet
                }
                
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                console.log('Remaining EMIs:', remaining.emisRemaining);
                
                if (remaining.emisRemaining === 0) {
                    console.log('Loan closed:', loan.bankName);
                    return; // Skip closed loans
                }
                
                const emi = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                const emiDay = firstDate.getDate();
                
                // Check if EMI is due this month
                const thisMonthEmiDate = new Date(today.getFullYear(), today.getMonth(), emiDay);
                const emiDateStr = thisMonthEmiDate.toISOString().split('T')[0];
                
                console.log('Loan EMI date:', emiDateStr, 'Amount:', emi);
                
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
                    console.log('Loan EMI already in expenses (completed):', loanEmi.title);
                    completed.push(loanEmi);
                } else {
                    // If date has passed but not added to expenses, still show as upcoming
                    console.log('Loan EMI upcoming:', loanEmi.title);
                    upcoming.push(loanEmi);
                }
            });
        } else {
            console.log('No Loans module or no loans in DB');
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
                                    ${upcomingRecurring.map(exp => {
                                        // Check if this expense is already in expenses list
                                        const existsInExpenses = window.DB.expenses.find(e => 
                                            e.title === exp.title && 
                                            e.date === exp.date && 
                                            Math.abs(e.amount - exp.amount) < 0.01
                                        );
                                        
                                        return `
                                        <div class="flex justify-between items-center py-1.5 px-2 bg-blue-50 rounded border border-blue-100">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(exp.title)}</p>
                                                <p class="text-xs text-gray-500">${exp.description ? Utils.escapeHtml(exp.description) + ' • ' : ''}${Utils.formatDate(exp.date)}</p>
                                            </div>
                                            <div class="flex items-center gap-2 ml-2">
                                                <span class="text-sm font-semibold text-blue-700">${Utils.formatCurrency(exp.amount)}</span>
                                                ${!existsInExpenses ? `
                                                    <button onclick="Expenses.addRecurringExpense('${Utils.escapeHtml(exp.title).replace(/'/g, "\\'")}', ${exp.amount}, '${exp.category}', '${exp.date}', '${Utils.escapeHtml(exp.description || '').replace(/'/g, "\\'")}'); event.stopPropagation();" 
                                                            class="px-2 py-0.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors flex items-center gap-1" 
                                                            title="Add to Expenses">
                                                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                                                        </svg>
                                                        Add
                                                    </button>
                                                ` : `
                                                    <span class="text-xs text-green-600 font-medium">✓ Added</span>
                                                `}
                                            </div>
                                        </div>
                                    `}).join('')}
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
                                ${group.expenses.map(expense => {
                                    const isAutoRecurring = this.isAutoRecurringExpense(expense);
                                    return `
                                    <div class="p-3 bg-white rounded-lg border border-purple-200 hover:shadow-md transition-all">
                                        <!-- Top Row: Title with Category + Actions -->
                                        <div class="flex justify-between items-start mb-1">
                                            <div class="flex-1 flex items-center gap-2">
                                                <h4 class="font-semibold text-purple-800 text-xs">${Utils.escapeHtml(expense.title || expense.description)}</h4>
                                                <span class="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded">${Utils.escapeHtml(this.formatCategoryDisplay(expense.category))}</span>
                                            </div>
                                            <div class="flex gap-1">
                                                ${!isAutoRecurring ? `
                                                    <button onclick="openExpenseModal(${expense.id})" class="text-green-600 hover:text-green-800 p-0.5" title="Edit">
                                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                                        </svg>
                                                    </button>
                                                ` : ''}
                                                <button onclick="Expenses.deleteWithConfirm(${expense.id})" class="text-red-500 hover:text-red-700 p-0.5" title="Delete">
                                                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- Bottom Row: Description + Amount/Date -->
                                        <div class="flex justify-between items-start">
                                            <div class="flex-1">
                                                ${expense.description ? `<p class="text-xs text-gray-600">${Utils.escapeHtml(expense.description)}</p>` : '<p class="text-xs text-gray-400 italic">No description</p>'}
                                                ${this.getFullDetailsLink(expense)}
                                            </div>
                                            <div class="text-right ml-3">
                                                <p class="text-sm font-semibold text-purple-700">₹${parseFloat(expense.amount).toLocaleString()}</p>
                                                <p class="text-xs text-gray-500">${Utils.formatDate(expense.date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                `}).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } else {
            // Render flat list for single month
            list.innerHTML += paginatedExpenses.map(expense => {
                const isAutoRecurring = this.isAutoRecurringExpense(expense);
                return `
                <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 hover:shadow-md transition-all">
                    <!-- Top Row: Title with Category + Actions -->
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex-1 flex items-center gap-2 flex-wrap">
                            <h4 class="font-semibold text-purple-800 text-sm">${Utils.escapeHtml(expense.title || expense.description)}</h4>
                            <span class="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded">${Utils.escapeHtml(this.formatCategoryDisplay(expense.category))}</span>
                        </div>
                        <div class="flex gap-1">
                            ${!isAutoRecurring ? `
                                <button onclick="openExpenseModal(${expense.id})" class="text-green-600 hover:text-green-800 p-0.5" title="Edit">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                    </svg>
                                </button>
                            ` : ''}
                            <button onclick="Expenses.deleteWithConfirm(${expense.id})" class="text-red-500 hover:text-red-700 p-0.5" title="Delete">
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
                            ${expense.suggestedCard ? `<p class="text-xs text-green-600 mt-1">💳 ${Utils.escapeHtml(expense.suggestedCard)}</p>` : ''}
                            ${this.getFullDetailsLink(expense)}
                        </div>
                        <div class="text-right ml-4">
                            <p class="text-base font-semibold text-purple-700">₹${parseFloat(expense.amount).toLocaleString()}</p>
                            <p class="text-xs text-gray-500">${Utils.formatDate(expense.date)}</p>
                        </div>
                    </div>
                </div>
            `;
            }).join('');
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
        
        // Enable/disable filter and toggle buttons based on expenses existence
        this.updateControlsState();
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

/**
 * Migration: Fix old EMI expense titles
 */
function migrateOldEMIExpenses(showToast = false) {
    if (!window.DB || !window.DB.expenses) {
        console.log('No expenses to migrate');
        return 0;
    }
    
    let migrated = 0;
    window.DB.expenses.forEach(expense => {
        // Check if it's an EMI expense with old format "EMI: CardName - Reason"
        if (expense.category === 'emi' && expense.title && expense.title.startsWith('EMI:')) {
            const titleWithoutPrefix = expense.title.replace('EMI: ', '').trim();
            
            // If it contains " - ", it's the old format
            if (titleWithoutPrefix.includes(' - ')) {
                const parts = titleWithoutPrefix.split(' - ');
                const cardName = parts[0].trim();
                const emiReason = parts.slice(1).join(' - ').trim();
                
                console.log(`Migrating: "${expense.title}" -> "EMI: ${emiReason}"`);
                
                // Update title to only have EMI reason
                expense.title = `EMI: ${emiReason}`;
                
                // Ensure suggestedCard is set
                if (!expense.suggestedCard) {
                    expense.suggestedCard = cardName;
                }
                
                // Update description to include card name if not already
                if (expense.description && !expense.description.includes(cardName)) {
                    expense.description = `${cardName} - ${expense.description}`;
                }
                
                migrated++;
            }
        }
    });
    
    if (migrated > 0) {
        window.Storage.save();
        console.log(`✅ Migrated ${migrated} EMI expense(s) to new format`);
        if (showToast && window.Toast) {
            window.Toast.success(`Migrated ${migrated} EMI expense(s) to new format`);
        }
    } else {
        console.log('No EMI expenses to migrate');
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

