/**
 * Recurring Expenses Module
 * Handles custom recurring expenses (LIC, insurance, subscriptions, etc.)
 */

const RecurringExpenses = {
    currentTab: 'active', // 'active' | 'suspended' - like Loans active/closed
    /**
     * Add a new recurring expense
     * @param {string} name - Name of the recurring expense
     * @param {string} category - Category of the expense
     * @param {number} amount - Amount
     * @param {string} frequency - 'monthly', 'yearly', 'custom'
     * @param {number} day - Day of month (1-31)
     * @param {array} months - For yearly/custom frequency, array of month numbers (1-12). Empty for monthly.
     * @param {string} description - Optional description
     * @param {string} endDate - Optional end date (YYYY-MM-DD), null for indefinite
     * @param {object} paymentMethod - Optional payment method object
     */
    add(name, category, amount, frequency, day, months = [], description = '', endDate = null, paymentMethod = null) {
        if (!name || !category || !amount || !frequency || !day) {
            throw new Error('Please fill in all required fields');
        }
        
        const recurring = {
            id: Utils.generateId(),
            name,
            category,
            amount: parseFloat(amount),
            frequency, // 'monthly', 'yearly', 'custom'
            day: parseInt(day),
            months: frequency === 'monthly' ? [] : months, // Empty for monthly (all months)
            description,
            endDate: endDate || null, // null = indefinite
            paymentMethod: paymentMethod || null, // Payment method for this recurring expense
            isActive: true, // Becomes false when end date is reached
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
    update(id, name, category, amount, frequency, day, months, description, endDate = null, paymentMethod = null) {
        const recurring = this.getById(id);
        if (!recurring) {
            throw new Error('Recurring expense not found');
        }
        
        if (!name || !category || !amount || !frequency || !day) {
            throw new Error('Please fill in all required fields');
        }
        
        const oldCategory = recurring.category;
        
        recurring.name = name;
        recurring.category = category;
        recurring.amount = parseFloat(amount);
        recurring.frequency = frequency;
        recurring.day = parseInt(day);
        recurring.months = frequency === 'monthly' ? [] : months;
        recurring.description = description;
        recurring.endDate = endDate || null;
        recurring.paymentMethod = paymentMethod || null;
        // Keep isActive unchanged during manual updates
        
        // If category changed, update all related expenses
        if (oldCategory !== category && recurring.addedToExpenses && recurring.addedToExpenses.length > 0) {
            this.bulkUpdateExpenseCategories(id, category);
        }
        
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
     * Bulk update categories for all expenses related to a recurring expense
     * @param {number} recurringId - The recurring expense ID
     * @param {string} newCategory - The new category to apply
     */
    bulkUpdateExpenseCategories(recurringId, newCategory) {
        const recurringIdStr = String(recurringId);
        const recurring = this.getById(recurringId);
        let updatedCount = 0;
        
        console.log(`🔄 Bulk updating categories for recurring "${recurring ? recurring.name : 'Unknown'}" (ID: ${recurringIdStr}) to "${newCategory}"`);
        
        // Find all expenses with this recurringId and update their category
        window.DB.expenses.forEach(expense => {
            if (expense.recurringId && String(expense.recurringId) === recurringIdStr) {
                console.log(`  ↳ Updating expense: ${expense.title} (${expense.date}) - Old: ${expense.category}, New: ${newCategory}`);
                expense.category = newCategory;
                updatedCount++;
            }
        });
        
        if (updatedCount > 0) {
            window.Storage.save();
            console.log(`✅ Updated category for ${updatedCount} related expense(s) from "${recurring ? recurring.name : 'Unknown'}"`);
        } else {
            console.log(`ℹ️  No expenses found with recurringId: ${recurringIdStr}`);
        }
        
        return updatedCount;
    },

    /**
     * Check if a recurring expense is effectively active (not ended, not suspended)
     * Also auto-resumes if suspendedUntil date has passed
     */
    isEffectivelyActive(recurring) {
        if (!recurring) return false;
        if (recurring.isActive === false) return false;
        
        // Auto-resume if suspended with a resume date that has passed
        if (recurring.suspended && recurring.suspendedUntil) {
            const resumeDate = new Date(recurring.suspendedUntil);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            resumeDate.setHours(0, 0, 0, 0);
            if (today >= resumeDate) {
                const resumeDateStr = recurring.suspendedUntil;
                if (recurring.suspendedFrom) {
                    if (!recurring.suspensionPeriods) recurring.suspensionPeriods = [];
                    recurring.suspensionPeriods.push({ from: recurring.suspendedFrom, to: resumeDateStr });
                }
                recurring.suspended = false;
                recurring.suspendedUntil = null;
                recurring.suspendedFrom = null;
                window.Storage.save();
                return true;
            }
        }
        
        return !recurring.suspended;
    },

    /**
     * Suspend a recurring expense
     * @param {number|string} id - Recurring expense ID
     * @param {string|null} resumeDate - Resume date (YYYY-MM-DD), or null for indefinite until manual resume
     */
    suspend(id, resumeDate = null) {
        const recurring = this.getById(id);
        if (!recurring) {
            throw new Error('Recurring expense not found');
        }
        const today = new Date();
        recurring.suspended = true;
        recurring.suspendedUntil = resumeDate || null;
        recurring.suspendedFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        window.Storage.save();
        return recurring;
    },

    /**
     * Check if a due date fell within any past suspension period
     * Works for any frequency (daily, weekly, monthly, yearly) - date-based check
     * @param {object} recurring - Recurring expense
     * @param {Date} dueDate - The due date to check
     * @returns {boolean} - true if we should skip adding (due date was during suspension)
     */
    _wasDueDateDuringSuspension(recurring, dueDate) {
        // Backward compat: old skippedMonths (month-key based)
        if (recurring.skippedMonths && recurring.skippedMonths.length > 0) {
            const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
            if (recurring.skippedMonths.includes(monthKey)) return true;
        }
        
        const periods = recurring.suspensionPeriods || [];
        dueDate.setHours(0, 0, 0, 0);
        
        for (const period of periods) {
            const from = new Date(period.from);
            const to = new Date(period.to);
            from.setHours(0, 0, 0, 0);
            to.setHours(0, 0, 0, 0);
            if (dueDate >= from && dueDate <= to) {
                return true;
            }
        }
        
        return false;
    },

    /**
     * Resume a suspended recurring expense
     * @param {number|string} id - Recurring expense ID
     */
    resume(id) {
        const recurring = this.getById(id);
        if (!recurring) {
            throw new Error('Recurring expense not found');
        }
        const today = new Date();
        const resumeDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Record this suspension period for future add-time checks
        if (recurring.suspendedFrom) {
            if (!recurring.suspensionPeriods) recurring.suspensionPeriods = [];
            recurring.suspensionPeriods.push({ from: recurring.suspendedFrom, to: resumeDateStr });
        }
        
        recurring.suspended = false;
        recurring.suspendedUntil = null;
        recurring.suspendedFrom = null;
        window.Storage.save();
        return recurring;
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
     * The effective due-day for a given month, clamped to that month's last day.
     * A payment set for the 31st must fall on Feb 28/29, Apr 30, etc. — without
     * this, `new Date(year, month-1, 31)` rolls over into the next month (Feb 31
     * → Mar 3), landing the auto-added expense on the wrong date entirely.
     * @param {number} day   1–31 as configured by the user
     * @param {number} year
     * @param {number} month 1–12
     */
    effectiveDay(day, year, month) {
        const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month
        return Math.min(parseInt(day) || 1, lastDay);
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
            // Skip inactive or suspended
            if (!this.isEffectivelyActive(recurring)) return;
            
            // Check if due this month
            if (!this.isDueInMonth(recurring, currentYear, currentMonth)) {
                return;
            }
            
            // Check if date hasn't arrived yet (clamp the day to this month).
            const effDay = this.effectiveDay(recurring.day, currentYear, currentMonth);
            if (currentDay < effDay) {
                const dueDate = new Date(currentYear, currentMonth - 1, effDay);
                upcoming.push({
                    ...recurring,
                    dueDate: Utils.formatLocalDate(dueDate)
                });
            }
        });
        
        return upcoming.sort((a, b) => a.day - b.day);
    },
    
    /**
     * Get completed recurring expenses (due today or already passed in current month)
     */
    getCompleted() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentDay = today.getDate();
        const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        
        const completed = [];
        
        this.getAll().forEach(recurring => {
            // Skip inactive or suspended
            if (!this.isEffectivelyActive(recurring)) return;
            
            // Check if due this month
            if (!this.isDueInMonth(recurring, currentYear, currentMonth)) {
                return;
            }
            
            // Show if date has passed or is today (clamp the day to this month).
            const effDay = this.effectiveDay(recurring.day, currentYear, currentMonth);
            if (currentDay >= effDay) {
                const dueDate = new Date(currentYear, currentMonth - 1, effDay);
                const wasAdded = recurring.addedToExpenses && recurring.addedToExpenses.includes(currentMonthKey);
                completed.push({
                    ...recurring,
                    dueDate: Utils.formatLocalDate(dueDate),
                    wasAdded: wasAdded
                });
            }
        });
        
        return completed.sort((a, b) => a.day - b.day);
    },
    
    /**
     * Calculate total recurring expenses for a specific month
     */
    getMonthlyTotal(year, month) {
        let total = 0;
        
        this.getAll().forEach(recurring => {
            // Skip inactive or suspended
            if (!this.isEffectivelyActive(recurring)) return;
            
            // Skip if end date is before this month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(year, month - 1, 1);
                if (checkDate > endDate) return;
            }
            
            // Check if due in this month
            if (this.isDueInMonth(recurring, year, month)) {
                total += recurring.amount;
            }
        });
        
        return total;
    },

    /**
     * Migration: Ensure all recurring expenses have a category field
     * Call this on app initialization
     */
    migrateCategories() {
        let migrated = 0;
        
        this.getAll().forEach(recurring => {
            if (!recurring.category) {
                recurring.category = 'Other'; // Default category for existing data
                migrated++;
            }
        });
        
        if (migrated > 0) {
            window.Storage.save();
            console.log(`✅ Migrated ${migrated} recurring expense(s) to have default category`);
        }
        
        return migrated;
    },

    /**
     * Auto-add recurring expenses to expenses for due dates
     */
    autoAddToExpenses() {
        const today = new Date();
        let addedCount = 0;
        let updatedCount = 0;
        
        this.getAll().forEach(recurring => {
            // Initialize tracking array if not exists
            if (!recurring.addedToExpenses) {
                recurring.addedToExpenses = [];
            }
            
            // Initialize isActive if not exists
            if (recurring.isActive === undefined) {
                recurring.isActive = true;
            }
            
            // Check if end date has passed
            if (recurring.endDate && recurring.isActive) {
                const endDate = new Date(recurring.endDate);
                const endOfMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0); // Last day of end month
                if (today > endOfMonth) {
                    recurring.isActive = false;
                    updatedCount++;
                    return; // Skip adding more expenses
                }
            }
            
            // Skip inactive or suspended recurring expenses (isEffectivelyActive also auto-resumes if suspendedUntil passed)
            if (!this.isEffectivelyActive(recurring)) {
                return;
            }
            
            // Check all months from creation date to now (or end date if specified)
            const createdDate = new Date(recurring.createdAt);
            const startYear = createdDate.getFullYear();
            const startMonth = createdDate.getMonth() + 1;
            
            // Determine the end point for checking
            let checkEndYear = today.getFullYear();
            let checkEndMonth = today.getMonth() + 1;
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                if (endDate < today) {
                    checkEndYear = endDate.getFullYear();
                    checkEndMonth = endDate.getMonth() + 1;
                }
            }
            
            // Iterate through each month from creation to check end point
            for (let year = startYear; year <= checkEndYear; year++) {
                const monthStart = (year === startYear) ? startMonth : 1;
                const monthEnd = (year === checkEndYear) ? checkEndMonth : 12;
                
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
                    
                    // Check if the due date has passed (clamp the day to this
                    // month so a "31st" payment lands on the last valid day).
                    const effDay = this.effectiveDay(recurring.day, year, month);
                    const dueDate = new Date(year, month - 1, effDay);
                    if (dueDate > today) {
                        continue; // Future date, don't add yet
                    }

                    const dueDateStr = Utils.formatLocalDate(dueDate);

                    // Skip if due date fell during a suspension period (works for any frequency)
                    if (this._wasDueDateDuringSuspension(recurring, dueDate)) {
                        continue;
                    }
                    
                    // Check if dismissed by user (pass recurringId for better tracking)
                    const isDismissed = window.Expenses && window.Expenses.isDismissed(recurring.name, dueDateStr, recurring.amount, recurring.id);
                    
                    if (isDismissed) {
                        console.log('Recurring expense dismissed by user, skipping:', recurring.name);
                        continue;
                    }
                    
                    // Check if expense already exists
                    // First check by recurringId (handles name changes), then by title/date/amount
                    const existingExpense = window.DB.expenses.find(exp => {
                        // If expense has recurringId and it matches, it's the same recurring expense
                        if (exp.recurringId && String(exp.recurringId) === String(recurring.id)) {
                            // Check if it's in the same month
                            const expDate = new Date(exp.date);
                            const expMonthKey = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
                            return expMonthKey === monthKey;
                        }
                        // Fallback to title/date/amount matching (for legacy entries)
                        return exp.title === recurring.name &&
                               exp.date === dueDateStr &&
                               Math.abs(exp.amount - recurring.amount) < 0.01;
                    });
                    
                    if (!existingExpense) {
                        // Add as expense
                        try {
                            // Use category from recurring, fallback to 'Other' if not set
                            const category = recurring.category || 'Other';
                            
                            const expense = window.Expenses.add(
                                recurring.name,
                                recurring.amount,
                                category,
                                dueDateStr,
                                recurring.description || 'Auto-added recurring expense',
                                null
                            );
                            
                            // Store recurring ID, isRecurring flag, and payment method in the expense
                            if (expense) {
                                expense.recurringId = recurring.id;
                                expense.isRecurring = true;
                                
                                // Copy payment method from recurring expense
                                if (recurring.paymentMethod) {
                                    expense.paymentMethod = recurring.paymentMethod;
                                    
                                    // Update credit card outstanding if paid via credit card
                                    if (recurring.paymentMethod.type === 'credit_card' && recurring.paymentMethod.id) {
                                        const card = (window.DB.cards || []).find(c => String(c.id) === String(recurring.paymentMethod.id));
                                        if (card) {
                                            const oldAmount = parseFloat(card.outstanding) || 0;
                                            card.outstanding = oldAmount + parseFloat(recurring.amount);
                                            console.log(`Auto-updated ${card.name} outstanding: ₹${oldAmount} → ₹${card.outstanding}`);
                                        }
                                    }
                                }
                            }
                            
                            recurring.addedToExpenses.push(monthKey);
                            addedCount++;
                        } catch (error) {
                            console.error('Failed to add recurring expense:', error);
                        }
                    } else {
                        // Mark as added even if it exists (manually added earlier)
                        recurring.addedToExpenses.push(monthKey);
                    }
                }
            }
        });
        
        if (addedCount > 0 || updatedCount > 0) {
            window.Storage.save();
            console.log(`Auto-added ${addedCount} recurring expense(s), marked ${updatedCount} as inactive`);
        }
        
        return addedCount;
    },

    /**
     * Show recurring expense details in a view-only modal
     */
    showDetailsModal(id) {
        const recurring = window.DB.recurringExpenses.find(r => r.id === id || String(r.id) === String(id));
        if (!recurring) {
            Utils.showError('Recurring expense not found');
            return;
        }
        
        const html = this.renderRecurringForModal(recurring);
        
        // Create and show modal
        const modalHtml = `
            <div id="recurring-details-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 z-[1001] flex items-center justify-center p-4" onclick="if(event.target===this) RecurringExpenses.closeDetailsModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div class="sticky top-0 bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                        <h2 class="text-xl font-bold text-white">Recurring Expense Details</h2>
                        <button onclick="RecurringExpenses.closeDetailsModal()" class="text-white hover:text-gray-200 p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="p-6">
                        ${html}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existing = document.getElementById('recurring-details-modal');
        if (existing) existing.remove();
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    /**
     * Close recurring expense details modal
     */
    closeDetailsModal() {
        const modal = document.getElementById('recurring-details-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Show suspend modal for a recurring expense
     */
    showSuspendModal(id) {
        const recurring = this.getById(id);
        if (!recurring) {
            Utils.showError('Recurring expense not found');
            return;
        }
        
        const modalHtml = `
            <div id="recurring-suspend-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 z-[1002] flex items-center justify-center p-4" onclick="if(event.target===this) RecurringExpenses.closeSuspendModal()">
                <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onclick="event.stopPropagation()">
                    <h2 class="text-xl font-bold mb-2 text-amber-700">Suspend Recurring Expense</h2>
                    <p class="text-sm text-gray-600 mb-4">"${Utils.escapeHtml(recurring.name)}" will not be added to expenses while suspended.</p>
                    
                    <div class="mb-4">
                        <label class="flex items-center gap-2 cursor-pointer p-3 border-2 border-gray-200 rounded-lg hover:border-amber-300 mb-2">
                            <input type="radio" name="suspend-type" value="indefinite" checked>
                            <span class="text-sm font-medium">Suspend indefinitely</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer p-3 border-2 border-gray-200 rounded-lg hover:border-amber-300">
                            <input type="radio" name="suspend-type" value="until-date">
                            <span class="text-sm font-medium">Resume on date</span>
                        </label>
                    </div>
                    
                    <div id="suspend-date-wrapper" class="mb-4 hidden">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Resume Date</label>
                        <input type="date" id="suspend-resume-date" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                    </div>
                    
                    <div class="flex gap-2 justify-end">
                        <button onclick="RecurringExpenses.closeSuspendModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                        <button onclick="RecurringExpenses.confirmSuspend(${id})" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg">Suspend</button>
                    </div>
                </div>
            </div>
        `;
        
        const existing = document.getElementById('recurring-suspend-modal');
        if (existing) existing.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Toggle date input visibility
        document.querySelectorAll('input[name="suspend-type"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const wrapper = document.getElementById('suspend-date-wrapper');
                wrapper.classList.toggle('hidden', document.querySelector('input[name="suspend-type"]:checked').value !== 'until-date');
            });
        });
    },
    
    /**
     * Confirm and apply suspend
     */
    confirmSuspend(id) {
        const resumeDateInput = document.getElementById('suspend-resume-date');
        const isUntilDate = document.querySelector('input[name="suspend-type"]:checked').value === 'until-date';
        const resumeDate = isUntilDate && resumeDateInput && resumeDateInput.value ? resumeDateInput.value : null;
        
        if (isUntilDate && (!resumeDateInput || !resumeDateInput.value)) {
            Utils.showError('Please select a resume date');
            return;
        }
        
        try {
            this.suspend(id, resumeDate);
            this.closeSuspendModal();
            this.render();
            Utils.showSuccess(resumeDate ? `Suspended until ${new Date(resumeDate).toLocaleDateString()}` : 'Suspended indefinitely');
        } catch (error) {
            Utils.showError(error.message);
        }
    },
    
    /**
     * Close suspend modal
     */
    closeSuspendModal() {
        const modal = document.getElementById('recurring-suspend-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Switch between Active and Suspended tabs (like Loans active/closed)
     */
    switchRecurringStatusTab(tab) {
        this.currentTab = tab;
        
        const activeTab = document.getElementById('recurring-status-tab-active');
        const suspendedTab = document.getElementById('recurring-status-tab-suspended');
        const activeContent = document.getElementById('recurring-content-active');
        const suspendedContent = document.getElementById('recurring-content-suspended');
        
        if (tab === 'active') {
            if (activeTab) {
                activeTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-orange-500 text-orange-600 flex items-center justify-center gap-2';
            }
            if (suspendedTab) {
                suspendedTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            }
            if (activeContent) activeContent.classList.remove('hidden');
            if (suspendedContent) suspendedContent.classList.add('hidden');
        } else if (tab === 'suspended') {
            if (activeTab) {
                activeTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            }
            if (suspendedTab) {
                suspendedTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-gray-300 text-gray-700 flex items-center justify-center gap-2';
            }
            if (activeContent) activeContent.classList.add('hidden');
            if (suspendedContent) suspendedContent.classList.remove('hidden');
        }
    },
    
    /**
     * Render recurring expense for view modal
     */
    renderRecurringForModal(recurring) {
        // Format frequency display
        let frequencyText = '';
        if (recurring.frequency === 'monthly') {
            frequencyText = `Monthly on ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
        } else if (recurring.frequency === 'yearly') {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = recurring.months && recurring.months[0] ? monthNames[recurring.months[0] - 1] : '';
            frequencyText = `Yearly on ${monthName} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
        } else if (recurring.frequency === 'custom') {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthsList = recurring.months.map(m => monthNames[m - 1]).join(', ');
            frequencyText = `${monthsList} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
        }
        
        // Format end date
        let endDateText = 'Indefinite';
        if (recurring.endDate) {
            const endDate = new Date(recurring.endDate);
            endDateText = `Until ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
        }
        
        return `
            <div class="p-4 bg-white rounded-xl border-2 border-orange-300 shadow-xl">
                <!-- Name and Description -->
                <div class="mb-3">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <h4 class="font-bold text-gray-800 text-sm">${Utils.escapeHtml(recurring.name)}</h4>
                        ${recurring.category ? `<span class="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-semibold">${Utils.escapeHtml(recurring.category)}</span>` : '<span class="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">No Category</span>'}
                    </div>
                    ${recurring.description ? `<p class="text-xs text-gray-600">${Utils.escapeHtml(recurring.description)}</p>` : '<p class="text-xs text-gray-400 italic">No description</p>'}
                </div>
                
                <!-- Amount and Schedule -->
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div class="bg-orange-50 p-3 rounded-lg">
                        <p class="text-xs text-orange-600 font-semibold mb-1">Amount</p>
                        <p class="text-base font-bold text-orange-800">₹${Utils.formatIndianNumber(recurring.amount)}</p>
                    </div>
                    <div class="bg-orange-50 p-3 rounded-lg">
                        <p class="text-xs text-orange-600 font-semibold mb-1">Frequency</p>
                        <p class="text-xs font-semibold text-orange-800">${Utils.escapeHtml(frequencyText)}</p>
                    </div>
                </div>
                
                <!-- Duration -->
                <div class="bg-gray-50 p-3 rounded-lg">
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-gray-600">Duration</span>
                        <span class="text-xs font-semibold text-gray-800">${Utils.escapeHtml(endDateText)}</span>
                    </div>
                </div>
                
                <!-- Payment Method -->
                ${recurring.paymentMethod ? `
                <div class="bg-gray-50 p-3 rounded-lg mt-3">
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-gray-600">Payment Method</span>
                        <span class="text-xs font-semibold text-gray-800 flex items-center gap-1">
                            ${this.getPaymentMethodIcon(recurring.paymentMethod)}
                            ${this.getPaymentMethodLabel(recurring.paymentMethod)}
                        </span>
                    </div>
                </div>
                ` : ''}
                
                <!-- Status -->
                ${recurring.suspended ? `
                <div class="mt-3 flex items-center gap-2 text-amber-600">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm0 4a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <span class="text-sm font-semibold">Suspended${recurring.suspendedUntil ? ` until ${new Date(recurring.suspendedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ' (until you resume)'}</span>
                </div>
                ` : recurring.isActive !== false ? `
                <div class="mt-3 flex items-center gap-2 text-green-700">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                    <span class="text-sm font-semibold">Active</span>
                </div>
                ` : `
                <div class="mt-3 flex items-center gap-2 text-gray-500">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                    </svg>
                    <span class="text-sm font-semibold">Inactive</span>
                </div>
                `}
            </div>
        `;
    },
    
    /**
     * Render recurring expenses list
     */
    render() {
        const list = document.getElementById('recurring-expenses-list');
        if (!list) return;
        
        // Auto-add any due recurring expenses to the expenses list
        this.autoAddToExpenses();
        
        const recurringExpenses = this.getAll();
        
        if (recurringExpenses.length === 0) {
            list.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">🔄</div>
                    <p class="text-gray-500 text-sm mb-4">No recurring expenses yet</p>
                    <button onclick="openRecurringExpenseModal()"
                            class="px-6 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg hover:shadow-lg transition-all transform hover:scale-105 font-semibold">
                        + Add your first recurring expense
                    </button>
                </div>
            `;
            return;
        }
        
        // Calculate monthly totals
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;
        
        const currentMonthTotal = this.getMonthlyTotal(currentYear, currentMonth);
        const nextMonthTotal = this.getMonthlyTotal(nextMonthYear, nextMonth);
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonthName = monthNames[currentMonth - 1];
        const nextMonthName = monthNames[nextMonth - 1];
        
        // Separate active, suspended, and inactive (ended), sort by day of month ascending
        const activeExpenses = recurringExpenses
            .filter(r => r.isActive !== false && !r.suspended)
            .sort((a, b) => a.day - b.day);
        const suspendedExpenses = recurringExpenses
            .filter(r => r.isActive !== false && r.suspended)
            .sort((a, b) => a.day - b.day);
        const inactiveExpenses = recurringExpenses
            .filter(r => r.isActive === false)
            .sort((a, b) => a.day - b.day);
        
        let html = '';
        
        // Monthly Estimation Banner — glossy twin tiles (current vs next month),
        // with a delta chip so the month-over-month change reads at a glance.
        const monthDelta = nextMonthTotal - currentMonthTotal;
        const deltaChip = (currentMonthTotal > 0 || nextMonthTotal > 0)
            ? `<span class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${monthDelta > 0 ? 'bg-white/25' : monthDelta < 0 ? 'bg-white/25' : 'bg-white/15'} text-white">
                   ${monthDelta > 0 ? '▲' : monthDelta < 0 ? '▼' : '='} ₹${Utils.formatIndianNumber(Math.abs(monthDelta))}
               </span>`
            : '';
        const activeMonthlyCount = activeExpenses.length;
        html += `
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div class="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600">
                    <div class="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none"></div>
                    <div class="relative">
                        <div class="flex items-center gap-1.5 mb-1.5">
                            <span class="flex items-center justify-center w-6 h-6 rounded-lg bg-white/20 flex-shrink-0">
                                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </span>
                            <p class="text-[11px] font-semibold text-white/90 leading-tight">This Month</p>
                        </div>
                        <p class="text-2xl font-extrabold mb-0.5 tracking-tight">₹${Utils.formatIndianNumber(currentMonthTotal)}</p>
                        <p class="text-[10px] text-white/80">${currentMonthName} • ${activeMonthlyCount} active item${activeMonthlyCount !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div class="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg bg-gradient-to-br from-amber-600 via-amber-700 to-yellow-700">
                    <div class="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none"></div>
                    <div class="relative">
                        <div class="flex items-center justify-between mb-1.5">
                            <p class="text-[11px] font-semibold text-white/90 leading-tight">Next Month</p>
                            ${deltaChip}
                        </div>
                        <p class="text-2xl font-extrabold mb-0.5 tracking-tight">₹${Utils.formatIndianNumber(nextMonthTotal)}</p>
                        <p class="text-[10px] text-white/80">${nextMonthName} • Expected recurring</p>
                    </div>
                </div>
            </div>
            ${suspendedExpenses.length > 0 ? `<p class="text-[11px] text-gray-500 mb-4">⏸ ${suspendedExpenses.length} suspended item${suspendedExpenses.length !== 1 ? 's' : ''} not included in the above estimates</p>` : ''}
        `;
        
        // Tab container (Active | Suspended) - like Loans
        const activeCount = activeExpenses.length + inactiveExpenses.length;
        const suspendedCount = suspendedExpenses.length;
        
        // Default to suspended tab when only suspended items exist
        if (activeCount === 0 && suspendedCount > 0) {
            this.currentTab = 'suspended';
        }
        
        if (activeCount > 0 || suspendedCount > 0) {
            const activeTabClass = this.currentTab === 'active' 
                ? 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-orange-500 text-orange-600 flex items-center justify-center gap-2'
                : 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            const suspendedTabClass = this.currentTab === 'suspended'
                ? 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-gray-300 text-gray-700 flex items-center justify-center gap-2'
                : 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            
            html += `
                <div class="bg-white rounded-xl border-2 border-gray-200 overflow-hidden mb-4">
                    <div class="border-b border-gray-200">
                        <div class="flex justify-evenly">
                            ${activeCount > 0 ? `
                                <button onclick="RecurringExpenses.switchRecurringStatusTab('active')" 
                                        id="recurring-status-tab-active"
                                        class="${activeTabClass}">
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    Active (${activeCount})
                                </button>
                            ` : ''}
                            <button onclick="RecurringExpenses.switchRecurringStatusTab('suspended')" 
                                    id="recurring-status-tab-suspended"
                                    class="${suspendedTabClass}">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"/>
                                </svg>
                                Suspended (${suspendedCount})
                            </button>
                        </div>
                    </div>
                    
                    <!-- Tab Content: Active (includes inactive/ended) -->
                    <div id="recurring-content-active" class="p-3 ${this.currentTab !== 'active' ? 'hidden' : ''}">
            `;
        }
        
        // Group active expenses by day of month
        const groupedByDay = {};
        activeExpenses.forEach(recurring => {
            const day = recurring.day;
            if (!groupedByDay[day]) {
                groupedByDay[day] = [];
            }
            groupedByDay[day].push(recurring);
        });
        
        // Render active expenses grouped by day (inside Active tab content)
        if (activeExpenses.length > 0 && (activeCount > 0 || suspendedCount > 0)) {
            // Add expand/collapse all button
            html += `
                <div class="flex justify-end mb-3">
                    <button id="toggle-recurring-groups-btn" onclick="RecurringExpenses.toggleAllDayGroups()" class="px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-lg transition-all duration-200 text-xs font-semibold">
                        📁 Collapse All
                    </button>
                </div>
            `;
            
            const sortedDays = Object.keys(groupedByDay).sort((a, b) => parseInt(a) - parseInt(b));
            
            sortedDays.forEach(day => {
                const groupExpenses = groupedByDay[day];
                const groupTotal = groupExpenses.reduce((sum, r) => sum + parseFloat(r.amount), 0);
                
                html += `
                    <details class="recurring-day-group mb-4 last:mb-0 rounded-xl overflow-hidden border border-orange-200 shadow-sm" open>
                        <summary class="cursor-pointer bg-gradient-to-r from-orange-200 to-amber-200 hover:from-orange-300 hover:to-amber-300 border-b border-orange-300 p-3 transition-all list-none font-semibold">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-2">
                                    <svg class="w-4 h-4 transition-transform details-arrow text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                    <span class="flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-lg bg-white/70 text-orange-800 font-bold text-xs">${day}${this.getOrdinalSuffix(day)}</span>
                                    <span class="font-bold text-sm text-orange-900">of Month</span>
                                    <span class="text-[10px] font-semibold text-orange-700 bg-white/70 px-1.5 py-0.5 rounded-full">${groupExpenses.length}</span>
                                </div>
                                <span class="font-bold text-sm text-orange-900 tabular-nums">₹${Utils.formatIndianNumber(groupTotal)}</span>
                            </div>
                        </summary>
                        <div class="bg-white border-l border-r border-b border-orange-200">
                `;
                
                html += groupExpenses.map((recurring, index) => {
                    const isLast = index === groupExpenses.length - 1;
                // Format frequency display
                let frequencyText = '';
                if (recurring.frequency === 'monthly') {
                    frequencyText = `Monthly on ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                } else if (recurring.frequency === 'yearly') {
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthName = recurring.months && recurring.months[0] ? monthNames[recurring.months[0] - 1] : '';
                    frequencyText = `Yearly on ${monthName} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                } else if (recurring.frequency === 'custom') {
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthsList = recurring.months.map(m => monthNames[m - 1]).join(', ');
                    frequencyText = `${monthsList} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                }
                
                // Format end date
                let endDateText = 'Indefinite';
                if (recurring.endDate) {
                    const endDate = new Date(recurring.endDate);
                    endDateText = `Until ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
                }
                
                return `
                    <div class="p-3 bg-orange-50 hover:bg-orange-100 transition-all ${!isLast ? 'border-b border-orange-100' : ''}">
                        <!-- First Line: Name + Category | Actions -->
                        <div class="flex justify-between items-start mb-2">
                            <div onclick="RecurringExpenses.showDetailsModal(${recurring.id})" class="flex items-center gap-2 flex-wrap cursor-pointer flex-1">
                                ${recurring.paymentMethod ? this.getPaymentMethodIcon(recurring.paymentMethod) : ''}
                                <h4 class="font-bold text-gray-800 text-sm" title="${Utils.escapeHtml(recurring.name || '')}">${Utils.escapeHtml(this.truncateName(recurring.name, 22))}</h4>
                                ${recurring.category ? `<span class="text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded">${Utils.escapeHtml(recurring.category)}</span>` : ''}
                            </div>
                            <div class="flex gap-2 ml-4">
                                    <button onclick="RecurringExpenses.showSuspendModal(${recurring.id})" class="text-amber-600 hover:text-amber-800 p-2" title="Suspend" aria-label="Suspend recurring expense">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                    </button>
                                    <button onclick="openRecurringExpenseModal(${recurring.id})" class="text-blue-600 hover:text-blue-800 p-2" title="Edit" aria-label="Edit recurring expense">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg>
                                    </button>
                                    <button onclick="RecurringExpenses.deleteWithConfirm(${recurring.id})" class="text-red-600 hover:text-red-800 p-2" title="Delete" aria-label="Delete recurring expense">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        
                        <!-- Second Line: Description | Amount (clickable) -->
                        <div onclick="RecurringExpenses.showDetailsModal(${recurring.id})" class="flex justify-between items-center cursor-pointer">
                            <div class="flex-1">
                                ${recurring.description ? `<p class="text-xs text-gray-600">${Utils.escapeHtml(recurring.description)}</p>` : '<p class="text-xs text-gray-400 italic">No description</p>'}
                            </div>
                            <p class="text-base font-bold text-orange-700 ml-4">₹${Utils.formatIndianNumber(recurring.amount)}</p>
                        </div>
                        
                        <!-- Frequency and End Date on same line -->
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-orange-600 font-medium">📅 ${frequencyText}</span>
                            <span class="text-gray-500">${endDateText}</span>
                        </div>
                    </div>
                `;
                }).join('');
                
                html += `
                        </div>
                    </details>
                `;
            });
        }
        
        // Render inactive (ended) expenses - inside Active tab, collapsed
        if (inactiveExpenses.length > 0) {
            html += `
                <details class="mt-4">
                    <summary class="text-sm font-semibold text-gray-500 cursor-pointer p-3 bg-gray-100 rounded-lg hover:bg-gray-200">
                        Inactive / Ended (${inactiveExpenses.length})
                    </summary>
                    <div class="mt-2 space-y-2">
                        ${inactiveExpenses.map(recurring => {
                            let frequencyText = '';
                            if (recurring.frequency === 'monthly') {
                                frequencyText = `Monthly on ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                            } else if (recurring.frequency === 'yearly') {
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const monthName = recurring.months && recurring.months[0] ? monthNames[recurring.months[0] - 1] : '';
                                frequencyText = `Yearly on ${monthName} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                            } else if (recurring.frequency === 'custom') {
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const monthsList = recurring.months.map(m => monthNames[m - 1]).join(', ');
                                frequencyText = `${monthsList} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                            }
                            return `
                                <div class="p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-300 opacity-75">
                                    <div class="flex justify-between items-start mb-2">
                                        <div class="flex-1">
                                            <div class="flex items-center gap-2 flex-wrap mb-0.5">
                                                <h4 class="font-semibold text-gray-700 text-sm">${Utils.escapeHtml(recurring.name)} <span class="text-xs text-gray-500">(Ended)</span></h4>
                                                ${recurring.category ? `<span class="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">${Utils.escapeHtml(recurring.category)}</span>` : ''}
                                            </div>
                                            ${recurring.description ? `<p class="text-xs text-gray-500 mt-0.5">${Utils.escapeHtml(recurring.description)}</p>` : ''}
                                        </div>
                                        <div class="ml-4 flex items-start gap-3">
                                            <p class="text-sm font-semibold text-gray-600">₹${Utils.formatIndianNumber(recurring.amount)}</p>
                                            <button onclick="RecurringExpenses.deleteWithConfirm(${recurring.id})" class="text-red-600 hover:text-red-800 p-0.5" title="Delete">
                                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="text-xs text-gray-500">📅 ${frequencyText}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </details>
            `;
        }
        
        // Close Active tab content and add Suspended tab content
        if (activeCount > 0 || suspendedCount > 0) {
            html += `
                    </div>
                    
                    <!-- Tab Content: Suspended -->
                    <div id="recurring-content-suspended" class="p-3 space-y-2 ${this.currentTab !== 'suspended' ? 'hidden' : ''}">
            `;
        }
        
        // Render suspended expenses (inside Suspended tab) or empty state
        if (suspendedExpenses.length > 0) {
            html += suspendedExpenses.map((recurring, index) => {
                            const isLast = index === suspendedExpenses.length - 1;
                            let frequencyText = '';
                            if (recurring.frequency === 'monthly') {
                                frequencyText = `Monthly on ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                            } else if (recurring.frequency === 'yearly') {
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const monthName = recurring.months && recurring.months[0] ? monthNames[recurring.months[0] - 1] : '';
                                frequencyText = `Yearly on ${monthName} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                            } else if (recurring.frequency === 'custom') {
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const monthsList = recurring.months.map(m => monthNames[m - 1]).join(', ');
                                frequencyText = `${monthsList} ${recurring.day}${this.getOrdinalSuffix(recurring.day)}`;
                            }
                            const resumeText = recurring.suspendedUntil 
                                ? `Resumes ${new Date(recurring.suspendedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                : 'Suspended indefinitely';
                            return `
                                <div class="p-3 bg-gray-50 hover:bg-gray-100 transition-all ${!isLast ? 'border-b border-gray-200' : ''}">
                                    <!-- First Line: Name + Category | Actions (Resume, Delete) -->
                                    <div class="flex justify-between items-start mb-2">
                                        <div onclick="RecurringExpenses.showDetailsModal(${recurring.id})" class="flex items-center gap-2 flex-wrap cursor-pointer flex-1">
                                            ${recurring.paymentMethod ? this.getPaymentMethodIcon(recurring.paymentMethod) : ''}
                                            <h4 class="font-bold text-gray-800 text-sm" title="${Utils.escapeHtml(recurring.name || '')}">${Utils.escapeHtml(this.truncateName(recurring.name, 22))}</h4>
                                            ${recurring.category ? `<span class="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">${Utils.escapeHtml(recurring.category)}</span>` : ''}
                                        </div>
                                        <div class="flex gap-2 ml-4">
                                            <button onclick="RecurringExpenses.resume(${recurring.id}); RecurringExpenses.render(); Utils.showSuccess('Resumed!');" class="text-green-600 hover:text-green-800 p-2" title="Resume" aria-label="Resume recurring expense">
                                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z"/>
                                                </svg>
                                            </button>
                                            <button onclick="openRecurringExpenseModal(${recurring.id})" class="text-blue-600 hover:text-blue-800 p-2" title="Edit" aria-label="Edit recurring expense">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                                </svg>
                                            </button>
                                            <button onclick="RecurringExpenses.deleteWithConfirm(${recurring.id})" class="text-red-600 hover:text-red-800 p-2" title="Delete" aria-label="Delete recurring expense">
                                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <!-- Second Line: Description | Amount (same as active) -->
                                    <div onclick="RecurringExpenses.showDetailsModal(${recurring.id})" class="flex justify-between items-center cursor-pointer">
                                        <div class="flex-1">
                                            ${recurring.description ? `<p class="text-xs text-gray-600">${Utils.escapeHtml(recurring.description)}</p>` : '<p class="text-xs text-gray-400 italic">No description</p>'}
                                        </div>
                                        <p class="text-base font-bold text-gray-700 ml-4">₹${Utils.formatIndianNumber(recurring.amount)}</p>
                                    </div>
                                    <!-- Frequency and End Date on same line -->
                                    <div class="flex justify-between items-center text-xs">
                                        <span class="text-gray-600 font-medium">📅 ${frequencyText}</span>
                                        <span class="text-gray-500">${resumeText}</span>
                                    </div>
                                </div>
                            `;
                        }).join('');
        } else {
            html += `<p class="text-gray-500 text-center py-8 text-sm">No suspended items. Use the pause button on any active item to suspend it.</p>`;
        }
        
        // Close Suspended tab content and tab container
        if (activeCount > 0 || suspendedCount > 0) {
            html += `
                    </div>
                </div>
            `;
        }
        
        list.innerHTML = html;
    },

    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const recurring = this.getById(id);
        if (!recurring) return;
        
        // Check if there are any expenses with this recurringId
        const linkedExpenses = window.DB.expenses.filter(e => 
            e.recurringId && String(e.recurringId) === String(id)
        );
        
        let message = `Delete "${recurring.name}"?`;
        
        if (linkedExpenses.length > 0) {
            message += `\n\n⚠️ Warning: ${linkedExpenses.length} expense(s) are linked to this recurring expense. They will remain in your expenses but won't be connected to any recurring schedule.`;
        }
        
        message += '\n\nThis action cannot be undone.';
        
        const confirmed = await Utils.confirm(
            message,
            'Delete Recurring Expense'
        );
        
        if (confirmed) {
            this.delete(id);
            this.render();
            Utils.showSuccess('Recurring expense deleted!');
        }
    },

    /**
     * Toggle expand/collapse all day groups
     */
    toggleAllDayGroups() {
        const groups = document.querySelectorAll('.recurring-day-group');
        const allExpanded = Array.from(groups).every(group => group.hasAttribute('open'));
        
        groups.forEach(group => {
            if (allExpanded) {
                group.removeAttribute('open');
            } else {
                group.setAttribute('open', '');
            }
        });
        
        // Update button text
        const button = document.getElementById('toggle-recurring-groups-btn');
        if (button) {
            button.textContent = allExpanded ? '📂 Expand All' : '📁 Collapse All';
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
     * Get payment method icon (same as Expenses module)
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
     * Get payment method label text
     */
    getPaymentMethodLabel(method) {
        if (!method || !method.type) return '';
        
        switch(method.type) {
            case 'cash':
                return 'Cash';
            case 'upi':
                if (method.id === 'phonepe') return 'PhonePe';
                if (method.id === 'gpay') return 'Google Pay';
                if (method.id === 'paytm') return 'Paytm';
                return 'UPI';
            case 'credit_card':
                let ccLabel = method.name || 'Credit Card';
                if (method.last4) ccLabel += ` ••${method.last4}`;
                return ccLabel;
            case 'debit_card':
                let dcLabel = method.name || 'Debit Card';
                if (method.last4) dcLabel += ` ••${method.last4}`;
                return dcLabel;
            default:
                return method.type;
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.RecurringExpenses = RecurringExpenses;
}

