/**
 * Dashboard Module
 * Provides overview of expenses, income, and EMI/Loan progress
 */

const Dashboard = {
    // Store selected month range
    selectedMonthRange: null,
    // Store selected filter month for second line cards
    selectedFilterMonth: null,
    // Store excluded categories (for category chart filtering)
    excludedCategories: null,
    // Investment chart instance
    investmentChartInstance: null,
    // Selected month for budget rule cards
    selectedBudgetMonth: null,
    // Selected month range for investments trend
    selectedInvestmentRange: null,
    // Credit card chart view mode: 'total' or 'individual'
    creditCardChartView: 'total',
    // Selected month range for credit card bills chart
    selectedCreditCardRange: null,
    // Investments chart view mode: 'total' or 'category'
    investmentsChartView: 'total',
    // First line cards month view: 'current' or 'next'
    firstLineMonthView: 'current',
    
    // Default category mappings for Needs vs Wants
    defaultNeedsCategories: [
        'Bills & Utilities', 'Groceries', 'Healthcare', 'Transportation', 
        'EMI', 'Loan EMI', 'Credit Card EMI', 'Rent', 'Insurance', 
        'Education', 'Personal & Family'
    ],
    defaultWantsCategories: [
        'Entertainment', 'Food & Dining', 'Shopping', 'Travel', 
        'Subscriptions', 'Gifts', 'Hobbies', 'Other'
    ],
    
    // Default budget rule percentages
    defaultBudgetRule: { needs: 50, wants: 30, invest: 20 },
    
    /**
     * Get budget rule percentages (user configured or default)
     */
    get budgetRule() {
        return window.DB.budgetRuleConfig || this.defaultBudgetRule;
    },
    
    /**
     * Check if loan EMIs should be included in budget calculation
     * Default: false (exclude loan EMIs)
     */
    get includeLoanEmis() {
        return window.DB.budgetIncludeLoanEmis === true;
    },
    
    /**
     * Get needs categories (user configured or default)
     */
    get needsCategories() {
        return window.DB.budgetCategoryConfig?.needs || this.defaultNeedsCategories;
    },
    
    /**
     * Get wants categories (user configured or default)
     */
    get wantsCategories() {
        return window.DB.budgetCategoryConfig?.wants || this.defaultWantsCategories;
    },
    
    /**
     * Initialize excluded categories from localStorage
     */
    initExcludedCategories() {
        if (this.excludedCategories !== null) return; // Already initialized
        
        try {
            const saved = localStorage.getItem('dashboard_excluded_categories');
            if (saved) {
                this.excludedCategories = new Set(JSON.parse(saved));
                
                // Safety check: ensure at least one category is visible
                const allData = this.getCategoryData(true);
                const visibleCount = allData.filter(item => !this.excludedCategories.has(item.category)).length;
                
                if (visibleCount === 0 && allData.length > 0) {
                    // If all categories are excluded, reset to default
                    console.warn('All categories were excluded. Resetting to defaults.');
                    this.excludedCategories = new Set(['EMI', 'Personal & Family']);
                    this.saveExcludedCategories();
                }
            } else {
                // Default exclusions: EMI and Personal & Family
                this.excludedCategories = new Set(['EMI', 'Personal & Family']);
                this.saveExcludedCategories();
            }
        } catch (e) {
            console.error('Error loading excluded categories:', e);
            this.excludedCategories = new Set(['EMI', 'Personal & Family']);
        }
    },
    
    /**
     * Save excluded categories to localStorage
     */
    saveExcludedCategories() {
        try {
            localStorage.setItem('dashboard_excluded_categories', JSON.stringify([...this.excludedCategories]));
        } catch (e) {
            console.error('Error saving excluded categories:', e);
        }
    },
    
    /**
     * Toggle category exclusion
     */
    toggleCategoryExclusion(category) {
        this.initExcludedCategories();
        
        if (this.excludedCategories.has(category)) {
            // Always allow re-enabling
            this.excludedCategories.delete(category);
        } else {
            // Check if this is the last visible category
            const allData = this.getCategoryData(true);
            const visibleCount = allData.filter(item => !this.excludedCategories.has(item.category)).length;
            
            if (visibleCount <= 1) {
                // Don't allow excluding the last category
                window.Toast.show('Cannot exclude the last category', 'error');
                return;
            }
            
            this.excludedCategories.add(category);
        }
        
        this.saveExcludedCategories();
        this.renderCategoryChart();
    },
    
    /**
     * Render dashboard
     */
    render() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;
        
        // Initialize excluded categories
        this.initExcludedCategories();
        
        // Destroy all existing chart instances first
        this.destroyAllCharts();
        
        // Get number of months from selected range
        const monthsCount = this.getMonthsCount();
        
        // Get data for specified months
        const loans = this.getLoansData();
        
        container.innerHTML = `
            <!-- Monthly Expenses Cards Box -->
            ${this.renderFirstLineCards()}
            
            ${this.renderMonthlyBreakdown()}
            
            ${this.renderNeedsWantsInvestments()}
            
            <!-- Category Expenses Chart -->
            <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <h3 class="text-sm font-semibold text-gray-700">Expenses by Category</h3>
                    <div class="relative">
                        <input type="month" id="category-month-selector" value="${this.getCurrentMonthValue()}" onchange="Dashboard.updateCategoryButton(); Dashboard.renderCategoryChart()" class="absolute opacity-0 pointer-events-none" />
                        <button id="category-month-button" onclick="document.getElementById('category-month-selector').showPicker()" class="px-3 py-1.5 border border-purple-300 rounded-lg text-xs font-medium text-purple-700 hover:bg-purple-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(this.getCurrentMonthValue())} ▼
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-center max-w-full" style="height: 144px; gap: 16px;">
                    <div style="flex: 0 0 160px; max-width: 160px;">
                        <canvas id="category-chart"></canvas>
                    </div>
                    <div id="category-chart-legend" style="flex: 1; overflow-y: auto; max-height: 144px;"></div>
                </div>
            </div>
            
            <!-- Income vs Expenses Chart -->
            <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <h3 class="text-sm font-semibold text-gray-700">Income vs Expenses</h3>
                    <button onclick="Dashboard.openMonthRangeModal()" class="px-3 py-1.5 border border-blue-300 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 transition-all whitespace-nowrap">
                        <span id="month-range-label">${this.getMonthRangeLabel()}</span> ▼
                    </button>
                </div>
                <div style="height: 400px; max-width: 100%;">
                    <canvas id="income-expense-chart"></canvas>
                </div>
            </div>
            
            <!-- Investments Chart -->
            ${this.renderInvestmentsSection()}
            
            <!-- EMI/Loan Progress -->
            ${loans.length > 0 ? `
            <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <h3 class="text-sm font-semibold text-gray-700 mb-3">EMI/Loan Progress</h3>
                <div style="height: ${Math.max(200, Math.min(400, loans.length * 60))}px; max-width: 100%;">
                    <canvas id="loans-chart"></canvas>
                </div>
            </div>
            ` : ''}
            
            <!-- Credit Card Bills Chart -->
            ${this.renderCreditCardBillsSection()}
        `;
        
        // Add investment range modal if not exists
        if (!document.getElementById('investment-range-modal')) {
            const modalHtml = `
            <div id="investment-range-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeInvestmentRangeModal()">
                <div class="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Select Month Range</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
                            <input type="month" id="investment-range-start" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">End Month</label>
                            <input type="month" id="investment-range-end" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-5">
                        <button onclick="Dashboard.applyInvestmentRange()" class="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all">
                            Apply
                        </button>
                        <button onclick="Dashboard.resetInvestmentRange()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-all">
                            Reset
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        // Initialize charts after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.initializeCharts();
        }, 100);
    },
    
    /**
     * Render First Line Cards (Recurring, Loans/EMIs, Regular Expenses)
     */
    renderFirstLineCards() {
        const isCurrent = this.firstLineMonthView === 'current';
        const now = new Date();
        const targetYear = isCurrent ? now.getFullYear() : (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
        const targetMonth = isCurrent ? now.getMonth() + 1 : (now.getMonth() === 11 ? 1 : now.getMonth() + 2);
        
        // Get formatted month name (e.g., "Dec 2024")
        const targetDate = new Date(targetYear, targetMonth - 1, 1);
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        const minNetPay = this.getMinimumNetPay();
        const recurringExpenses = this.getTotalRecurringExpensesForMonth(targetYear, targetMonth);
        const totalEmis = this.getTotalEmisForMonth(targetYear, targetMonth);
        // For regular expenses: use actual for current month, projected average for next month
        const regularExpenses = isCurrent ? this.getRegularExpenses() : this.getProjectedRegularExpenses();
        const isProjected = !isCurrent;
        
        const recurringPercent = minNetPay > 0 ? ((recurringExpenses / minNetPay) * 100).toFixed(1) : 0;
        const emisPercent = minNetPay > 0 ? ((totalEmis / minNetPay) * 100).toFixed(1) : 0;
        const regularPercent = minNetPay > 0 ? ((regularExpenses / minNetPay) * 100).toFixed(1) : 0;
        
        const regularLabel = 'Reg.Expenses';
        
        return `
        <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden" id="first-line-cards-section">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-700">${monthName}</h3>
                <div class="flex bg-gray-100 rounded-lg p-0.5">
                    <button onclick="Dashboard.switchFirstLineMonthView('current')" 
                        class="px-2 py-1 text-xs rounded-md transition-all ${isCurrent ? 'bg-white shadow-sm text-purple-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                        Current
                    </button>
                    <button onclick="Dashboard.switchFirstLineMonthView('next')" 
                        class="px-2 py-1 text-xs rounded-md transition-all ${!isCurrent ? 'bg-white shadow-sm text-purple-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                        Next
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-3 max-w-full">
                <div onclick="Dashboard.showMonthList('recurring', ${targetYear}, ${targetMonth})" class="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                    <div class="text-xs opacity-90 leading-tight">Rec.Payments</div>
                    <div class="flex-1 flex items-center justify-center">
                        <div class="text-3xl font-bold">${recurringPercent}<span class="text-lg opacity-80">%</span></div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(recurringExpenses)}</div>
                        <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                    </div>
                </div>
                <div onclick="Dashboard.showMonthList('emis', ${targetYear}, ${targetMonth})" class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                    <div class="text-xs opacity-90 leading-tight">Loans / EMIs</div>
                    <div class="flex-1 flex items-center justify-center">
                        <div class="text-3xl font-bold">${emisPercent}<span class="text-lg opacity-80">%</span></div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(totalEmis)}</div>
                        <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                    </div>
                </div>
                <div onclick="Dashboard.showMonthList('regular', ${targetYear}, ${targetMonth})" class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                    <div class="text-xs opacity-90 leading-tight">${regularLabel}</div>
                    <div class="flex-1 flex items-center justify-center">
                        <div class="text-3xl font-bold">${isProjected ? '~' : ''}${regularPercent}<span class="text-lg opacity-80">%</span></div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="text-xs opacity-90">${isProjected ? '~' : ''}₹${Utils.formatIndianNumber(regularExpenses)}</div>
                        <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">${isProjected ? '?' : '›'}</div>
                    </div>
                </div>
            </div>
        </div>
        `;
    },
    
    /**
     * Switch first line cards month view
     */
    switchFirstLineMonthView(view) {
        this.firstLineMonthView = view;
        const section = document.getElementById('first-line-cards-section');
        if (section) {
            section.outerHTML = this.renderFirstLineCards();
        }
    },
    
    /**
     * Render Investments section
     */
    renderInvestmentsSection() {
        const isTotal = this.investmentsChartView === 'total';
        
        return `
        <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden" id="investments-section">
            <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 class="text-sm font-semibold text-gray-700">📈 Investments</h3>
                <div class="flex items-center gap-2">
                    <button onclick="Dashboard.openInvestmentRangeModal()" class="px-2 py-1 border border-emerald-300 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-all whitespace-nowrap">
                        <span id="investment-range-label">${this.getInvestmentRangeLabel()}</span> ▼
                    </button>
                    <div class="flex bg-gray-100 rounded-lg p-0.5">
                        <button onclick="Dashboard.switchInvestmentsChartView('total')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${isTotal ? 'bg-white shadow-sm text-emerald-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            Total
                        </button>
                        <button onclick="Dashboard.switchInvestmentsChartView('category')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${!isTotal ? 'bg-white shadow-sm text-emerald-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            By Type
                        </button>
                    </div>
                </div>
            </div>
            <div style="height: 300px; max-width: 100%;">
                <canvas id="investments-trend-chart"></canvas>
            </div>
        </div>
        `;
    },
    
    /**
     * Switch investments chart view
     */
    switchInvestmentsChartView(view) {
        this.investmentsChartView = view;
        
        // Destroy existing chart
        if (this.investmentChartInstance) {
            this.investmentChartInstance.destroy();
            this.investmentChartInstance = null;
        }
        
        // Re-render the section
        const section = document.getElementById('investments-section');
        if (section) {
            section.outerHTML = this.renderInvestmentsSection();
            this.renderInvestmentsTrendChart();
        }
    },
    
    /**
     * Render Credit Card Bills section
     */
    renderCreditCardBillsSection() {
        const paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && b.paidAt);
        if (paidBills.length === 0) return '';
        
        const isTotal = this.creditCardChartView === 'total';
        
        return `
        <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden" id="credit-card-bills-section">
            <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 class="text-sm font-semibold text-gray-700">💳 Credit Usage</h3>
                <div class="flex items-center gap-2">
                    <button onclick="Dashboard.openCreditCardRangeModal()" class="px-2 py-1 border border-indigo-300 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-all whitespace-nowrap">
                        <span id="credit-card-range-label">${this.getCreditCardRangeLabel()}</span> ▼
                    </button>
                    <div class="flex bg-gray-100 rounded-lg p-0.5">
                        <button onclick="Dashboard.switchCreditCardChartView('total')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${isTotal ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            Total
                        </button>
                        <button onclick="Dashboard.switchCreditCardChartView('individual')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${!isTotal ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            By Card
                        </button>
                    </div>
                </div>
            </div>
            <div style="height: 220px; max-width: 100%;">
                <canvas id="credit-card-bills-chart"></canvas>
            </div>
        </div>
        `;
    },
    
    /**
     * Switch credit card chart view
     */
    switchCreditCardChartView(view) {
        this.creditCardChartView = view;
        
        // Destroy existing chart
        if (this.creditCardBillsChartInstance) {
            this.creditCardBillsChartInstance.destroy();
            this.creditCardBillsChartInstance = null;
        }
        
        // Re-render the section
        const section = document.getElementById('credit-card-bills-section');
        if (section) {
            section.outerHTML = this.renderCreditCardBillsSection();
            this.renderCreditCardBillsChart();
        }
    },
    
    /**
     * Get credit card range label
     */
    getCreditCardRangeLabel() {
        if (!this.selectedCreditCardRange) {
            return 'Last 6 months';
        }
        const start = this.getFormattedMonth(this.selectedCreditCardRange.start);
        const end = this.getFormattedMonth(this.selectedCreditCardRange.end);
        return `${start} - ${end}`;
    },
    
    /**
     * Open credit card range modal
     */
    openCreditCardRangeModal() {
        // Create modal if it doesn't exist
        if (!document.getElementById('credit-card-range-modal')) {
            const modalHtml = `
            <div id="credit-card-range-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeCreditCardRangeModal()">
                <div class="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Select Month Range</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
                            <input type="month" id="cc-range-start" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">End Month</label>
                            <input type="month" id="cc-range-end" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-5">
                        <button onclick="Dashboard.applyCreditCardRange()" class="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all">
                            Apply
                        </button>
                        <button onclick="Dashboard.resetCreditCardRange()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all">
                            Reset
                        </button>
                        <button onclick="Dashboard.closeCreditCardRangeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        const modal = document.getElementById('credit-card-range-modal');
        
        // Set default values
        const now = new Date();
        const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (this.selectedCreditCardRange) {
            document.getElementById('cc-range-start').value = this.selectedCreditCardRange.start;
            document.getElementById('cc-range-end').value = this.selectedCreditCardRange.end;
        } else {
            document.getElementById('cc-range-start').value = startMonth;
            document.getElementById('cc-range-end').value = endMonth;
        }
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close credit card range modal
     */
    closeCreditCardRangeModal() {
        const modal = document.getElementById('credit-card-range-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Apply credit card range selection
     */
    applyCreditCardRange() {
        const start = document.getElementById('cc-range-start').value;
        const end = document.getElementById('cc-range-end').value;
        
        if (!start || !end) {
            alert('Please select both start and end months');
            return;
        }
        
        // Validate range
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        
        if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
            alert('Start month must be before end month');
            return;
        }
        
        this.selectedCreditCardRange = { start, end };
        this.closeCreditCardRangeModal();
        
        // Update label
        const label = document.getElementById('credit-card-range-label');
        if (label) {
            label.textContent = this.getCreditCardRangeLabel();
        }
        
        // Re-render chart
        if (this.creditCardBillsChartInstance) {
            this.creditCardBillsChartInstance.destroy();
            this.creditCardBillsChartInstance = null;
        }
        this.renderCreditCardBillsChart();
    },
    
    /**
     * Reset credit card range to default (last 6 months)
     */
    resetCreditCardRange() {
        this.selectedCreditCardRange = null;
        this.closeCreditCardRangeModal();
        
        // Update label
        const label = document.getElementById('credit-card-range-label');
        if (label) {
            label.textContent = this.getCreditCardRangeLabel();
        }
        
        // Re-render chart
        if (this.creditCardBillsChartInstance) {
            this.creditCardBillsChartInstance.destroy();
            this.creditCardBillsChartInstance = null;
        }
        this.renderCreditCardBillsChart();
    },
    
    /**
     * Destroy all chart instances
     */
    destroyAllCharts() {
        if (this.incomeExpenseChartInstance) {
            try {
                this.incomeExpenseChartInstance.destroy();
                this.incomeExpenseChartInstance = null;
            } catch (e) {
                console.error('Error destroying income/expense chart:', e);
            }
        }
        if (this.categoryChartInstance) {
            try {
                this.categoryChartInstance.destroy();
                this.categoryChartInstance = null;
            } catch (e) {
                console.error('Error destroying category chart:', e);
            }
        }
        if (this.loansChartInstance) {
            try {
                this.loansChartInstance.destroy();
                this.loansChartInstance = null;
            } catch (e) {
                console.error('Error destroying loans chart:', e);
            }
        }
        if (this.creditCardBillsChartInstance) {
            try {
                this.creditCardBillsChartInstance.destroy();
                this.creditCardBillsChartInstance = null;
            } catch (e) {
                console.error('Error destroying credit card bills chart:', e);
            }
        }
        if (this.investmentChartInstance) {
            try {
                this.investmentChartInstance.destroy();
                this.investmentChartInstance = null;
            } catch (e) {
                console.error('Error destroying investment chart:', e);
            }
        }
    },
    
    /**
     * Get expenses data for last N months or custom range
     * Uses budget month if available, falls back to expense date
     */
    getExpensesData(monthsCount = 6) {
        const monthsData = [];
        const expenses = window.DB.expenses || [];
        
        // Use custom range if selected
        if (this.selectedMonthRange) {
            const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Get expenses for this month using budget month
                const monthExpenses = expenses.filter(exp => {
                    const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                    return expYear === currentYear && expMonth === currentMonth;
                });
                
                const totalWithLoans = monthExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
                
                // Filter out Loan EMI expenses to get withoutLoans total
                const totalWithoutLoans = monthExpenses
                    .filter(exp => exp.category !== 'Loan EMI')
                    .reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
                
                monthsData.push({
                    label: monthName,
                    withoutLoans: totalWithoutLoans,
                    withLoans: totalWithLoans
                });
                
                // Move to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
            
            return monthsData;
        }
        
        // Default: last N months
        const now = new Date();
        for (let i = monthsCount - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            
            // Get expenses for this month using budget month
            const monthExpenses = expenses.filter(exp => {
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                return expYear === year && expMonth === month;
            });
            
            const totalWithoutLoans = monthExpenses
                .filter(exp => exp.category !== 'Loan EMI')
                .reduce((sum, exp) => sum + exp.amount, 0);
                
            const totalWithLoans = monthExpenses
                .reduce((sum, exp) => sum + exp.amount, 0);
            
            monthsData.push({
                label: monthName,
                withoutLoans: totalWithoutLoans,
                withLoans: totalWithLoans
            });
        }
        
        return monthsData;
    },
    
    /**
     * Get income data for last N months or custom range
     * Uses actual salary data if available, fallback to estimated payslips
     * Respects pay schedule setting - shifts income by 1 month if 'last_week'
     */
    getIncomeData(monthsCount = 6) {
        const monthsData = [];
        
        const income = window.DB.income;
        const salaries = window.DB.salaries || [];
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        
        if (!income || !income.ctc) {
            return [];
        }
        
        // Generate payslips for all months (fallback)
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        /**
         * Helper function to get income for a specific expense month
         * If pay schedule is 'last_week', get previous month's income
         * Includes salary + additional income (bonus, freelance, etc.)
         */
        const getIncomeForMonth = (expenseYear, expenseMonth) => {
            let incomeYear, incomeMonth;
            
            if (paySchedule === 'last_week') {
                // Shift back by 1 month
                incomeMonth = expenseMonth === 1 ? 12 : expenseMonth - 1;
                incomeYear = expenseMonth === 1 ? expenseYear - 1 : expenseYear;
            } else {
                incomeMonth = expenseMonth;
                incomeYear = expenseYear;
            }
            
            // Get additional income for the month
            const additionalIncomeTotal = window.Income ? 
                window.Income.getAdditionalIncomeTotalForMonth(incomeMonth, incomeYear) : 0;
            
            // Try actual salary first
            const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
            if (actualSalary) {
                return actualSalary.amount + additionalIncomeTotal;
            }
            
            // Fallback to payslip + additional income
            const monthNamesLong = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const payslip = yearlyPayslips.find(p => p.month === monthNamesLong[incomeMonth - 1]);
            return (payslip ? payslip.totalNetPay : 0) + additionalIncomeTotal;
        };
        
        // Use custom range if selected
        if (this.selectedMonthRange) {
            const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });
                
                const incomeAmount = getIncomeForMonth(currentYear, currentMonth);
                
                monthsData.push({
                    label: shortMonth,
                    income: incomeAmount
                });
                
                // Move to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
            
            return monthsData;
        }
        
        // Default: last N months
        const now = new Date();
        for (let i = monthsCount - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });
            
            const incomeAmount = getIncomeForMonth(year, month);
            
            monthsData.push({
                label: shortMonth,
                income: incomeAmount
            });
        }
        
        return monthsData;
    },
    
    /**
     * Get active loans/EMIs data
     */
    getLoansData() {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const result = [];
        
        // Process loans
        loans.forEach(loan => {
            if (loan.status === 'active') {
                const remaining = loan.tenure - (loan.paidEmis || 0);
                if (remaining > 0) {
                    result.push({
                        name: loan.reason || loan.type,
                        remaining: remaining,
                        total: loan.tenure
                    });
                }
            }
        });
        
        // Process card EMIs
        cards.forEach(card => {
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (emi.status === 'active') {
                        const remaining = emi.totalEmis - emi.paidEmis;
                        if (remaining > 0) {
                            result.push({
                                name: `${card.nickname || card.name} - ${emi.reason}`,
                                remaining: remaining,
                                total: emi.totalEmis
                            });
                        }
                    }
                });
            }
        });
        
        return result;
    },
    
    /**
     * Initialize charts
     */
    initializeCharts() {
        // Check if Chart.js is loaded
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded');
            return;
        }
        
        try {
            this.renderIncomeExpenseChart();
            this.renderCategoryChart();
            this.renderLoansChart();
            this.renderCreditCardBillsChart();
            this.renderInvestmentsTrendChart();
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    },
    
    /**
     * Render Credit Card Bills Chart
     */
    renderCreditCardBillsChart() {
        const canvas = document.getElementById('credit-card-bills-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Get all paid bills
        let paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && b.paidAt);
        if (paidBills.length === 0) return;
        
        // Get credit cards (non-placeholder)
        const creditCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        
        // Determine month range
        let rangeMonths = [];
        if (this.selectedCreditCardRange) {
            // Custom range selected
            const [startYear, startMonth] = this.selectedCreditCardRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedCreditCardRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                rangeMonths.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
        } else {
            // Default: last 6 months
            const now = new Date();
            for (let i = 5; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                rangeMonths.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
            }
        }
        
        // Filter bills to only include those in the selected range
        paidBills = paidBills.filter(b => {
            const d = new Date(b.paidAt);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return rangeMonths.includes(monthKey);
        });
        
        // Use only the months in the range that have data OR all range months for a complete view
        const allMonths = rangeMonths;
        
        // Format labels (MMM YY)
        const labels = allMonths.map(d => {
            const [year, month] = d.split('-');
            const date = new Date(year, month - 1);
            return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        });
        
        let datasets = [];
        
        if (this.creditCardChartView === 'total') {
            // Total view: Single line showing sum of all cards
            const totalDataPoints = allMonths.map(monthKey => {
                const [year, month] = monthKey.split('-');
                const monthBills = paidBills.filter(b => {
                    const d = new Date(b.paidAt);
                    return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
                });
                return monthBills.reduce((sum, b) => sum + (parseFloat(b.paidAmount) || parseFloat(b.amount) || 0), 0);
            });
            
            datasets.push({
                label: 'Total Bills',
                data: totalDataPoints,
                borderColor: 'rgba(99, 102, 241, 1)',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            });
        } else {
            // Individual view: Separate lines per card
            // Group bills by card
            const cardBillsMap = {};
            creditCards.forEach(card => {
                const cardIdStr = String(card.id);
                cardBillsMap[cardIdStr] = {
                    name: card.name,
                    bills: paidBills.filter(b => String(b.cardId) === cardIdStr)
                        .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))
                };
            });
            
            // Card colors
            const cardColors = [
                { border: 'rgba(99, 102, 241, 1)', bg: 'rgba(99, 102, 241, 0.1)' },   // Indigo
                { border: 'rgba(236, 72, 153, 1)', bg: 'rgba(236, 72, 153, 0.1)' },   // Pink
                { border: 'rgba(34, 197, 94, 1)', bg: 'rgba(34, 197, 94, 0.1)' },     // Green
                { border: 'rgba(249, 115, 22, 1)', bg: 'rgba(249, 115, 22, 0.1)' },   // Orange
                { border: 'rgba(14, 165, 233, 1)', bg: 'rgba(14, 165, 233, 0.1)' },   // Sky
                { border: 'rgba(168, 85, 247, 1)', bg: 'rgba(168, 85, 247, 0.1)' },   // Purple
            ];
            
            let colorIndex = 0;
            
            Object.keys(cardBillsMap).forEach(cardId => {
                const cardData = cardBillsMap[cardId];
                if (cardData.bills.length === 0) return;
                
                const color = cardColors[colorIndex % cardColors.length];
                colorIndex++;
                
                // Create data points for each month
                const dataPoints = allMonths.map(monthKey => {
                    const [year, month] = monthKey.split('-');
                    const monthBills = cardData.bills.filter(b => {
                        const d = new Date(b.paidAt);
                        return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
                    });
                    // Sum all payments in that month
                    return monthBills.reduce((sum, b) => sum + (parseFloat(b.paidAmount) || parseFloat(b.amount) || 0), 0);
                });
                
                datasets.push({
                    label: cardData.name,
                    data: dataPoints,
                    borderColor: color.border,
                    backgroundColor: color.bg,
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color.border,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                });
            });
        }
        
        if (datasets.length === 0) return;
        
        this.creditCardBillsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: this.creditCardChartView !== 'total',
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            padding: 10,
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ₹${Utils.formatIndianNumber(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            font: { size: 10 },
                            stepSize: 5000,
                            callback: function(value) {
                                if (value >= 1000) {
                                    return '₹' + (value/1000) + 'k';
                                }
                                return '₹' + value;
                            }
                        }
                    }
                }
            }
        });
    },
    
    /**
     * Get budget month value
     */
    getBudgetMonthValue() {
        if (this.selectedBudgetMonth) {
            return this.selectedBudgetMonth;
        }
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    
    /**
     * Update budget month and re-render only budget cards
     */
    updateBudgetMonth() {
        const input = document.getElementById('budget-month-selector');
        if (input) {
            this.selectedBudgetMonth = input.value;
            // Re-render only the budget cards section
            const container = document.getElementById('budget-rule-container');
            if (container) {
                container.innerHTML = this.renderBudgetRuleContent();
            }
        }
    },
    
    /**
     * Render Needs/Wants/Investments cards
     */
    renderNeedsWantsInvestments() {
        return `
            <!-- Needs/Wants/Investments Cards -->
            <div id="budget-rule-container" class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                ${this.renderBudgetRuleContent()}
            </div>
        `;
    },
    
    /**
     * Render budget rule content (for initial and updates)
     */
    renderBudgetRuleContent() {
        const budgetMonth = this.getBudgetMonthValue();
        const [year, month] = budgetMonth.split('-').map(Number);
        
        // Get income for this month
        const incomeData = this.getIncomeForExpenseComparison(year, month);
        const netPay = incomeData.income || 0;
        
        // Calculate needs, wants, and investments
        const needs = this.getNeedsTotal(year, month);
        const wants = this.getWantsTotal(year, month);
        const investments = this.getMonthInvestments(budgetMonth);
        
        // Calculate percentages
        const hasIncome = netPay > 0;
        const needsPercent = hasIncome ? ((needs / netPay) * 100).toFixed(1) : 'N/A';
        const wantsPercent = hasIncome ? ((wants / netPay) * 100).toFixed(1) : 'N/A';
        const investPercent = hasIncome ? ((investments / netPay) * 100).toFixed(1) : 'N/A';
        
        // Get budget rule percentages (user configurable)
        const rule = this.budgetRule;
        const needsIdeal = rule.needs;
        const wantsIdeal = rule.wants;
        const investIdeal = rule.invest;
        
        // Calculate differences from ideal
        const needsDiff = hasIncome ? (parseFloat(needsPercent) - needsIdeal).toFixed(1) : 0;
        const wantsDiff = hasIncome ? (parseFloat(wantsPercent) - wantsIdeal).toFixed(1) : 0;
        const investDiff = hasIncome ? (parseFloat(investPercent) - investIdeal).toFixed(1) : 0;
        
        // Status indicators with difference
        const needsOk = hasIncome && parseFloat(needsPercent) <= needsIdeal;
        const wantsOk = hasIncome && parseFloat(wantsPercent) <= wantsIdeal;
        const investOk = hasIncome && parseFloat(investPercent) >= investIdeal;
        
        const needsStatus = hasIncome ? (needsOk ? '✓' : `+${needsDiff}%`) : '';
        const wantsStatus = hasIncome ? (wantsOk ? '✓' : `+${wantsDiff}%`) : '';
        const investStatus = hasIncome ? (investOk ? '✓' : `${investDiff}%`) : '';
        
        // Budget rule title
        const ruleTitle = `${needsIdeal}/${wantsIdeal}/${investIdeal} Budget Rule`;
        
        return `
                <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-2">
                        <h3 class="text-sm font-semibold text-gray-700">${ruleTitle}</h3>
                        <button onclick="Dashboard.openCategoryConfigModal()" class="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors" title="Configure categories & rule">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="relative">
                        <input type="month" id="budget-month-selector" value="${budgetMonth}" onchange="Dashboard.updateBudgetMonth()" class="absolute opacity-0 pointer-events-none" />
                        <button id="budget-month-button" onclick="document.getElementById('budget-month-selector').showPicker()" class="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(budgetMonth)} ▼
                        </button>
                    </div>
                </div>
                
                <div class="grid grid-cols-3 gap-3 max-w-full">
                    <!-- Needs Card -->
                    <div onclick="Dashboard.showBudgetBreakdown('needs')" class="bg-gradient-to-br from-gray-600 to-gray-700 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                        <div class="flex items-center justify-between mb-1">
                            <div class="text-xs font-medium">Needs</div>
                            ${hasIncome 
                                ? (needsOk 
                                    ? `<span class="text-[9px] bg-green-500 px-1.5 py-0.5 rounded font-semibold">≤${needsIdeal}%</span>`
                                    : `<span class="text-[9px] bg-red-600 px-1.5 py-0.5 rounded font-semibold">&gt;${needsIdeal}%</span>`)
                                : ''
                            }
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncome 
                                ? `<div class="text-3xl font-bold">${needsPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(needs))}</div>
                            <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                        </div>
                    </div>
                    
                    <!-- Wants Card -->
                    <div onclick="Dashboard.showBudgetBreakdown('wants')" class="bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                        <div class="flex items-center justify-between mb-1">
                            <div class="text-xs font-medium">Wants</div>
                            ${hasIncome 
                                ? (wantsOk 
                                    ? `<span class="text-[9px] bg-green-500 px-1.5 py-0.5 rounded font-semibold">≤${wantsIdeal}%</span>`
                                    : `<span class="text-[9px] bg-red-600 px-1.5 py-0.5 rounded font-semibold">&gt;${wantsIdeal}%</span>`)
                                : ''
                            }
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncome 
                                ? `<div class="text-3xl font-bold">${wantsPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(wants))}</div>
                            <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                        </div>
                    </div>
                    
                    <!-- Investments Card -->
                    <div onclick="Dashboard.showBudgetBreakdown('investments')" class="bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                        <div class="flex items-center justify-between mb-1">
                            <div class="text-xs font-medium">Invest</div>
                            ${hasIncome 
                                ? (investOk 
                                    ? `<span class="text-[9px] bg-green-500 px-1.5 py-0.5 rounded font-semibold">≥${investIdeal}%</span>`
                                    : `<span class="text-[9px] bg-red-600 px-1.5 py-0.5 rounded font-semibold">&lt;${investIdeal}%</span>`)
                                : ''
                            }
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncome 
                                ? `<div class="text-3xl font-bold">${investPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(investments))}</div>
                            <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Open category configuration modal
     */
    openCategoryConfigModal() {
        // Get all expense categories
        const allCategories = window.ExpenseCategories ? window.ExpenseCategories.getAll().map(c => c.name) : [
            'Bills & Utilities', 'Groceries', 'Healthcare', 'Transportation',
            'EMI', 'Loan EMI', 'Credit Card EMI', 'Rent', 'Insurance',
            'Education', 'Personal & Family', 'Entertainment', 'Food & Dining',
            'Shopping', 'Travel', 'Subscriptions', 'Gifts', 'Hobbies', 'Other'
        ];
        
        // Get current config
        const currentNeeds = this.needsCategories;
        const currentWants = this.wantsCategories;
        const rule = this.budgetRule;
        
        // Create or update modal
        let modal = document.getElementById('category-config-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'category-config-modal';
            document.body.appendChild(modal);
        }
        
        const categoriesHtml = allCategories.map(cat => {
            const isNeeds = currentNeeds.some(c => c.toLowerCase() === cat.toLowerCase());
            const isWants = currentWants.some(c => c.toLowerCase() === cat.toLowerCase());
            const currentType = isNeeds ? 'needs' : (isWants ? 'wants' : 'none');
            
            return `
                <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span class="text-sm text-gray-700 flex-1">${cat}</span>
                    <div class="flex gap-1">
                        <button onclick="Dashboard.setCategoryType('${cat.replace(/'/g, "\\'")}', 'needs', this)" 
                                class="px-2 py-1 text-xs rounded-lg transition-all ${currentType === 'needs' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-amber-100'}">
                            Needs
                        </button>
                        <button onclick="Dashboard.setCategoryType('${cat.replace(/'/g, "\\'")}', 'wants', this)" 
                                class="px-2 py-1 text-xs rounded-lg transition-all ${currentType === 'wants' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-pink-100'}">
                            Wants
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) this.closeCategoryConfigModal(); };
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col">
                <div class="p-4 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-gray-800">Budget Rule Settings</h3>
                            <p class="text-xs text-gray-500">Configure percentages and category assignments</p>
                        </div>
                        <button onclick="Dashboard.closeCategoryConfigModal()" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg">×</button>
                    </div>
                </div>
                
                <!-- Budget Rule Percentages -->
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-pink-50">
                    <h4 class="text-sm font-semibold text-gray-700 mb-3">Budget Rule Percentages</h4>
                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="text-xs text-amber-700 font-medium">Needs ≤</label>
                            <div class="flex items-center mt-1">
                                <input type="number" id="rule-needs" value="${rule.needs}" min="0" max="100" 
                                       class="w-full p-2 border border-amber-300 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none">
                                <span class="ml-1 text-sm text-gray-500">%</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-pink-700 font-medium">Wants ≤</label>
                            <div class="flex items-center mt-1">
                                <input type="number" id="rule-wants" value="${rule.wants}" min="0" max="100" 
                                       class="w-full p-2 border border-pink-300 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none">
                                <span class="ml-1 text-sm text-gray-500">%</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-emerald-700 font-medium">Invest ≥</label>
                            <div class="flex items-center mt-1">
                                <input type="number" id="rule-invest" value="${rule.invest}" min="0" max="100" 
                                       class="w-full p-2 border border-emerald-300 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                                <span class="ml-1 text-sm text-gray-500">%</span>
                            </div>
                        </div>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2 text-center">Default: 50/30/20 • Total should ideally be 100%</p>
                </div>
                
                <!-- Loan EMI Toggle -->
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-semibold text-gray-700">Include Loan EMIs</h4>
                            <p class="text-[10px] text-gray-500 mt-0.5">Include home/car/personal loan EMIs in budget calculation</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="include-loan-emis" class="sr-only peer" ${this.includeLoanEmis ? 'checked' : ''} onchange="Dashboard.toggleLoanEmis(this.checked)">
                            <div class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                    <p class="text-[10px] text-amber-600 mt-2">💡 Credit card EMIs are always included. Only loan EMIs can be excluded.</p>
                </div>
                
                <!-- Category Assignments -->
                <div class="p-4 border-b border-gray-200">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">Category Assignments</h4>
                </div>
                <div class="flex-1 overflow-y-auto px-4 pb-4" id="category-config-list">
                    ${categoriesHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex gap-3">
                        <button onclick="Dashboard.resetCategoryConfig()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors text-sm">
                            Reset All
                        </button>
                        <button onclick="Dashboard.saveBudgetConfig()" class="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg transition-all text-sm">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close category config modal
     */
    closeCategoryConfigModal() {
        const modal = document.getElementById('category-config-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Refresh budget cards
        const container = document.getElementById('budget-rule-container');
        if (container) {
            container.innerHTML = this.renderBudgetRuleContent();
        }
    },
    
    /**
     * Set category type (needs/wants)
     */
    setCategoryType(category, type, buttonEl) {
        // Initialize config if not exists
        if (!window.DB.budgetCategoryConfig) {
            window.DB.budgetCategoryConfig = {
                needs: [...this.defaultNeedsCategories],
                wants: [...this.defaultWantsCategories]
            };
        }
        
        const config = window.DB.budgetCategoryConfig;
        
        // Remove from both arrays first
        config.needs = config.needs.filter(c => c.toLowerCase() !== category.toLowerCase());
        config.wants = config.wants.filter(c => c.toLowerCase() !== category.toLowerCase());
        
        // Add to the selected type
        if (type === 'needs') {
            config.needs.push(category);
        } else if (type === 'wants') {
            config.wants.push(category);
        }
        
        // Save to storage
        window.Storage.save();
        
        // Update button styles in the row
        const row = buttonEl.parentElement;
        const needsBtn = row.querySelector('button:first-child');
        const wantsBtn = row.querySelector('button:last-child');
        
        // Reset both buttons
        needsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-gray-100 text-gray-600 hover:bg-amber-100';
        wantsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-gray-100 text-gray-600 hover:bg-pink-100';
        
        // Highlight selected
        if (type === 'needs') {
            needsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-amber-500 text-white';
        } else if (type === 'wants') {
            wantsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-pink-500 text-white';
        }
    },
    
    /**
     * Toggle loan EMI inclusion in budget calculation
     */
    toggleLoanEmis(include) {
        window.DB.budgetIncludeLoanEmis = include;
        window.Storage.save();
        
        if (window.Utils) {
            Utils.showSuccess(include ? 'Loan EMIs included in budget' : 'Loan EMIs excluded from budget');
        }
    },
    
    /**
     * Save budget config (rule percentages)
     */
    saveBudgetConfig() {
        const needsInput = document.getElementById('rule-needs');
        const wantsInput = document.getElementById('rule-wants');
        const investInput = document.getElementById('rule-invest');
        
        if (needsInput && wantsInput && investInput) {
            const needs = parseInt(needsInput.value) || 50;
            const wants = parseInt(wantsInput.value) || 30;
            const invest = parseInt(investInput.value) || 20;
            
            window.DB.budgetRuleConfig = { needs, wants, invest };
            window.Storage.save();
            
            if (window.Utils) {
                Utils.showSuccess(`Budget rule updated to ${needs}/${wants}/${invest}`);
            }
        }
        
        this.closeCategoryConfigModal();
    },
    
    /**
     * Reset category config to defaults
     */
    resetCategoryConfig() {
        window.DB.budgetCategoryConfig = {
            needs: [...this.defaultNeedsCategories],
            wants: [...this.defaultWantsCategories]
        };
        window.DB.budgetRuleConfig = { ...this.defaultBudgetRule };
        window.DB.budgetIncludeLoanEmis = false; // Default: exclude loan EMIs
        window.Storage.save();
        
        // Refresh the modal
        this.openCategoryConfigModal();
        
        if (window.Utils) {
            Utils.showSuccess('Budget settings reset to defaults');
        }
    },
    
    /**
     * Show budget breakdown modal
     */
    showBudgetBreakdown(type) {
        const budgetMonth = this.getBudgetMonthValue();
        const [year, month] = budgetMonth.split('-').map(Number);
        
        let items = [];
        let title = '';
        let color = '';
        let total = 0;
        
        if (type === 'needs') {
            items = this.getNeedsItems(year, month);
            title = '🏠 Needs (Essential)';
            color = 'amber';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'wants') {
            items = this.getWantsItems(year, month);
            title = '🎯 Wants (Lifestyle)';
            color = 'pink';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'investments') {
            items = this.getInvestmentItems(year, month);
            title = '📈 Investments';
            color = 'emerald';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        }
        
        // Create or update modal
        let modal = document.getElementById('budget-breakdown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'budget-breakdown-modal';
            document.body.appendChild(modal);
        }
        
        const monthLabel = this.getFormattedMonth(budgetMonth);
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        const itemsHtml = items.length > 0 
            ? items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('')
            : `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${title}</h3>
                            <p class="text-xs text-white/80">${monthLabel}</p>
                        </div>
                        <button onclick="document.getElementById('budget-breakdown-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${items.length} items)</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Show monthly breakdown list (for Monthly Breakdown cards)
     */
    showMonthlyBreakdownList(type) {
        const filterMonth = this.getFilterMonthValue();
        
        let items = [];
        let title = '';
        let color = '';
        let total = 0;
        
        if (type === 'expenses') {
            items = this.getMonthExpenseItems(filterMonth);
            title = '💸 Monthly Expenses';
            color = 'red';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'investments') {
            items = this.getMonthInvestmentItems(filterMonth);
            title = '📈 Monthly Investments';
            color = 'amber';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        }
        
        // Create or update modal
        let modal = document.getElementById('monthly-breakdown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'monthly-breakdown-modal';
            document.body.appendChild(modal);
        }
        
        const monthLabel = this.getFormattedMonth(filterMonth);
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        const itemsHtml = items.length > 0 
            ? items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('')
            : `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${title}</h3>
                            <p class="text-xs text-white/80">${monthLabel}</p>
                        </div>
                        <button onclick="document.getElementById('monthly-breakdown-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${items.length} items)</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Get "Needs" expense items for a month
     * Optionally excludes loan EMIs based on setting
     * Uses budget month if available, falls back to expense date
     */
    getNeedsItems(year, month) {
        const expenses = window.DB.expenses || [];
        const includeLoanEmis = this.includeLoanEmis;
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                const category = exp.category || 'Other';
                
                // Check if this is a Needs category
                if (!this.needsCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
                    return false;
                }
                
                // If loan EMIs are excluded, filter out expenses that are loan EMIs
                if (!includeLoanEmis && (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi')) {
                    // Check if this expense matches any loan in the database
                    if (this.isLoanEmi(exp)) {
                        return false; // Exclude loan EMIs
                    }
                }
                
                return true;
            })
            .map(exp => ({
                title: exp.title,
                category: exp.category || 'Other',
                amount: parseFloat(exp.amount) || 0,
                date: new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sortDate: new Date(exp.date).getTime()
            }))
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Get "Wants" expense items for a month
     * Uses budget month if available, falls back to expense date
     */
    getWantsItems(year, month) {
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                const category = exp.category || 'Other';
                return this.wantsCategories.some(c => c.toLowerCase() === category.toLowerCase());
            })
            .map(exp => ({
                title: exp.title,
                category: exp.category || 'Other',
                amount: parseFloat(exp.amount) || 0,
                date: new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sortDate: new Date(exp.date).getTime()
            }))
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Get investment items for a month
     * Uses incomeMonth/incomeYear if available for proper income attribution
     */
    getInvestmentItems(year, month) {
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const exchangeRate = typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : 83;
        
        return monthlyInvestments
            .filter(inv => {
                // Use incomeMonth/incomeYear if available
                if (inv.incomeMonth && inv.incomeYear) {
                    return inv.incomeYear === year && inv.incomeMonth === month;
                }
                // Fallback: use investment date (backward compatibility)
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && (invDate.getMonth() + 1) === month;
            })
            .map(inv => {
                let amount = 0;
                if (inv.type === 'SHARES') {
                    amount = inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                } else if (inv.type === 'GOLD') {
                    amount = inv.price * inv.quantity;
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    amount = inv.amount || 0;
                }
                
                return {
                    title: inv.name || inv.type,
                    category: inv.type,
                    amount: amount,
                    date: new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                    sortDate: new Date(inv.date).getTime()
                };
            })
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Check if an expense is a loan EMI (matches any loan in database)
     */
    isLoanEmi(expense) {
        const loans = window.DB.loans || [];
        const expenseTitle = (expense.title || '').toLowerCase();
        
        // Check if the expense title matches any loan's EMI pattern
        for (const loan of loans) {
            const loanEmiTitle = `${loan.bankName} ${loan.loanType || 'Loan'} EMI`.toLowerCase();
            if (expenseTitle === loanEmiTitle || expenseTitle.includes(loan.bankName.toLowerCase())) {
                return true;
            }
        }
        
        return false;
    },
    
    /**
     * Get total "Needs" expenses for a month
     * Optionally excludes loan EMIs based on setting
     */
    getNeedsTotal(year, month) {
        const expenses = window.DB.expenses || [];
        const includeLoanEmis = this.includeLoanEmis;
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                const category = exp.category || 'Other';
                
                // Check if this is a Needs category
                if (!this.needsCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
                    return false;
                }
                
                // If loan EMIs are excluded, filter out expenses that are loan EMIs
                if (!includeLoanEmis && (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi')) {
                    // Check if this expense matches any loan in the database
                    if (this.isLoanEmi(exp)) {
                        return false; // Exclude loan EMIs
                    }
                }
                
                return true;
            })
            .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    },
    
    /**
     * Get total "Wants" expenses for a month
     * Uses budget month if available, falls back to expense date
     */
    getWantsTotal(year, month) {
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                const category = exp.category || 'Other';
                return this.wantsCategories.some(c => c.toLowerCase() === category.toLowerCase());
            })
            .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    },
    
    /**
     * Get investment range label
     */
    getInvestmentRangeLabel() {
        if (!this.selectedInvestmentRange) {
            return 'Last 6 months';
        }
        const start = this.getFormattedMonth(this.selectedInvestmentRange.start);
        const end = this.getFormattedMonth(this.selectedInvestmentRange.end);
        return `${start} - ${end}`;
    },
    
    /**
     * Open investment range modal
     */
    openInvestmentRangeModal() {
        const modal = document.getElementById('investment-range-modal');
        if (modal) {
            const now = new Date();
            const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (this.selectedInvestmentRange) {
                document.getElementById('investment-range-start').value = this.selectedInvestmentRange.start;
                document.getElementById('investment-range-end').value = this.selectedInvestmentRange.end;
            } else {
                document.getElementById('investment-range-start').value = startMonth;
                document.getElementById('investment-range-end').value = endMonth;
            }
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close investment range modal
     */
    closeInvestmentRangeModal() {
        const modal = document.getElementById('investment-range-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Apply investment range selection
     */
    applyInvestmentRange() {
        const start = document.getElementById('investment-range-start').value;
        const end = document.getElementById('investment-range-end').value;
        
        if (!start || !end) {
            alert('Please select both start and end months');
            return;
        }
        
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        
        if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
            alert('Start month must be before or equal to end month');
            return;
        }
        
        const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        if (months > 24) {
            alert('Maximum range is 24 months');
            return;
        }
        
        this.selectedInvestmentRange = { start, end };
        this.closeInvestmentRangeModal();
        
        // Update label
        const label = document.getElementById('investment-range-label');
        if (label) {
            label.textContent = this.getInvestmentRangeLabel();
        }
        
        // Re-render chart
        this.renderInvestmentsTrendChart();
    },
    
    /**
     * Reset investment range to default
     */
    resetInvestmentRange() {
        this.selectedInvestmentRange = null;
        this.closeInvestmentRangeModal();
        
        // Update label
        const label = document.getElementById('investment-range-label');
        if (label) {
            label.textContent = 'Last 6 months';
        }
        
        // Re-render chart
        this.renderInvestmentsTrendChart();
    },
    
    /**
     * Get monthly investments data for chart (last N months or custom range)
     * Uses incomeMonth/incomeYear if available for proper income attribution
     */
    getInvestmentsDataForChart(monthsCount = 6) {
        const monthsData = [];
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const goldRate = window.DB.goldRatePerGram || 7000;
        const exchangeRate = typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : 83;
        
        /**
         * Helper to filter investments by income month (or fall back to investment date)
         */
        const filterByIncomeMonth = (inv, targetYear, targetMonth) => {
            // Use incomeMonth/incomeYear if available
            if (inv.incomeMonth && inv.incomeYear) {
                return inv.incomeYear === targetYear && inv.incomeMonth === targetMonth;
            }
            // Fallback: use investment date (backward compatibility)
            const invDate = new Date(inv.date);
            return invDate.getFullYear() === targetYear && invDate.getMonth() + 1 === targetMonth;
        };
        
        // Use investment-specific range if selected
        if (this.selectedInvestmentRange) {
            const [startYear, startMonth] = this.selectedInvestmentRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedInvestmentRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Get investments for this month using income attribution
                const monthInvs = monthlyInvestments.filter(inv => 
                    filterByIncomeMonth(inv, currentYear, currentMonth)
                );
                
                // Calculate totals by type
                let shares = 0, gold = 0, epfFd = 0;
                monthInvs.forEach(inv => {
                    if (inv.type === 'SHARES') {
                        shares += inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                    } else if (inv.type === 'GOLD') {
                        gold += inv.price * inv.quantity;
                    } else if (inv.type === 'EPF' || inv.type === 'FD') {
                        epfFd += inv.amount || 0;
                    }
                });
                
                monthsData.push({
                    label: monthName,
                    shares: shares,
                    gold: gold,
                    epfFd: epfFd,
                    total: shares + gold + epfFd
                });
                
                // Move to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
            
            return monthsData;
        }
        
        // Default: last N months
        const now = new Date();
        for (let i = monthsCount - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            
            // Get investments for this month using income attribution
            const monthInvs = monthlyInvestments.filter(inv => 
                filterByIncomeMonth(inv, year, month)
            );
            
            // Calculate totals by type
            let shares = 0, gold = 0, epfFd = 0;
            monthInvs.forEach(inv => {
                if (inv.type === 'SHARES') {
                    shares += inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                } else if (inv.type === 'GOLD') {
                    gold += inv.price * inv.quantity;
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    epfFd += inv.amount || 0;
                }
            });
            
            monthsData.push({
                label: monthName,
                shares: shares,
                gold: gold,
                epfFd: epfFd,
                total: shares + gold + epfFd
            });
        }
        
        return monthsData;
    },
    
    /**
     * Render Investments Trend Chart
     */
    renderInvestmentsTrendChart() {
        const canvas = document.getElementById('investments-trend-chart');
        if (!canvas) {
            console.warn('Investments trend chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from investments trend chart canvas');
            return;
        }
        
        // Use investment-specific range or default 6 months
        let monthsCount = 6;
        if (this.selectedInvestmentRange) {
            const [startYear, startMonth] = this.selectedInvestmentRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedInvestmentRange.end.split('-').map(Number);
            monthsCount = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        }
        
        const data = this.getInvestmentsDataForChart(monthsCount);
        
        // Destroy existing chart
        if (this.investmentChartInstance) {
            try {
                this.investmentChartInstance.destroy();
                this.investmentChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing investment chart:', e);
            }
        }
        
        // Build datasets based on view mode
        let datasets = [];
        const isTotal = this.investmentsChartView === 'total';
        
        if (isTotal) {
            // Total view: Only show total line with filled area
            datasets = [{
                label: 'Total',
                data: data.map(d => d.total),
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }];
        } else {
            // Category view: Show individual categories
            datasets = [
                {
                    label: 'Shares',
                    data: data.map(d => d.shares),
                    borderColor: 'rgba(99, 102, 241, 1)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                },
                {
                    label: 'Gold',
                    data: data.map(d => d.gold),
                    borderColor: 'rgba(251, 191, 36, 1)',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: 'rgba(251, 191, 36, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                },
                {
                    label: 'EPF/FD',
                    data: data.map(d => d.epfFd),
                    borderColor: 'rgba(236, 72, 153, 1)',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: 'rgba(236, 72, 153, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                }
            ];
        }
        
        this.investmentChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: !isTotal,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 12,
                            font: { size: 11 }
                        }
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return label + ': ₹' + value.toLocaleString('en-IN');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            font: { size: 11 },
                            callback: function(value) {
                                if (value >= 100000) {
                                    return '₹' + (value / 100000).toFixed(1) + 'L';
                                } else if (value >= 1000) {
                                    return '₹' + (value / 1000).toFixed(0) + 'k';
                                }
                                return '₹' + value;
                            }
                        }
                    }
                }
            }
        });
    },
    
    /**
     * Render income vs expense chart
     */
    renderIncomeExpenseChart() {
        const canvas = document.getElementById('income-expense-chart');
        if (!canvas) {
            console.warn('Income/Expense chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from income/expense chart canvas');
            return;
        }
        
        // Get number of months
        const monthsInput = document.getElementById('months-selector');
        const monthsCount = monthsInput ? parseInt(monthsInput.value) || 6 : 6;
        
        const expensesData = this.getExpensesData(monthsCount);
        const incomeData = this.getIncomeData(monthsCount);
        
        // Destroy existing chart
        if (this.incomeExpenseChartInstance) {
            try {
                this.incomeExpenseChartInstance.destroy();
                this.incomeExpenseChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing income/expense chart:', e);
            }
        }
        
        this.incomeExpenseChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: expensesData.map(d => d.label),
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData.map(d => d.income),
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        pointHoverBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    },
                    {
                        label: 'Expenses',
                        data: expensesData.map(d => d.withLoans),
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: 'rgba(239, 68, 68, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        pointHoverBackgroundColor: 'rgba(239, 68, 68, 1)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 15,
                            font: {
                                size: 12,
                                weight: 'normal'
                            }
                        }
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: {
                            size: 13,
                            weight: 'normal'
                        },
                        bodyFont: {
                            size: 12,
                            weight: 'normal'
                        },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                // Use Indian number format
                                const formatted = value.toLocaleString('en-IN');
                                return label + ': ₹' + formatted;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 11
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + (value >= 100000 ? (value/100000).toFixed(1) + 'L' : (value >= 1000 ? (value/1000).toFixed(0) + 'k' : value));
                            },
                            stepSize: 50000,
                            font: {
                                size: 11
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)',
                            drawBorder: false
                        }
                    }
                }
            }
        });
    },
    
    /**
     * Render loans progress chart
     */
    renderLoansChart() {
        const canvas = document.getElementById('loans-chart');
        if (!canvas) {
            // This is normal if there are no active loans
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from loans chart canvas');
            return;
        }
        
        const data = this.getLoansData();
        
        if (data.length === 0) return;
        
        // Destroy existing chart
        if (this.loansChartInstance) {
            try {
                this.loansChartInstance.destroy();
                this.loansChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing loans chart:', e);
            }
        }
        
        this.loansChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.name),
                datasets: [{
                    label: 'Remaining Months',
                    data: data.map(d => d.remaining),
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bars
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const months = context.parsed.x;
                                return 'Remaining: ' + months + ' month' + (months !== 1 ? 's' : '');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Months Remaining'
                        }
                    }
                }
            }
        });
    },
    
    /**
     * Get current month value for calendar picker (YYYY-MM format)
     */
    getCurrentMonthValue() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    
    /**
     * Get category-wise expenses for selected month
     * Uses budget month if available, falls back to expense date
     */
    getCategoryData(includeExcluded = false) {
        const selector = document.getElementById('category-month-selector');
        if (!selector) return [];
        
        const [year, month] = selector.value.split('-').map(Number);
        
        // Get all expenses for the selected month using budget month
        const expenses = window.DB.expenses.filter(exp => {
            const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
            return expYear === year && expMonth === month;
        });
        
        // Get all recurring expenses for the selected month
        const recurringExpenses = window.DB.recurringExpenses.filter(rec => {
            const scheduleDay = rec.dayOfMonth;
            const expDate = new Date(year, month - 1, scheduleDay);
            return expDate <= new Date();
        });
        
        // Group by category
        const categoryMap = {};
        
        expenses.forEach(exp => {
            const category = exp.category || 'Uncategorized';
            categoryMap[category] = (categoryMap[category] || 0) + exp.amount;
        });
        
        recurringExpenses.forEach(rec => {
            const category = rec.category || 'Uncategorized';
            categoryMap[category] = (categoryMap[category] || 0) + rec.amount;
        });
        
        // Convert to array, format category names properly, filter excluded, and sort by amount
        this.initExcludedCategories();
        return Object.entries(categoryMap)
            .map(([category, amount]) => ({ 
                category: this.formatCategoryName(category), 
                amount 
            }))
            .filter(item => includeExcluded || !this.excludedCategories.has(item.category))
            .sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Format category name for display (capitalize first letter, handle special cases)
     */
    formatCategoryName(category) {
        if (!category) return 'Uncategorized';
        
        // Special cases
        if (category.toLowerCase() === 'emi') return 'EMI';
        
        // Use ExpenseCategories if available
        if (window.ExpenseCategories) {
            const cat = window.ExpenseCategories.getByName(category);
            if (cat) return cat.name;
        }
        
        // Capitalize first letter as fallback
        return category.charAt(0).toUpperCase() + category.slice(1);
    },
    
    /**
     * Render category expenses chart
     */
    renderCategoryChart() {
        const canvas = document.getElementById('category-chart');
        if (!canvas) {
            console.warn('Category chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from category chart canvas');
            return;
        }
        
        // Get only non-excluded categories for the chart
        const data = this.getCategoryData(false);
        
        // Destroy existing chart
        if (this.categoryChartInstance) {
            try {
                this.categoryChartInstance.destroy();
                this.categoryChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing category chart:', e);
            }
        }
        
        // Color palette for categories
        const colors = [
            'rgba(147, 51, 234, 0.85)', // Purple
            'rgba(239, 68, 68, 0.85)',  // Red
            'rgba(34, 197, 94, 0.85)',  // Green
            'rgba(59, 130, 246, 0.85)', // Blue
            'rgba(251, 146, 60, 0.85)', // Orange
            'rgba(236, 72, 153, 0.85)', // Pink
            'rgba(14, 165, 233, 0.85)', // Cyan
            'rgba(168, 85, 247, 0.85)', // Violet
            'rgba(234, 179, 8, 0.85)',  // Yellow
            'rgba(132, 204, 22, 0.85)'  // Lime
        ];
        
        // If no visible categories, still show the legend so users can re-enable categories
        if (data.length === 0) {
            // Clear chart
            this.categoryChartInstance = null;
            
            // Still generate the legend with all categories (so user can click to re-enable)
            this.generateCategoryLegend(data, colors);
            
            return;
        }
        
        this.categoryChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.map(d => d.category),
                datasets: [{
                    label: 'Amount',
                    data: data.map(d => d.amount),
                    backgroundColor: data.map((_, i) => colors[i % colors.length]),
                    borderColor: '#ffffff',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    animateRotate: true,
                    animateScale: true
                },
                plugins: {
                    legend: {
                        display: false  // Using custom HTML legend instead
                    },
                    datalabels: {
                        formatter: function(value, context) {
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return percentage > 5 ? percentage + '%' : ''; // Only show if > 5%
                        },
                        font: {
                            size: 11,
                            weight: 'bold'
                        },
                        color: '#ffffff'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                // Use Indian number format
                                const formatted = value.toLocaleString('en-IN');
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return label + ': ₹' + formatted + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
        
        // Generate HTML legend with gray percentages (shows all categories including excluded)
        this.generateCategoryLegend(data, colors);
    },
    
    /**
     * Generate HTML legend for category chart with gray percentages and click toggle
     */
    generateCategoryLegend(visibleData, colors) {
        const legendContainer = document.getElementById('category-chart-legend');
        if (!legendContainer) return;
        
        // Get all categories (including excluded ones)
        const allData = this.getCategoryData(true);
        
        // Calculate total from only visible (non-excluded) categories
        const visibleTotal = allData
            .filter(item => !this.excludedCategories.has(item.category))
            .reduce((sum, d) => sum + d.amount, 0);
        
        // Build a map of visible categories to their chart color index
        // This ensures legend colors match chart colors exactly
        const visibleCategories = allData.filter(item => !this.excludedCategories.has(item.category));
        const categoryColorMap = {};
        visibleCategories.forEach((item, idx) => {
            categoryColorMap[item.category] = colors[idx % colors.length];
        });
        
        let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
        
        // Show message if no categories are visible
        if (visibleTotal === 0 && allData.length > 0) {
            html += `
                <div style="color: #9ca3af; font-size: 10px; font-style: italic; margin-bottom: 6px; text-align: center;">
                    Click on a category below to show it
                </div>
            `;
        }
        
        allData.forEach((item, i) => {
            const isExcluded = this.excludedCategories.has(item.category);
            
            // Calculate percentage relative to visible categories only
            const percentage = visibleTotal > 0 && !isExcluded 
                ? ((item.amount / visibleTotal) * 100).toFixed(1)
                : '0.0';
            
            // Use the color from chart for visible categories, or a gray color for excluded ones
            const color = isExcluded 
                ? 'rgba(156, 163, 175, 0.5)' // Gray for excluded categories
                : categoryColorMap[item.category];
            
            html += `
                <div onclick="Dashboard.toggleCategoryExclusion('${item.category.replace(/'/g, "\\'")}')" 
                     style="display: flex; align-items: center; gap: 6px; font-size: 10px; cursor: pointer; user-select: none; padding: 2px 4px; border-radius: 4px; transition: background-color 0.2s;"
                     onmouseover="this.style.backgroundColor='rgba(0,0,0,0.05)'"
                     onmouseout="this.style.backgroundColor='transparent'"
                     title="Click to ${isExcluded ? 'include' : 'exclude'} from chart">
                    <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; flex-shrink: 0;"></div>
                    <span style="color: #374151; font-weight: 500; ${isExcluded ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${item.category}</span>
                    <span style="color: #9ca3af; font-weight: normal; ${isExcluded ? 'text-decoration: line-through; opacity: 0.5;' : ''}">(${percentage}%)</span>
                </div>
            `;
        });
        html += '</div>';
        
        legendContainer.innerHTML = html;
    },
    
    /**
     * Get minimum net pay across all 12 months of payslips
     */
    getMinimumNetPay() {
        const income = window.DB.income;
        
        if (!income || !income.ctc) {
            return 0;
        }
        
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        if (yearlyPayslips.length === 0) {
            return 0;
        }
        
        const minNetPay = Math.min(...yearlyPayslips.map(p => p.totalNetPay));
        return minNetPay;
    },
    
    /**
     * Get total recurring expenses for current month (excluding Loan EMI and Credit Card EMI)
     */
    getTotalRecurringExpenses() {
        
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        if (!window.RecurringExpenses) {
            return 0;
        }
        
        // Get all recurring expenses due this month using the same logic as Recurring page
        const allRecurring = window.RecurringExpenses.getAll();
        
        let total = 0;
        let excludedTotal = 0;
        
        allRecurring.forEach((recurring, i) => {
            
            // Skip inactive
            if (recurring.isActive === false) {
                return;
            }
            
            // Skip if end date is before this month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(currentYear, currentMonth - 1, 1);
                if (checkDate > endDate) {
                    return;
                }
            }
            
            // Check if due in this month (reusing RecurringExpenses.isDueInMonth)
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, currentYear, currentMonth);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category === 'Loan EMI' || category === 'Credit Card EMI') {
                    excludedTotal += recurring.amount;
                } else {
                    total += recurring.amount;
                }
            }
        });
        
        return total;
    },
    
    /**
     * Get total EMIs for current month (loans + credit cards)
     * Shows all EMIs scheduled for this month, regardless of the day
     */
    getTotalEmis() {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11
        let total = 0;
        
        // Add active loan EMIs
        loans.forEach((loan, i) => {
            
            // Check if loan has started before or during this month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const currentMonthStart = new Date(currentYear, currentMonth, 1);
            
            if (firstEmiMonth > currentMonthStart) {
                return;
            }
            
            // Calculate remaining EMIs and EMI amount
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                // Calculate EMI amount if not stored
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    total += parseFloat(emiAmount);
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach((card, i) => {
            // Skip debit cards
            if (card.cardType === 'debit') {
                return;
            }
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach((emi, j) => {
                    
                    // Check if EMI has started before or during this month
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const currentMonthStart = new Date(currentYear, currentMonth, 1);
                        
                        if (emiFirstMonth > currentMonthStart) {
                            return;
                        }
                    }
                    
                    // Check if completed (using correct field names)
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        total += parseFloat(emi.emiAmount);
                    }
                });
            }
        });
        
        return total;
    },
    
    /**
     * Get total recurring expenses for a specific month (excluding Loan EMI and Credit Card EMI)
     */
    getTotalRecurringExpensesForMonth(year, month) {
        if (!window.RecurringExpenses) {
            return 0;
        }
        
        const allRecurring = window.RecurringExpenses.getAll();
        let total = 0;
        
        allRecurring.forEach(recurring => {
            // Skip inactive
            if (recurring.isActive === false) {
                return;
            }
            
            // Skip if end date is before the target month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(year, month - 1, 1);
                if (checkDate > endDate) {
                    return;
                }
            }
            
            // Check if due in the target month
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, year, month);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category !== 'Loan EMI' && category !== 'Credit Card EMI') {
                    total += recurring.amount;
                }
            }
        });
        
        return total;
    },
    
    /**
     * Get total EMIs for a specific month (loans + credit cards)
     */
    getTotalEmisForMonth(year, month) {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const targetMonth = month - 1; // Convert to 0-indexed
        let total = 0;
        
        // Add active loan EMIs
        loans.forEach(loan => {
            // Check if loan has started before or during target month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const targetMonthStart = new Date(year, targetMonth, 1);
            
            if (firstEmiMonth > targetMonthStart) {
                return;
            }
            
            // Calculate remaining EMIs
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    total += parseFloat(emiAmount);
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const targetMonthStart = new Date(year, targetMonth, 1);
                        
                        if (emiFirstMonth > targetMonthStart) {
                            return;
                        }
                    }
                    
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        total += parseFloat(emi.emiAmount);
                    }
                });
            }
        });
        
        return total;
    },
    
    /**
     * Show month list modal for a specific month
     */
    showMonthList(type, year, month) {
        // Get the date for the target month
        const targetDate = new Date(year, month - 1, 15);
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Check if this is a future month
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const targetMonthStart = new Date(year, month - 1, 1);
        const isFutureMonth = targetMonthStart > currentMonthStart;
        
        let items = [];
        let title = '';
        let total = 0;
        let isProjected = false;
        let projectionNote = '';
        
        if (type === 'recurring') {
            title = `Recurring Payments - ${monthName}`;
            items = this.getRecurringExpenseItemsForMonth(year, month);
            total = items.reduce((sum, item) => sum + item.amount, 0);
        } else if (type === 'emis') {
            title = `Loans / EMIs - ${monthName}`;
            items = this.getEmiItemsForMonth(year, month);
            total = items.reduce((sum, item) => sum + item.amount, 0);
        } else if (type === 'regular') {
            if (isFutureMonth) {
                // For future months, show projection explanation
                title = `Regular Expenses - ${monthName} (Estimate)`;
                isProjected = true;
                const projectionData = this.getProjectedRegularExpensesWithDetails();
                total = projectionData.average;
                items = projectionData.monthlyData; // Reuse items for the breakdown
                projectionNote = 'This is an estimated amount based on your average regular expenses from the last 3 months.';
            } else {
                title = `Regular Expenses - ${monthName}`;
                items = this.getRegularExpenseItemsForMonth(year, month);
                total = items.reduce((sum, item) => sum + item.amount, 0);
            }
        }
        
        // Create/show modal
        let modal = document.getElementById('month-list-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'month-list-modal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
            document.body.appendChild(modal);
        }
        
        let contentHtml = '';
        if (isProjected) {
            const hasData = items.length > 0;
            contentHtml = `
                <div class="py-2">
                    <p class="text-gray-600 text-sm mb-4 text-center">${projectionNote}</p>
                    
                    ${hasData ? `
                    <!-- Monthly Breakdown -->
                    <div class="mb-4">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Data Used</div>
                        <div class="bg-gray-50 rounded-lg p-3 space-y-2">
                            ${items.map(item => `
                                <div class="flex justify-between items-center">
                                    <span class="text-sm text-gray-700">${item.label}</span>
                                    <span class="text-sm font-semibold text-gray-800">₹${Utils.formatIndianNumber(item.amount)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Calculation -->
                    <div class="mb-4">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Calculation</div>
                        <div class="bg-blue-50 rounded-lg p-3">
                            <div class="text-sm text-blue-700">
                                <div class="flex justify-between mb-1">
                                    <span>Total of ${items.length} months</span>
                                    <span class="font-medium">₹${Utils.formatIndianNumber(items.reduce((s, i) => s + i.amount, 0))}</span>
                                </div>
                                <div class="flex justify-between text-blue-600">
                                    <span>÷ ${items.length} months</span>
                                    <span class="font-medium">= ₹${Utils.formatIndianNumber(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : `
                    <div class="text-center py-4 text-gray-500">
                        <p>No historical data available to calculate projection.</p>
                    </div>
                    `}
                    
                    <!-- Result -->
                    <div class="bg-emerald-50 rounded-lg p-4 text-center">
                        <div class="text-xs text-emerald-600 font-medium mb-1">Estimated for Next Month</div>
                        <div class="text-2xl font-bold text-emerald-700">~₹${Utils.formatIndianNumber(total)}</div>
                    </div>
                </div>
            `;
        } else {
            contentHtml = `
                <div class="flex-1 overflow-y-auto">
                    ${items.length > 0 ? items.map(item => `
                        <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div class="flex-1">
                                <div class="font-medium text-gray-800 text-sm">${item.name}</div>
                                <div class="flex items-center gap-2 text-xs text-gray-500">
                                    ${item.category ? `<span>${item.category}</span>` : ''}
                                    ${item.category && item.date ? '<span>•</span>' : ''}
                                    ${item.date ? `<span>${item.date}</span>` : ''}
                                </div>
                            </div>
                            <div class="text-sm font-semibold text-gray-700">₹${Utils.formatIndianNumber(item.amount)}</div>
                        </div>
                    `).join('') : '<p class="text-gray-500 text-center py-4">No items found</p>'}
                </div>
                <div class="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
                    <span class="font-semibold text-gray-700">Total</span>
                    <span class="font-bold text-lg text-gray-800">₹${Utils.formatIndianNumber(total)}</span>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-5 max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">${title}</h3>
                    <button onclick="document.getElementById('month-list-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                ${contentHtml}
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Get recurring expense items for a specific month
     */
    getRecurringExpenseItemsForMonth(year, month) {
        if (!window.RecurringExpenses) return [];
        
        const allRecurring = window.RecurringExpenses.getAll();
        const items = [];
        
        allRecurring.forEach(recurring => {
            if (recurring.isActive === false) return;
            
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(year, month - 1, 1);
                if (checkDate > endDate) return;
            }
            
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, year, month);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category !== 'Loan EMI' && category !== 'Credit Card EMI') {
                    // Determine due date for this month
                    const dayOfMonth = recurring.dayOfMonth || 1;
                    const dueDate = new Date(year, month - 1, dayOfMonth);
                    items.push({
                        name: recurring.name,
                        category: recurring.category,
                        amount: recurring.amount,
                        date: dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: dueDate.getTime()
                    });
                }
            }
        });
        
        // Sort by date ascending
        return items.sort((a, b) => a.sortDate - b.sortDate);
    },
    
    /**
     * Get EMI items for a specific month
     */
    getEmiItemsForMonth(year, month) {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const targetMonth = month - 1;
        const items = [];
        
        loans.forEach(loan => {
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const targetMonthStart = new Date(year, targetMonth, 1);
            
            if (firstEmiMonth > targetMonthStart) return;
            
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    // EMI due date is same day of month as first EMI
                    const emiDueDay = firstDate.getDate();
                    const emiDueDate = new Date(year, targetMonth, emiDueDay);
                    items.push({
                        name: loan.reason || loan.type || 'Loan',
                        category: 'Loan EMI',
                        amount: parseFloat(emiAmount),
                        date: emiDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: emiDueDate.getTime()
                    });
                }
            }
        });
        
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const targetMonthStart = new Date(year, targetMonth, 1);
                        
                        if (emiFirstMonth > targetMonthStart) return;
                    }
                    
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        // Card EMI due date - use first EMI date's day or default to card bill due date
                        const emiFirstDate = emi.firstEmiDate ? new Date(emi.firstEmiDate) : null;
                        const emiDueDay = emiFirstDate ? emiFirstDate.getDate() : (card.billDueDate || 1);
                        const emiDueDate = new Date(year, targetMonth, emiDueDay);
                        items.push({
                            name: `${card.nickname || card.name} - ${emi.reason || 'EMI'}`,
                            category: 'Card EMI',
                            amount: parseFloat(emi.emiAmount),
                            date: emiDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                            sortDate: emiDueDate.getTime()
                        });
                    }
                });
            }
        });
        
        // Sort by date ascending
        return items.sort((a, b) => a.sortDate - b.sortDate);
    },
    
    /**
     * Get regular expense items for a specific month
     */
    getRegularExpenseItemsForMonth(year, month) {
        const expenses = window.DB.expenses || [];
        const items = [];
        
        expenses.forEach(expense => {
            // Use budget month if available
            const { month: expenseMonth, year: expenseYear } = this.getExpenseBudgetMonth(expense);
            
            if (expenseYear === year && expenseMonth === month) {
                // Use the same filtering logic as other regular expense functions
                if (this.isRegularExpense(expense)) {
                    const expDate = new Date(expense.date);
                    items.push({
                        name: expense.title || expense.description || 'Expense',
                        category: expense.category,
                        amount: parseFloat(expense.amount) || 0,
                        date: expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: expDate.getTime()
                    });
                }
            }
        });
        
        // Sort by date ascending
        return items.sort((a, b) => a.sortDate - b.sortDate);
    },
    
    /**
     * Check if an expense is a regular expense (not EMI, not recurring)
     * Reuses Expenses module's isAutoRecurringExpense for consistency
     */
    isRegularExpense(expense) {
        return !window.Expenses.isAutoRecurringExpense(expense);
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
     * Get regular expenses for current month (excluding EMI, loans, recurring categories)
     */
    getRegularExpenses() {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        // Get only regular expenses (non-recurring, non-EMI) for current month
        let regularTotal = 0;
        expenses.forEach(expense => {
            // Use budget month if available, otherwise fall back to expense date
            const { month: expenseMonth, year: expenseYear } = this.getExpenseBudgetMonth(expense);
            
            // Only count expenses in current month that are regular expenses
            if (expenseYear === currentYear && expenseMonth === currentMonth) {
                if (this.isRegularExpense(expense)) {
                    regularTotal += parseFloat(expense.amount) || 0;
                }
            }
        });
        
        return regularTotal;
    },
    
    /**
     * Get projected regular expenses for next month based on historical average
     * Uses the average of the last 3 completed months (excluding current month)
     */
    getProjectedRegularExpenses() {
        return this.getProjectedRegularExpensesWithDetails().average;
    },
    
    /**
     * Get projected regular expenses with detailed breakdown
     * Returns both the average and individual month data
     */
    getProjectedRegularExpensesWithDetails() {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        // Calculate averages from the last 3 completed months
        const monthlyData = [];
        
        for (let i = 1; i <= 3; i++) {
            let targetMonth = currentMonth - i;
            let targetYear = currentYear;
            
            if (targetMonth <= 0) {
                targetMonth += 12;
                targetYear -= 1;
            }
            
            let monthTotal = 0;
            expenses.forEach(expense => {
                // Use budget month if available
                const { month: expenseMonth, year: expenseYear } = this.getExpenseBudgetMonth(expense);
                
                if (expenseYear === targetYear && expenseMonth === targetMonth) {
                    // Use the same filtering logic as getRegularExpenses
                    if (this.isRegularExpense(expense)) {
                        monthTotal += parseFloat(expense.amount) || 0;
                    }
                }
            });
            
            // Only include months that have data
            if (monthTotal > 0) {
                const monthDate = new Date(targetYear, targetMonth - 1, 1);
                const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                monthlyData.push({
                    month: targetMonth,
                    year: targetYear,
                    label: monthLabel,
                    amount: Math.round(monthTotal)
                });
            }
        }
        
        // Calculate average (or return 0 if no historical data)
        if (monthlyData.length === 0) {
            return { average: 0, monthlyData: [] };
        }
        
        const totalSum = monthlyData.reduce((sum, data) => sum + data.amount, 0);
        const average = Math.round(totalSum / monthlyData.length);
        
        return { average, monthlyData, totalSum, monthCount: monthlyData.length };
    },
    
    /**
     * Get recurring expense items for current month (excluding Loan EMI and Credit Card EMI)
     */
    getRecurringExpenseItems() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        if (!window.RecurringExpenses) {
            return [];
        }
        
        const allRecurring = window.RecurringExpenses.getAll();
        const items = [];
        
        allRecurring.forEach(recurring => {
            // Skip inactive
            if (recurring.isActive === false) {
                return;
            }
            
            // Skip if end date is before this month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(currentYear, currentMonth - 1, 1);
                if (checkDate > endDate) {
                    return;
                }
            }
            
            // Check if due in this month
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, currentYear, currentMonth);
            
            if (isDue) {
                const category = recurring.category || '';
                // Exclude Loan EMI and Credit Card EMI
                if (category !== 'Loan EMI' && category !== 'Credit Card EMI') {
                    items.push({
                        title: recurring.title || recurring.name || 'Recurring',
                        category: category || 'Other',
                        amount: parseFloat(recurring.amount) || 0,
                        date: `Day ${recurring.dayOfMonth || '-'}`
                    });
                }
            }
        });
        
        return items.sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Get EMI items for current month (loans + credit cards)
     */
    getEmiItems() {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11
        const items = [];
        
        // Add active loan EMIs
        loans.forEach(loan => {
            // Check if loan has started before or during this month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const currentMonthStart = new Date(currentYear, currentMonth, 1);
            
            if (firstEmiMonth > currentMonthStart) {
                return;
            }
            
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    const emiDay = firstDate.getDate();
                    items.push({
                        title: `${loan.bankName} ${loan.loanType || 'Loan'}`,
                        category: 'Loan EMI',
                        amount: parseFloat(emiAmount),
                        date: `Day ${emiDay}`,
                        type: 'loan'
                    });
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const currentMonthStart = new Date(currentYear, currentMonth, 1);
                        
                        if (emiFirstMonth > currentMonthStart) {
                            return;
                        }
                    }
                    
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        items.push({
                            title: `${card.name || card.bankName} - ${emi.description || 'EMI'}`,
                            category: 'Credit Card EMI',
                            amount: parseFloat(emi.emiAmount),
                            date: `${paidCount}/${totalCount} paid`,
                            type: 'card'
                        });
                    }
                });
            }
        });
        
        return items.sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Get regular expense items for current month (excluding EMI category)
     */
    getRegularExpenseItems() {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        return expenses
            .filter(expense => {
                const expenseDate = new Date(expense.date);
                const expenseYear = expenseDate.getFullYear();
                const expenseMonth = expenseDate.getMonth() + 1;
                
                if (expenseYear !== currentYear || expenseMonth !== currentMonth) {
                    return false;
                }
                
                const category = (expense.category || '').toLowerCase();
                // Exclude EMI category
                return category !== 'emi' && category !== 'recurring';
            })
            .map(expense => ({
                title: expense.title,
                category: expense.category || 'Other',
                amount: parseFloat(expense.amount) || 0,
                date: new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            }))
            .sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Show current month breakdown list
     */
    showCurrentMonthList(type) {
        let items = [];
        let title = '';
        let color = '';
        let total = 0;
        
        if (type === 'recurring') {
            items = this.getRecurringExpenseItems();
            title = '🔄 Recurring Payments';
            color = 'purple';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'emis') {
            items = this.getEmiItems();
            title = '🏦 Loans / EMIs';
            color = 'blue';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'regular') {
            items = this.getRegularExpenseItems();
            title = '💵 Regular Expenses';
            color = 'emerald';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        }
        
        // Create or update modal
        let modal = document.getElementById('current-month-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'current-month-modal';
            document.body.appendChild(modal);
        }
        
        const today = new Date();
        const monthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        const itemsHtml = items.length > 0 
            ? items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('')
            : `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${title}</h3>
                            <p class="text-xs text-white/80">${monthLabel}</p>
                        </div>
                        <button onclick="document.getElementById('current-month-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${items.length} items)</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Format amount for display (no longer needed, using Utils.formatIndianNumber)
     */
    formatAmount(amount) {
        return Utils.formatIndianNumber(amount);
    },
    
    /**
     * Show tooltip on info button
     */
    showTooltip(event, text) {
        event.stopPropagation();
        
        // Remove any existing tooltips
        const existing = document.getElementById('dashboard-tooltip');
        if (existing) existing.remove();
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'dashboard-tooltip';
        tooltip.className = 'fixed bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[10001] max-w-[200px]';
        tooltip.textContent = text;
        
        // Position tooltip to the left of the button to avoid overflow
        const buttonRect = event.target.getBoundingClientRect();
        tooltip.style.top = buttonRect.top + 'px';
        tooltip.style.right = (window.innerWidth - buttonRect.left + 5) + 'px';
        
        document.body.appendChild(tooltip);
        
        // Remove on click anywhere
        setTimeout(() => {
            document.addEventListener('click', () => {
                const tt = document.getElementById('dashboard-tooltip');
                if (tt) tt.remove();
            }, { once: true });
        }, 100);
    },
    
    /**
     * Get formatted month string
     */
    getFormattedMonth(monthValue) {
        const [year, month] = monthValue.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    },
    
    /**
     * Open month picker (not implemented - using browser's month input)
     */
    openMonthPicker(type) {
        // For now, just focus on the hidden month input
        const input = document.getElementById('category-month-selector');
        if (input && input.showPicker) {
            input.showPicker();
        }
    },
    
    /**
     * Update category month button text
     */
    updateCategoryButton() {
        const selector = document.getElementById('category-month-selector');
        const button = document.getElementById('category-month-button');
        if (selector && button) {
            button.innerHTML = this.getFormattedMonth(selector.value) + ' ▼';
        }
    },
    
    /**
     * Get months count based on selected range
     */
    getMonthsCount() {
        if (!this.selectedMonthRange) {
            return 6; // Default to last 6 months
        }
        
        const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
        const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
        
        const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        return Math.max(1, Math.min(12, months));
    },
    
    /**
     * Get month range label
     */
    getMonthRangeLabel() {
        if (!this.selectedMonthRange) {
            return 'Last 6 months';
        }
        
        const start = this.getFormattedMonth(this.selectedMonthRange.start);
        const end = this.getFormattedMonth(this.selectedMonthRange.end);
        return `${start} - ${end}`;
    },
    
    /**
     * Open month range modal
     */
    openMonthRangeModal() {
        const modal = document.getElementById('month-range-modal');
        if (modal) {
            // Set default values
            const now = new Date();
            const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (this.selectedMonthRange) {
                document.getElementById('month-range-start').value = this.selectedMonthRange.start;
                document.getElementById('month-range-end').value = this.selectedMonthRange.end;
            } else {
                document.getElementById('month-range-start').value = startMonth;
                document.getElementById('month-range-end').value = endMonth;
            }
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close month range modal
     */
    closeMonthRangeModal() {
        const modal = document.getElementById('month-range-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Apply month range selection
     */
    applyMonthRange() {
        const start = document.getElementById('month-range-start').value;
        const end = document.getElementById('month-range-end').value;
        
        if (!start || !end) {
            alert('Please select both start and end months');
            return;
        }
        
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        
        if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
            alert('Start month must be before or equal to end month');
            return;
        }
        
        const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        if (months > 12) {
            alert('Maximum range is 12 months');
            return;
        }
        
        this.selectedMonthRange = { start, end };
        this.closeMonthRangeModal();
        
        // Update label
        const label = document.getElementById('month-range-label');
        if (label) {
            label.textContent = this.getMonthRangeLabel();
        }
        
        // Re-render charts
        this.renderIncomeExpenseChart();
    },
    
    /**
     * Reset to default month range
     */
    resetMonthRange() {
        this.selectedMonthRange = null;
        this.closeMonthRangeModal();
        
        // Update label
        const label = document.getElementById('month-range-label');
        if (label) {
            label.textContent = 'Last 6 months';
        }
        
        // Re-render charts
        this.renderIncomeExpenseChart();
    },
    
    /**
     * Get current filter month value (YYYY-MM format)
     */
    getFilterMonthValue() {
        if (this.selectedFilterMonth) {
            return this.selectedFilterMonth;
        }
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    
    /**
     * Get formatted month for display
     */
    getFormattedFilterMonth(value) {
        if (!value) return 'Select Month';
        const [year, month] = value.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    },
    
    /**
     * Update filter month and re-render
     */
    updateFilterMonthButton() {
        const input = document.getElementById('filter-month-selector');
        if (input) {
            this.selectedFilterMonth = input.value;
            this.render();
        }
    },
    
    /**
     * Get total expenses for selected filter month
     * Uses budget month if available, falls back to expense date
     */
    getMonthExpenses(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                return expYear === year && expMonth === month;
            })
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    },
    
    /**
     * Get expense items for a month
     * Uses budget month if available, falls back to expense date
     */
    getMonthExpenseItems(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                return expYear === year && expMonth === month;
            })
            .map(exp => ({
                title: exp.title,
                category: exp.category || 'Other',
                amount: parseFloat(exp.amount) || 0,
                date: new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sortDate: new Date(exp.date).getTime()
            }))
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Get total monthly investments for selected filter month
     * Uses incomeMonth/incomeYear if available, falls back to investment date
     */
    getMonthInvestments(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const goldRate = window.DB.goldRatePerGram || 7000;
        
        return monthlyInvestments
            .filter(inv => {
                // Use incomeMonth/incomeYear if available, otherwise fall back to investment date
                if (inv.incomeMonth && inv.incomeYear) {
                    return inv.incomeYear === year && inv.incomeMonth === month;
                }
                // Fallback: use investment date (backward compatibility)
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && (invDate.getMonth() + 1) === month;
            })
            .reduce((sum, inv) => {
                if (inv.type === 'SHARES') {
                    const exchangeRate = typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : 83;
                    return sum + (inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1));
                } else if (inv.type === 'GOLD') {
                    return sum + (inv.price * inv.quantity);
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    return sum + (inv.amount || 0);
                }
                return sum;
            }, 0);
    },
    
    /**
     * Get investment items for a month
     * Uses incomeMonth/incomeYear if available, falls back to investment date
     */
    getMonthInvestmentItems(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const exchangeRate = typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : 83;
        
        return monthlyInvestments
            .filter(inv => {
                // Use incomeMonth/incomeYear if available, otherwise fall back to investment date
                if (inv.incomeMonth && inv.incomeYear) {
                    return inv.incomeYear === year && inv.incomeMonth === month;
                }
                // Fallback: use investment date (backward compatibility)
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && (invDate.getMonth() + 1) === month;
            })
            .map(inv => {
                let amount = 0;
                let title = inv.name || inv.type;
                
                if (inv.type === 'SHARES') {
                    amount = inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                    title = inv.name || 'Shares';
                } else if (inv.type === 'GOLD') {
                    amount = inv.price * inv.quantity;
                    title = inv.name || 'Gold';
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    amount = inv.amount || 0;
                    title = inv.name || inv.type;
                }
                
                return {
                    title: title,
                    category: inv.type,
                    amount: amount,
                    date: new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                };
            })
            .sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Get net pay for selected filter month
     */
    getMonthNetPay(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        
        // Use Income module's functions to calculate payslips
        const incomeData = window.DB.income || {};
        const ctc = incomeData.ctc || 0;
        
        if (!ctc || ctc === 0) return 0;
        
        // Get all income parameters
        const bonusPercent = incomeData.bonusPercent || 0;
        const esppPercentCycle1 = incomeData.esppPercentCycle1 || 0;
        const esppPercentCycle2 = incomeData.esppPercentCycle2 || 0;
        const pfPercent = incomeData.pfPercent || 12;
        
        // Generate all monthly payslips using Income module
        const yearlyPayslips = Income.generateYearlyPayslips(
            ctc, 
            bonusPercent, 
            esppPercentCycle1, 
            esppPercentCycle2, 
            pfPercent
        );
        
        // Find payslip for the requested month
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthName = monthNames[month - 1];
        
        const payslip = yearlyPayslips.find(p => p.month === monthName);
        
        // Return totalNetPay which includes salary + bonus - insurance
        return payslip ? (payslip.totalNetPay || payslip.netPay || 0) : 0;
    },
    
    /**
     * Get income for expense comparison based on pay schedule
     * Includes salary + additional income (bonus, freelance, etc.)
     * @param {number} expenseYear - Year of expenses
     * @param {number} expenseMonth - Month of expenses (1-12)
     * @returns {Object} { income: number|null, month: number, year: number, monthName: string, salary: number, additionalIncome: number }
     */
    getIncomeForExpenseComparison(expenseYear, expenseMonth) {
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        
        let incomeMonth, incomeYear;
        
        if (paySchedule === 'last_week') {
            // Use previous month's income (Dec salary -> Jan expenses)
            incomeMonth = expenseMonth === 1 ? 12 : expenseMonth - 1;
            incomeYear = expenseMonth === 1 ? expenseYear - 1 : expenseYear;
        } else {
            // Use same month's income
            incomeMonth = expenseMonth;
            incomeYear = expenseYear;
        }
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[incomeMonth - 1];
        
        // Get additional income for the month
        const additionalIncomeTotal = window.Income ? 
            window.Income.getAdditionalIncomeTotalForMonth(incomeMonth, incomeYear) : 0;
        
        // Try to find actual salary first
        const salaries = window.DB.salaries || [];
        const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
        
        if (actualSalary) {
            const totalIncome = actualSalary.amount + additionalIncomeTotal;
            return { 
                income: totalIncome, 
                salary: actualSalary.amount,
                additionalIncome: additionalIncomeTotal,
                month: incomeMonth, 
                year: incomeYear, 
                monthName 
            };
        }
        
        // Fallback to estimated payslip
        const incomeData = window.DB.income || {};
        const ctc = incomeData.ctc || 0;
        
        if (!ctc || ctc === 0) {
            // Still include additional income even if no salary/CTC
            if (additionalIncomeTotal > 0) {
                return { 
                    income: additionalIncomeTotal, 
                    salary: 0,
                    additionalIncome: additionalIncomeTotal,
                    month: incomeMonth, 
                    year: incomeYear, 
                    monthName 
                };
            }
            return { income: null, salary: 0, additionalIncome: 0, month: incomeMonth, year: incomeYear, monthName };
        }
        
        const monthNamesLong = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const yearlyPayslips = Income.generateYearlyPayslips(
            ctc, 
            incomeData.bonusPercent || 0, 
            incomeData.esppPercentCycle1 || 0, 
            incomeData.esppPercentCycle2 || 0, 
            incomeData.pfPercent || 12
        );
        
        const payslip = yearlyPayslips.find(p => p.month === monthNamesLong[incomeMonth - 1]);
        const payslipIncome = payslip ? (payslip.totalNetPay || payslip.netPay || 0) : 0;
        const totalIncome = payslipIncome + additionalIncomeTotal;
        
        return { 
            income: totalIncome > 0 ? totalIncome : null, 
            salary: payslipIncome,
            additionalIncome: additionalIncomeTotal,
            month: incomeMonth, 
            year: incomeYear, 
            monthName 
        };
    },
    
    /**
     * Render monthly breakdown section (second line)
     */
    renderMonthlyBreakdown() {
        const filterMonth = this.getFilterMonthValue();
        const [expenseYear, expenseMonth] = filterMonth.split('-').map(Number);
        const expenses = this.getMonthExpenses(filterMonth);
        const investments = this.getMonthInvestments(filterMonth);
        
        // Get income using pay schedule logic
        const incomeData = this.getIncomeForExpenseComparison(expenseYear, expenseMonth);
        const netPay = incomeData.income;
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        
        // Check if we have valid income data
        const hasIncomeData = netPay !== null && netPay > 0;
        
        // Calculate percentages and balance
        let expensesPercent, investmentsPercent, balancePercent, balance;
        
        if (hasIncomeData) {
            balance = netPay - expenses - investments;
            expensesPercent = ((expenses / netPay) * 100).toFixed(1);
            investmentsPercent = ((investments / netPay) * 100).toFixed(1);
            balancePercent = ((balance / netPay) * 100).toFixed(1);
        } else {
            balance = 0;
            expensesPercent = 'N/A';
            investmentsPercent = 'N/A';
            balancePercent = 'N/A';
        }
        
        // Income source label for tooltip
        const incomeSourceLabel = paySchedule === 'last_week' 
            ? `Based on ${incomeData.monthName} ${incomeData.year} income (last week pay schedule)`
            : `Based on ${incomeData.monthName} ${incomeData.year} income`;
        
        return `
            <!-- Monthly Breakdown Cards Box -->
            <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <!-- Header with Title and Month Selector -->
                <div class="flex justify-between items-center max-w-full">
                    <h3 class="text-sm font-semibold text-gray-700">Monthly Breakdown</h3>
                    <div class="relative">
                        <input type="month" id="filter-month-selector" value="${filterMonth}" onchange="Dashboard.updateFilterMonthButton()" class="absolute opacity-0 pointer-events-none" />
                        <button id="filter-month-button" onclick="document.getElementById('filter-month-selector').showPicker()" class="px-3 py-1.5 border border-red-300 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(filterMonth)} ▼
                        </button>
                    </div>
                </div>
                ${paySchedule === 'last_week' ? `<p class="text-[10px] text-gray-400 mt-1 mb-2">Compared with ${incomeData.monthName} ${incomeData.year} income</p>` : '<div class="mb-3"></div>'}
                
                <!-- Breakdown Cards -->
                <div class="grid grid-cols-3 gap-3 max-w-full">
                    <div onclick="Dashboard.showMonthlyBreakdownList('expenses')" class="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                        <div class="text-xs opacity-90 leading-tight">Expenses</div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncomeData 
                                ? `<div class="text-3xl font-bold">${expensesPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(expenses))}</div>
                            <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                        </div>
                    </div>
                    
                    <div onclick="Dashboard.showMonthlyBreakdownList('investments')" class="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                        <div class="text-xs opacity-90 leading-tight">Investments</div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncomeData 
                                ? `<div class="text-3xl font-bold">${investmentsPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(investments))}</div>
                            <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">›</div>
                        </div>
                    </div>
                    
                    <div class="bg-gradient-to-br ${hasIncomeData && balance >= 0 ? 'from-teal-500 to-cyan-600' : 'from-gray-500 to-gray-600'} rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Balance</div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncomeData 
                                ? `<div class="text-3xl font-bold">${balancePercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">${hasIncomeData ? '₹' + Utils.formatIndianNumber(Math.round(balance)) : 'No income data'}</div>
                            <button onclick="event.stopPropagation(); Dashboard.showTooltip(event, '${hasIncomeData ? 'Balance: Income - (Expenses + Investments)' : 'No income data for ' + incomeData.monthName + ' ' + incomeData.year}')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
}

