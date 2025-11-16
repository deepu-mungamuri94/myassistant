/**
 * Recurring Expenses Module
 * Handles custom recurring expenses (LIC, insurance, subscriptions, etc.)
 */

const RecurringExpenses = {
    /**
     * Add a new recurring expense
     * @param {string} name - Name of the recurring expense
     * @param {number} amount - Amount
     * @param {string} frequency - 'monthly', 'yearly', 'custom'
     * @param {number} day - Day of month (1-31)
     * @param {array} months - For custom frequency, array of month numbers (1-12). Empty for monthly/yearly.
     * @param {string} description - Optional description
     */
    add(name, amount, frequency, day, months = [], description = '') {
        if (!name || !amount || !frequency || !day) {
            throw new Error('Please fill in all required fields');
        }
        
        const recurring = {
            id: Utils.generateId(),
            name,
            amount: parseFloat(amount),
            frequency, // 'monthly', 'yearly', 'custom'
            day: parseInt(day),
            months: frequency === 'monthly' ? [] : months, // Empty for monthly (all months)
            description,
            addedToExpenses: [], // Track which months were added (format: 'YYYY-MM')
            createdAt: Utils.getCurrentTimestamp()
        };
        
        window.DB.recurringExpenses.push(recurring);
        window.Storage.save();
        
        return recurring;
    },

    /**
     * Update a recurring expense
     */
    update(id, name, amount, frequency, day, months, description) {
        const recurring = this.getById(id);
        if (!recurring) {
            throw new Error('Recurring expense not found');
        }
        
        if (!name || !amount || !frequency || !day) {
            throw new Error('Please fill in all required fields');
        }
        
        recurring.name = name;
        recurring.amount = parseFloat(amount);
        recurring.frequency = frequency;
        recurring.day = parseInt(day);
        recurring.months = frequency === 'monthly' ? [] : months;
        recurring.description = description;
        
        window.Storage.save();
        return recurring;
    },

    /**
     * Delete a recurring expense
     */
    delete(id) {
        window.DB.recurringExpenses = window.DB.recurringExpenses.filter(r => r.id !== id);
        window.Storage.save();
    },

    /**
     * Get recurring expense by ID
     */
    getById(id) {
        const searchId = String(id);
        return window.DB.recurringExpenses.find(r => String(r.id) === searchId);
    },

    /**
     * Get all recurring expenses
     */
    getAll() {
        return window.DB.recurringExpenses || [];
    },

    /**
     * Check if a recurring expense is due in a specific month
     */
    isDueInMonth(recurring, year, month) {
        // Month is 1-12
        if (recurring.frequency === 'monthly') {
            return true; // Due every month
        } else if (recurring.frequency === 'yearly') {
            // Due in specific month only
            return recurring.months.includes(month);
        } else if (recurring.frequency === 'custom') {
            // Due in specified months only
            return recurring.months.includes(month);
        }
        return false;
    },

    /**
     * Get upcoming recurring expenses (due in current month but date not reached)
     */
    getUpcoming() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentDay = today.getDate();
        
        const upcoming = [];
        
        this.getAll().forEach(recurring => {
            // Check if due this month
            if (!this.isDueInMonth(recurring, currentYear, currentMonth)) {
                return;
            }
            
            // Check if date hasn't arrived yet
            if (currentDay < recurring.day) {
                const dueDate = new Date(currentYear, currentMonth - 1, recurring.day);
                upcoming.push({
                    ...recurring,
                    dueDate: dueDate.toISOString().split('T')[0]
                });
            }
        });
        
        return upcoming.sort((a, b) => a.day - b.day);
    },

    /**
     * Auto-add recurring expenses to expenses for due dates
     */
    autoAddToExpenses() {
        const today = new Date();
        let addedCount = 0;
        
        this.getAll().forEach(recurring => {
            // Initialize tracking array if not exists
            if (!recurring.addedToExpenses) {
                recurring.addedToExpenses = [];
            }
            
            // Check all months from creation date to now
            const createdDate = new Date(recurring.createdAt);
            const startYear = createdDate.getFullYear();
            const startMonth = createdDate.getMonth() + 1;
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1;
            
            // Iterate through each month from creation to now
            for (let year = startYear; year <= currentYear; year++) {
                const monthStart = (year === startYear) ? startMonth : 1;
                const monthEnd = (year === currentYear) ? currentMonth : 12;
                
                for (let month = monthStart; month <= monthEnd; month++) {
                    // Check if due in this month
                    if (!this.isDueInMonth(recurring, year, month)) {
                        continue;
                    }
                    
                    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                    
                    // Skip if already added
                    if (recurring.addedToExpenses.includes(monthKey)) {
                        continue;
                    }
                    
                    // Check if the due date has passed
                    const dueDate = new Date(year, month - 1, recurring.day);
                    if (dueDate > today) {
                        continue; // Future date, don't add yet
                    }
                    
                    const dueDateStr = dueDate.toISOString().split('T')[0];
                    
                    // Check if expense already exists
                    const existingExpense = window.DB.expenses.find(exp => 
                        exp.title === recurring.name &&
                        exp.date === dueDateStr &&
                        exp.amount === recurring.amount
                    );
                    
                    if (!existingExpense) {
                        // Add as expense
                        try {
                            window.Expenses.add(
                                recurring.name,
                                recurring.amount,
                                'recurring',
                                dueDateStr,
                                recurring.description || 'Auto-added recurring expense',
                                null
                            );
                            
                            recurring.addedToExpenses.push(monthKey);
                            addedCount++;
                        } catch (error) {
                            console.error('Failed to add recurring expense:', error);
                        }
                    } else {
                        // Mark as added even if it exists
                        recurring.addedToExpenses.push(monthKey);
                    }
                }
            }
        });
        
        if (addedCount > 0) {
            window.Storage.save();
            console.log(`Auto-added ${addedCount} recurring expense(s)`);
        }
        
        return addedCount;
    },

    /**
     * Render recurring expenses list
     */
    render() {
        const list = document.getElementById('recurring-expenses-list');
        if (!list) return;
        
        const recurringExpenses = this.getAll();
        
        if (recurringExpenses.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No recurring expenses yet. Add your first one!</p>';
            return;
        }
        
        list.innerHTML = recurringExpenses.map(recurring => {
            // Format frequency display
            let frequencyText = '';
            if (recurring.frequency === 'monthly') {
                frequencyText = `Monthly on ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
            } else if (recurring.frequency === 'yearly' || recurring.frequency === 'custom') {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthsList = recurring.months.map(m => monthNames[m - 1]).join(', ');
                frequencyText = `${monthsList} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
            }
            
            return `
                <div class="p-4 bg-white rounded-xl border-2 border-orange-300 hover:shadow-lg transition-all">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <h4 class="font-bold text-gray-800 text-lg">${Utils.escapeHtml(recurring.name)}</h4>
                            <p class="text-sm text-gray-600 mt-1">₹${Utils.formatIndianNumber(recurring.amount)}</p>
                            <p class="text-xs text-orange-600 mt-1">${frequencyText}</p>
                            ${recurring.description ? `<p class="text-xs text-gray-500 mt-1">${Utils.escapeHtml(recurring.description)}</p>` : ''}
                        </div>
                        <div class="flex gap-2 ml-3">
                            <button onclick="openRecurringExpenseModal(${recurring.id})" class="text-blue-600 hover:text-blue-800 p-2" title="Edit">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="RecurringExpenses.deleteWithConfirm(${recurring.id})" class="text-red-600 hover:text-red-800 p-2" title="Delete">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const recurring = this.getById(id);
        if (!recurring) return;
        
        const confirmed = await Utils.confirm(
            `Delete "${recurring.name}"? This action cannot be undone.`,
            'Delete Recurring Expense'
        );
        
        if (confirmed) {
            this.delete(id);
            this.render();
            window.Toast.success('Recurring expense deleted!');
        }
    },

    /**
     * Get ordinal suffix for day
     */
    getOrdinalSuffix(day) {
        if (day >= 11 && day <= 13) return 'th';
        switch (day % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.RecurringExpenses = RecurringExpenses;
}

