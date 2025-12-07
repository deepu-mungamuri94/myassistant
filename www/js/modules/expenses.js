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
    currentRecurringTab: 'upcoming', // Track current recurring expenses tab
    
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
        
        // Escape for JavaScript context (replace single quotes with escaped quotes)
        const escapeJs = (str) => str.replace(/'/g, "\\'").replace(/"/g, '\\"');
        
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
                
                // Store recurring ID in the expense for future reference
                if (expense) {
                    expense.recurringId = recurringId;
                    expense.isRecurring = true;
                }
            }
        }
        
        this.render();
        Utils.showSuccess('Added to expenses!');
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
                    category: 'recurring',
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
                    category: 'recurring',
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
        
        // Get recurring expenses (upcoming and completed) - only for monthly view
        let upcomingRecurring = [];
        let completedRecurring = [];
        let totalRecurring = 0;
        
        if (isSingleMonth) {
            const recurringData = this.getRecurringExpenses();
            upcomingRecurring = recurringData.upcoming;
            completedRecurring = recurringData.completed;
            totalRecurring = upcomingRecurring.length + completedRecurring.length;
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
        
        // Use all filtered expenses (no pagination)
        const paginatedExpenses = filteredExpenses;
        
        // Calculate total
        const total = this.getTotalAmount(filteredExpenses);
        const recurringTotal = [...upcomingRecurring, ...completedRecurring].reduce((sum, e) => sum + e.amount, 0);
        
        // Clear list
        list.innerHTML = '';
        
        // Calculate totals for each tab
        const upcomingTotal = upcomingRecurring.reduce((sum, e) => sum + e.amount, 0);
        const completedTotal = completedRecurring.reduce((sum, e) => sum + e.amount, 0);
        
        // Render recurring expenses section (if any)
        if (totalRecurring > 0) {
            list.innerHTML += `
                <details class="mb-3 bg-white rounded-xl border border-orange-300 overflow-hidden">
                    <summary class="cursor-pointer px-4 py-3 hover:bg-orange-50 transition-colors flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            <span class="font-semibold text-orange-900 text-sm">Recurring expenses / Loans (${totalRecurring})</span>
                        </div>
                        <span class="font-bold text-orange-800 text-sm">${Utils.formatCurrency(recurringTotal)}</span>
                    </summary>
                    <div class="px-4 pb-3">
                        <!-- Tabs for Upcoming and Completed -->
                        <div class="border-b border-orange-200 mb-3">
                            <div class="flex justify-evenly">
                                ${upcomingRecurring.length > 0 ? `
                                    <button onclick="Expenses.switchRecurringTab('upcoming')" 
                                            id="recurring-tab-upcoming"
                                            class="flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-blue-500 text-blue-600">
                                        <div class="flex flex-col items-center">
                                            <span>🕐 Upcoming (${upcomingRecurring.length})</span>
                                            <span class="text-xs font-bold mt-0.5">${Utils.formatCurrency(upcomingTotal)}</span>
                                        </div>
                                    </button>
                                ` : ''}
                                ${completedRecurring.length > 0 ? `
                                    <button onclick="Expenses.switchRecurringTab('completed')" 
                                            id="recurring-tab-completed"
                                            class="flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                        <div class="flex flex-col items-center">
                                            <span>✓ Completed (${completedRecurring.length})</span>
                                            <span class="text-xs font-bold mt-0.5">${Utils.formatCurrency(completedTotal)}</span>
                                        </div>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        
                        <!-- Tab Content: Upcoming -->
                        ${upcomingRecurring.length > 0 ? `
                            <div id="recurring-content-upcoming" class="space-y-1.5">
                                ${upcomingRecurring.map(exp => {
                                    // Check if this expense is already in expenses list
                                    // Check by recurringId first (handles amount/name changes), then by title/date/amount
                                    const existsInExpenses = window.DB.expenses.find(e => {
                                        // Check by recurringId if available (handles edited amounts and renamed expenses)
                                        if (exp.recurringId && e.recurringId && String(e.recurringId) === String(exp.recurringId)) {
                                            // Check if it's in the same month
                                            const expDate = new Date(exp.date);
                                            const eDate = new Date(e.date);
                                            return expDate.getFullYear() === eDate.getFullYear() && 
                                                   expDate.getMonth() === eDate.getMonth();
                                        }
                                        // Fallback to title/date/amount matching (for legacy entries)
                                        return e.title === exp.title && 
                                               e.date === exp.date && 
                                               Math.abs(e.amount - exp.amount) < 0.01;
                                    });
                                    
                                    // Calculate next payment count for display
                                    let displayDescription = exp.description || '';
                                    if (exp.recurringId) {
                                        const recurring = window.DB.recurringExpenses.find(r => String(r.id) === String(exp.recurringId));
                                        if (recurring && recurring.addedToExpenses) {
                                            const nextPaymentNumber = recurring.addedToExpenses.length + 1;
                                            // Update description to show next payment count if it contains a pattern like "3/6"
                                            displayDescription = displayDescription.replace(/(\d+)\/(\d+)/, (match, current, total) => {
                                                return `${nextPaymentNumber}/${total}`;
                                            });
                                        }
                                    }
                                    
                                    return `
                                    <div class="flex justify-between items-center py-1.5 px-2 bg-blue-50 rounded border border-blue-100">
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(exp.title)}</p>
                                            <p class="text-xs text-gray-500">${displayDescription ? Utils.escapeHtml(displayDescription) + ' • ' : ''}${Utils.formatDate(exp.date)}</p>
                                        </div>
                                        <div class="flex items-center gap-2 ml-2">
                                            <span class="text-sm font-semibold text-blue-700">${Utils.formatCurrency(exp.amount)}</span>
                                            ${!existsInExpenses ? `
                                                <button onclick="Expenses.addRecurringExpense('${Utils.escapeHtml(exp.title).replace(/'/g, "\\'")}', ${exp.amount}, '${exp.category}', '${exp.date}', '${Utils.escapeHtml(displayDescription || '').replace(/'/g, "\\'")}', '${exp.recurringId || ''}'); event.stopPropagation();" 
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
                        ` : ''}
                        
                        <!-- Tab Content: Completed -->
                        ${completedRecurring.length > 0 ? `
                            <div id="recurring-content-completed" class="space-y-1.5 hidden">
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
                    <div class="mb-4 bg-white rounded-xl border border-purple-300 overflow-hidden">
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
                                ${this.renderGroupedByDate(group.expenses)}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } else {
            // Render grouped by date for single month
            list.innerHTML += this.renderGroupedByDate(paginatedExpenses);
        }
        
        // Restore recurring tab state after re-rendering (if there are recurring expenses)
        if (totalRecurring > 0 && this.currentRecurringTab === 'completed') {
            setTimeout(() => {
                this.switchRecurringTab('completed');
            }, 0);
        }
        
        // Enable/disable filter and toggle buttons based on expenses existence
        this.updateControlsState();
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
            const dayExpenses = groupedByDate[date];
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
                    <summary class="cursor-pointer bg-purple-50 hover:bg-purple-100 border border-purple-200 p-3 transition-all list-none">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 transition-transform details-arrow text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <span class="font-bold text-sm text-purple-900">${formattedDate}</span>
                                <span class="text-xs text-purple-600">(${dayExpenses.length})</span>
                            </div>
                            <span class="font-bold text-sm text-purple-900">₹${Utils.formatIndianNumber(dayTotal)}</span>
                        </div>
                    </summary>
                    <div class="border-l border-r border-b border-purple-200">
                        ${dayExpenses.map((expense, expIndex) => {
                            const isAutoRecurring = this.isAutoRecurringExpense(expense);
                            const isLast = expIndex === dayExpenses.length - 1;
                            return `
                            <div class="p-3 bg-white hover:bg-purple-50 transition-all ${!isLast ? 'border-b border-purple-100' : ''}">
                                <!-- Top Row: Title with Category + Actions -->
                                <div class="flex justify-between items-start mb-1">
                                    <div class="flex-1 flex items-center gap-2 flex-wrap">
                                        <h4 class="font-semibold text-purple-800 text-sm">${Utils.escapeHtml(expense.title || expense.description)}</h4>
                                        <span class="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            ${(expense.isRecurring || expense.category === 'emi') ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' : ''}
                                            <span>${Utils.escapeHtml(this.formatCategoryDisplay(expense.category))}</span>
                                        </span>
                                    </div>
                                    <div class="flex gap-1">
                                        <button onclick="openExpenseModal(${expense.id})" class="text-green-600 hover:text-green-800 p-0.5" title="Edit">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                            </svg>
                                        </button>
                                        <button onclick="Expenses.deleteWithConfirm(${expense.id})" class="text-red-500 hover:text-red-700 p-0.5" title="Delete">
                                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Bottom Row: Description + Amount -->
                                <div class="flex justify-between items-start">
                                    <div class="flex-1">
                                        ${expense.description ? `<p class="text-xs text-gray-600">${Utils.escapeHtml(expense.description)}</p>` : '<p class="text-xs text-gray-400 italic">No description</p>'}
                                        ${expense.suggestedCard ? `<p class="text-xs text-green-600 mt-1">💳 ${Utils.escapeHtml(expense.suggestedCard)}</p>` : ''}
                                        ${this.getFullDetailsLink(expense)}
                                    </div>
                                    <div class="text-right ml-4">
                                        <p class="text-base font-semibold text-purple-700">₹${parseFloat(expense.amount).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('')}
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
     * Switch between Upcoming and Completed tabs in recurring expenses
     */
    switchRecurringTab(tab) {
        // Store current tab
        this.currentRecurringTab = tab;
        
        // Tab buttons
        const upcomingTab = document.getElementById('recurring-tab-upcoming');
        const completedTab = document.getElementById('recurring-tab-completed');
        
        // Tab contents
        const upcomingContent = document.getElementById('recurring-content-upcoming');
        const completedContent = document.getElementById('recurring-content-completed');
        
        if (tab === 'upcoming') {
            // Activate upcoming tab
            if (upcomingTab) {
                upcomingTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-blue-500 text-blue-600';
            }
            if (completedTab) {
                completedTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
            
            // Show upcoming content
            if (upcomingContent) upcomingContent.classList.remove('hidden');
            if (completedContent) completedContent.classList.add('hidden');
        } else if (tab === 'completed') {
            // Activate completed tab
            if (upcomingTab) {
                upcomingTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
            if (completedTab) {
                completedTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-green-500 text-green-600';
            }
            
            // Show completed content
            if (upcomingContent) upcomingContent.classList.add('hidden');
            if (completedContent) completedContent.classList.remove('hidden');
        }
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

