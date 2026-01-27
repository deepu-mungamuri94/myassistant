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
    
    // Loading state for AI insights
    aiInsightsLoading: false,
    
    /**
     * Get AI expense insights cache (persisted in DB)
     */
    get aiExpenseInsightsCache() {
        if (!window.DB.aiExpenseInsights) {
            window.DB.aiExpenseInsights = {};
        }
        return window.DB.aiExpenseInsights;
    },
    
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
            ${isCurrent ? this.renderSettlementSection(targetYear, targetMonth) : ''}
            ${!isCurrent ? this.renderAIInsightsSection(targetYear, targetMonth) : ''}
        </div>
        `;
    },
    
    /**
     * Render Settlement Calculations Section for current month
     */
    renderSettlementSection(year, month) {
        return `
            <div class="mt-3 pt-3 border-t border-gray-200">
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center shadow-sm">
                            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                            </svg>
                        </div>
                        <div>
                            <span class="text-xs font-medium text-green-700">Settlement Calculations</span>
                        </div>
                    </div>
                    <button onclick="Dashboard.showSettlementModal(${year}, ${month})" 
                            class="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        view
                    </button>
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
     * Render AI Insights Section for next month projection
     */
    renderAIInsightsSection(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const cached = this.aiExpenseInsightsCache[monthKey];
        
        return `
            <div class="mt-3 pt-3 border-t border-gray-200" id="ai-insights-section">
                <div id="ai-insights-content">
                    ${this.getAIInsightsContent(year, month)}
                </div>
            </div>
        `;
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
        
        // Get all paid bills (check both paidAt and paidDate for backward compatibility)
        let paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && (b.paidAt || b.paidDate));
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
            const paidDateValue = b.paidAt || b.paidDate;
            const d = new Date(paidDateValue);
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
                    const paidDateValue = b.paidAt || b.paidDate;
                    const d = new Date(paidDateValue);
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
                        .sort((a, b) => new Date(a.paidAt || a.paidDate) - new Date(b.paidAt || b.paidDate))
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
                        const paidDateValue = b.paidAt || b.paidDate;
                        const d = new Date(paidDateValue);
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
    
    // Track grouped view state for budget breakdown modal
    budgetBreakdownGrouped: false,
    // Track which groups are expanded in budget breakdown modal
    budgetBreakdownExpandedGroups: {},
    
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
        
        // Store current items and type for re-rendering
        this._currentBudgetBreakdownItems = items;
        this._currentBudgetBreakdownType = type;
        this._currentBudgetBreakdownColor = color;
        this._currentBudgetBreakdownTitle = title;
        this._currentBudgetBreakdownTotal = total;
        
        // Create or update modal
        let modal = document.getElementById('budget-breakdown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'budget-breakdown-modal';
            document.body.appendChild(modal);
        }
        
        const monthLabel = this.getFormattedMonth(budgetMonth);
        this._currentBudgetBreakdownMonthLabel = monthLabel;
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        this.renderBudgetBreakdownModalContent(modal);
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Render budget breakdown modal content (supports grouped view toggle)
     */
    renderBudgetBreakdownModalContent(modal) {
        const items = this._currentBudgetBreakdownItems;
        const color = this._currentBudgetBreakdownColor;
        const title = this._currentBudgetBreakdownTitle;
        const total = this._currentBudgetBreakdownTotal;
        const monthLabel = this._currentBudgetBreakdownMonthLabel;
        const isGrouped = this.budgetBreakdownGrouped;
        
        let itemsHtml = '';
        
        if (items.length === 0) {
            itemsHtml = `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        } else if (isGrouped) {
            // Group items by title
            const grouped = this.groupItemsByName(items);
            itemsHtml = grouped.map(group => {
                const isExpanded = this.budgetBreakdownExpandedGroups[group.name] || false;
                const hasMultiple = group.items.length > 1;
                
                if (!hasMultiple) {
                    // Single item - show normally
                    const item = group.items[0];
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `;
                } else {
                    // Multiple items - show as expandable group
                    const expandedItems = isExpanded ? group.items.map(item => `
                        <div class="flex justify-between items-center py-2 pl-4 border-b border-gray-50 last:border-0 bg-gray-50">
                            <div class="flex-1 min-w-0">
                                <p class="text-xs text-gray-600 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-400">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-xs font-medium text-gray-600 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `).join('') : '';
                    
                    return `
                        <div class="border-b border-gray-100 last:border-0">
                            <div class="flex justify-between items-center py-2 cursor-pointer hover:bg-gray-50 transition-colors" onclick="Dashboard.toggleBudgetBreakdownGroup('${Utils.escapeHtml(group.name).replace(/'/g, "\\'")}')">
                                <div class="flex-1 min-w-0 flex items-center gap-2">
                                    <span class="text-xs text-${color}-500 font-semibold transform transition-transform ${isExpanded ? 'rotate-90' : ''}">${isExpanded ? '▼' : '▶'}</span>
                                    <div>
                                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(group.name)}</p>
                                        <p class="text-xs text-gray-500">${group.items.length} items • ${group.items[0].category}</p>
                                    </div>
                                </div>
                                <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(group.total)}</span>
                            </div>
                            ${isExpanded ? `<div class="border-t border-gray-100">${expandedItems}</div>` : ''}
                        </div>
                    `;
                }
            }).join('');
        } else {
            // Default individual items view
            itemsHtml = items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('');
        }
        
        // Count display - show unique groups if grouped
        const countDisplay = isGrouped 
            ? `${this.groupItemsByName(items).length} groups (${items.length} items)`
            : `${items.length} items`;
        
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
                <!-- Group Toggle -->
                <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span class="text-xs text-gray-600">Group by name</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" ${isGrouped ? 'checked' : ''} onchange="Dashboard.toggleBudgetBreakdownGroupView(this.checked)">
                        <div class="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-${color}-500"></div>
                    </label>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${countDisplay})</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Group items by name for budget breakdown modal
     */
    groupItemsByName(items) {
        const groups = {};
        
        items.forEach(item => {
            const name = item.title.trim().toLowerCase();
            if (!groups[name]) {
                groups[name] = {
                    name: item.title,
                    items: [],
                    total: 0
                };
            }
            groups[name].items.push(item);
            groups[name].total += item.amount;
        });
        
        // Convert to array and sort by total (highest first)
        return Object.values(groups).sort((a, b) => b.total - a.total);
    },
    
    /**
     * Toggle grouped view for budget breakdown modal
     */
    toggleBudgetBreakdownGroupView(isGrouped) {
        this.budgetBreakdownGrouped = isGrouped;
        // Reset expanded groups when toggling
        this.budgetBreakdownExpandedGroups = {};
        
        const modal = document.getElementById('budget-breakdown-modal');
        if (modal) {
            this.renderBudgetBreakdownModalContent(modal);
        }
    },
    
    /**
     * Toggle expanded state for a group in budget breakdown modal
     */
    toggleBudgetBreakdownGroup(groupName) {
        this.budgetBreakdownExpandedGroups[groupName] = !this.budgetBreakdownExpandedGroups[groupName];
        
        const modal = document.getElementById('budget-breakdown-modal');
        if (modal) {
            this.renderBudgetBreakdownModalContent(modal);
        }
    },
    
    // Track grouped view state for monthly breakdown modal
    monthlyBreakdownGrouped: false,
    // Track which groups are expanded in monthly breakdown modal
    monthlyBreakdownExpandedGroups: {},
    
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
        
        // Store current items and type for re-rendering
        this._currentMonthlyBreakdownItems = items;
        this._currentMonthlyBreakdownType = type;
        this._currentMonthlyBreakdownColor = color;
        this._currentMonthlyBreakdownTitle = title;
        this._currentMonthlyBreakdownTotal = total;
        
        // Create or update modal
        let modal = document.getElementById('monthly-breakdown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'monthly-breakdown-modal';
            document.body.appendChild(modal);
        }
        
        const monthLabel = this.getFormattedMonth(filterMonth);
        this._currentMonthlyBreakdownMonthLabel = monthLabel;
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        this.renderMonthlyBreakdownModalContent(modal);
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Render monthly breakdown modal content (supports grouped view toggle)
     */
    renderMonthlyBreakdownModalContent(modal) {
        const items = this._currentMonthlyBreakdownItems;
        const color = this._currentMonthlyBreakdownColor;
        const title = this._currentMonthlyBreakdownTitle;
        const total = this._currentMonthlyBreakdownTotal;
        const monthLabel = this._currentMonthlyBreakdownMonthLabel;
        const isGrouped = this.monthlyBreakdownGrouped;
        
        let itemsHtml = '';
        
        if (items.length === 0) {
            itemsHtml = `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        } else if (isGrouped) {
            // Group items by title
            const grouped = this.groupItemsByName(items);
            itemsHtml = grouped.map(group => {
                const isExpanded = this.monthlyBreakdownExpandedGroups[group.name] || false;
                const hasMultiple = group.items.length > 1;
                
                if (!hasMultiple) {
                    // Single item - show normally
                    const item = group.items[0];
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `;
                } else {
                    // Multiple items - show as expandable group
                    const expandedItems = isExpanded ? group.items.map(item => `
                        <div class="flex justify-between items-center py-2 pl-4 border-b border-gray-50 last:border-0 bg-gray-50">
                            <div class="flex-1 min-w-0">
                                <p class="text-xs text-gray-600 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-400">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-xs font-medium text-gray-600 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `).join('') : '';
                    
                    return `
                        <div class="border-b border-gray-100 last:border-0">
                            <div class="flex justify-between items-center py-2 cursor-pointer hover:bg-gray-50 transition-colors" onclick="Dashboard.toggleMonthlyBreakdownGroup('${Utils.escapeHtml(group.name).replace(/'/g, "\\'")}')">
                                <div class="flex-1 min-w-0 flex items-center gap-2">
                                    <span class="text-xs text-${color}-500 font-semibold transform transition-transform ${isExpanded ? 'rotate-90' : ''}">${isExpanded ? '▼' : '▶'}</span>
                                    <div>
                                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(group.name)}</p>
                                        <p class="text-xs text-gray-500">${group.items.length} items • ${group.items[0].category}</p>
                                    </div>
                                </div>
                                <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(group.total)}</span>
                            </div>
                            ${isExpanded ? `<div class="border-t border-gray-100">${expandedItems}</div>` : ''}
                        </div>
                    `;
                }
            }).join('');
        } else {
            // Default individual items view
            itemsHtml = items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('');
        }
        
        // Count display - show unique groups if grouped
        const countDisplay = isGrouped 
            ? `${this.groupItemsByName(items).length} groups (${items.length} items)`
            : `${items.length} items`;
        
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
                <!-- Group Toggle -->
                <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span class="text-xs text-gray-600">Group by name</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" ${isGrouped ? 'checked' : ''} onchange="Dashboard.toggleMonthlyBreakdownGroupView(this.checked)">
                        <div class="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-${color}-500"></div>
                    </label>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${countDisplay})</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Toggle grouped view for monthly breakdown modal
     */
    toggleMonthlyBreakdownGroupView(isGrouped) {
        this.monthlyBreakdownGrouped = isGrouped;
        // Reset expanded groups when toggling
        this.monthlyBreakdownExpandedGroups = {};
        
        const modal = document.getElementById('monthly-breakdown-modal');
        if (modal) {
            this.renderMonthlyBreakdownModalContent(modal);
        }
    },
    
    /**
     * Toggle expanded state for a group in monthly breakdown modal
     */
    toggleMonthlyBreakdownGroup(groupName) {
        this.monthlyBreakdownExpandedGroups[groupName] = !this.monthlyBreakdownExpandedGroups[groupName];
        
        const modal = document.getElementById('monthly-breakdown-modal');
        if (modal) {
            this.renderMonthlyBreakdownModalContent(modal);
        }
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
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    if (exp.needWant === 'need') {
                        // Check loan EMI exclusion
                        if (!includeLoanEmis) {
                            const category = exp.category || 'Other';
                            if (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi') {
                                if (this.isLoanEmi(exp)) {
                                    return false; // Exclude loan EMIs
                                }
                            }
                        }
                        return true;
                    } else {
                        return false; // Explicitly marked as 'want'
                    }
                }
                
                // Fallback to category-based classification
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
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    return exp.needWant === 'want';
                }
                
                // Fallback to category-based classification
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
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    if (exp.needWant === 'need') {
                        // Check loan EMI exclusion
                        if (!includeLoanEmis) {
                            const category = exp.category || 'Other';
                            if (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi') {
                                if (this.isLoanEmi(exp)) {
                                    return false; // Exclude loan EMIs
                                }
                            }
                        }
                        return true;
                    } else {
                        return false; // Explicitly marked as 'want'
                    }
                }
                
                // Fallback to category-based classification
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
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    return exp.needWant === 'want';
                }
                
                // Fallback to category-based classification
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
        let color = 'gray';
        let icon = '📋';
        
        if (type === 'recurring') {
            title = `Recurring Payments`;
            icon = '🔄';
            color = 'purple';
            items = this.getRecurringExpenseItemsForMonth(year, month);
            total = items.reduce((sum, item) => sum + item.amount, 0);
        } else if (type === 'emis') {
            title = `Loans / EMIs`;
            icon = '🏦';
            color = 'blue';
            items = this.getEmiItemsForMonth(year, month);
            total = items.reduce((sum, item) => sum + item.amount, 0);
        } else if (type === 'regular') {
            icon = '💵';
            color = 'emerald';
            if (isFutureMonth) {
                // For future months, show projection explanation
                title = `Regular Expenses (Estimate)`;
                isProjected = true;
                const projectionData = this.getProjectedRegularExpensesWithDetails(6);
                total = projectionData.average;
                items = projectionData.monthlyData; // Reuse items for the breakdown
                projectionNote = 'This is an estimated amount based on your average regular expenses from the last 6 months.';
            } else {
                title = `Regular Expenses`;
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
            // Check if this is EMI list (type === 'emis')
            const isEmiList = type === 'emis';
            
            contentHtml = `
                    ${items.length > 0 ? items.map(item => {
                        // Enhanced display for EMI items
                        if (isEmiList && item.paidCount !== undefined && item.totalCount !== undefined) {
                            const progressColor = item.type === 'loan' ? 'blue' : 'purple';
                            return `
                                <div class="py-3 border-b border-gray-100 last:border-0">
                                    <!-- Title and Amount -->
                                    <div class="flex justify-between items-start mb-2">
                                        <div class="font-semibold text-gray-800 text-sm">${item.name}</div>
                                        <div class="text-sm font-bold text-${progressColor}-600">₹${Utils.formatIndianNumber(item.amount)}</div>
                                    </div>
                                    
                                    <!-- Progress Bar -->
                                    <div class="mb-2">
                                        <div class="flex justify-between items-center text-xs text-gray-600 mb-1">
                                            <span class="font-medium">${item.paidCount}/${item.totalCount} EMIs paid</span>
                                            <span>${item.progress}%</span>
                                        </div>
                                        <div class="w-full bg-gray-200 rounded-full h-1.5">
                                            <div class="bg-${progressColor}-500 h-1.5 rounded-full transition-all" style="width: ${item.progress}%"></div>
                                        </div>
                                    </div>
                                    
                                    <!-- Date and Description -->
                                    <div class="flex items-center gap-2 text-xs text-gray-500">
                                        <span>📅 ${item.date}</span>
                                        ${item.description ? `<span>•</span><span class="italic">${item.description}</span>` : ''}
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Default display for non-EMI items
                        return `
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
                        `;
                    }).join('') : '<p class="text-gray-500 text-center py-4">No items found</p>'}
            `;
        }
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${icon} ${title}</h3>
                            <p class="text-xs text-white/80">${monthName}</p>
                        </div>
                        <button onclick="document.getElementById('month-list-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${contentHtml}
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
     * Get AI insights actions HTML (button)
     */
    getAIInsightsActions(year, month) {
        if (this.aiInsightsLoading) {
            return `<span class="text-[10px] text-gray-400">loading...</span>`;
        }
        
        return `
            <button onclick="Dashboard.fetchAIInsights(${year}, ${month})" 
                    class="flex items-center gap-1 px-2 py-1 text-[10px] bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded transition-all shadow-sm">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                get suggestions
            </button>
        `;
    },
    
    /**
     * Get AI insights content HTML
     */
    getAIInsightsContent(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const cached = this.aiExpenseInsightsCache[monthKey];
        
        if (this.aiInsightsLoading) {
            return `
                <div class="bg-purple-50 rounded-lg p-3 flex items-center gap-3">
                    <div class="flex-shrink-0 px-3 py-3 bg-purple-100 rounded-lg">
                        <div class="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p class="text-[11px] text-purple-600 leading-relaxed">analyzing your spending patterns, loans, EMIs and recurring payments...</p>
                </div>
            `;
        }
        
        if (cached) {
            return `
                <div class="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center shadow-sm">
                            <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div>
                            <span class="text-xs font-medium text-purple-700">AI insights</span>
                            <span class="text-[10px] text-gray-400 ml-2">${this.formatRelativeTime(cached.timestamp)}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="Dashboard.reloadAIInsights(${cached.year || new Date().getFullYear()}, ${cached.month || new Date().getMonth() + 2})" 
                                class="flex items-center gap-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-colors">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                        </button>
                        <button onclick="Dashboard.showAIInsightsModal(${cached.year || new Date().getFullYear()}, ${cached.month || new Date().getMonth() + 2})" 
                                class="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-sm">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                            view
                        </button>
                    </div>
                </div>
            `;
        }
        
        // Use passed year/month or fallback to next month
        const targetYear = year || this.getNextMonthYear();
        const targetMonth = month || this.getNextMonth();
        
        return `
            <div class="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                <div id="ai-insights-actions" class="flex-shrink-0">
                    <button onclick="Dashboard.fetchAIInsights(${targetYear}, ${targetMonth})" 
                            class="flex items-center gap-1.5 px-3 py-3 text-xs bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-lg transition-all shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        get suggestions
                    </button>
                </div>
                <p class="text-[11px] text-gray-500 leading-relaxed">click "get suggestions" to receive AI-powered insights for reducing your expenses next month.</p>
            </div>
        `;
    },
    
    /**
     * Show AI insights in a modal
     */
    showAIInsightsModal(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const cached = this.aiExpenseInsightsCache[monthKey];
        
        if (!cached) return;
        
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const formattedInsights = this.formatAIInsightsCollapsible(cached.insights);
        
        // Create or update modal
        let modal = document.getElementById('ai-insights-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-insights-modal';
            document.body.appendChild(modal);
        }
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10000] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden relative">
                <!-- Header -->
                <div class="p-5 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-xl">AI Financial Insights</h3>
                            <p class="text-xs text-white/90 mt-0.5">${monthName} • ${this.formatRelativeTime(cached.timestamp)}</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('ai-insights-modal').classList.add('hidden')" 
                            class="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-xl transition-all hover:scale-110">
                        ×
                    </button>
                </div>
                
                <!-- Content -->
                <div class="flex-1 overflow-y-auto px-3 py-5 bg-gray-50 pb-20">
                    <div class="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                        <div class="flex items-start gap-2">
                            <span class="text-blue-500 text-sm">ℹ️</span>
                            <div class="text-xs text-blue-700">
                                <span class="font-semibold">Data Period:</span> Projections based on last 6 months of expenses + Year-over-Year comparison
                            </div>
                        </div>
                    </div>
                    <div class="ai-insights-text">
                        ${formattedInsights}
                    </div>
                </div>
                
                <!-- Floating Refresh Button -->
                <button onclick="document.getElementById('ai-insights-modal').classList.add('hidden'); Dashboard.reloadAIInsights(${year}, ${month})" 
                        class="absolute bottom-4 right-4 w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-10 hover:scale-110"
                        title="Refresh Insights">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                </button>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Format AI insights text with beautiful, structured HTML
     */
    formatAIInsightsCollapsible(text) {
        if (!text) return '';
        
        // Split by section headers (emoji + bold text pattern)
        const headerPattern = /(\*\*[📊💡🔄🏦📈✅🎂].*?\*\*)/g;
        const sections = text.split(headerPattern).filter(s => s.trim());
        
        let html = '';
        
        sections.forEach((section, sectionIndex) => {
            // Check if this is a header (starts with ** and contains emoji)
            if (section.match(/^\*\*[📊💡🔄🏦📈✅🎂]/)) {
                const header = section.replace(/\*\*/g, '').trim();
                // Extract emoji - check if first character is an emoji
                let emoji = '';
                let title = header;
                
                // Try to extract emoji by checking first character
                // Common emojis used in headers
                const emojiChars = ['📊', '💡', '🔄', '🏦', '📈', '✅', '🎂'];
                for (const emojiChar of emojiChars) {
                    if (header.startsWith(emojiChar)) {
                        emoji = emojiChar;
                        title = header.substring(emojiChar.length).trim();
                        break;
                    }
                }
                
                // If no emoji found, try regex approach
                if (!emoji) {
                    const emojiRegex = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u;
                    const match = header.match(emojiRegex);
                    if (match) {
                        emoji = match[1];
                        title = header.substring(match[0].length).trim();
                    }
                }
                
                // Determine card color based on section type
                let cardColor = 'purple';
                let bgGradient = 'from-purple-50 to-purple-100';
                let borderColor = 'border-purple-200';
                
                if (header.includes('BUDGET') || header.includes('HEALTH')) {
                    cardColor = 'blue';
                    bgGradient = 'from-blue-50 to-blue-100';
                    borderColor = 'border-blue-200';
                } else if (header.includes('EXPENSE REDUCTIONS') || header.includes('EXPECTED')) {
                    cardColor = 'orange';
                    bgGradient = 'from-orange-50 to-orange-100';
                    borderColor = 'border-orange-200';
                } else if (header.includes('SUBSCRIPTION') || header.includes('LIFESTYLE')) {
                    cardColor = 'pink';
                    bgGradient = 'from-pink-50 to-pink-100';
                    borderColor = 'border-pink-200';
                } else if (header.includes('LOAN') || header.includes('EMI')) {
                    cardColor = 'indigo';
                    bgGradient = 'from-indigo-50 to-indigo-100';
                    borderColor = 'border-indigo-200';
                } else if (header.includes('INVESTMENT')) {
                    cardColor = 'emerald';
                    bgGradient = 'from-emerald-50 to-emerald-100';
                    borderColor = 'border-emerald-200';
                } else if (header.includes('PRIORITY') || header.includes('ACTION')) {
                    cardColor = 'green';
                    bgGradient = 'from-green-50 to-green-100';
                    borderColor = 'border-green-200';
                }
                
                // Clean title - remove any remaining emoji characters
                const cleanTitle = title.replace(/[📊💡🔄🏦📈✅🎂]/g, '').trim();
                
                html += `
                    <div class="mt-4 mb-3 bg-gradient-to-r ${bgGradient} border ${borderColor} rounded-xl px-3 py-2.5 shadow-sm">
                        <div class="flex items-center gap-2 mb-2">
                            ${emoji ? `<span class="text-xl" aria-hidden="true">${emoji}</span>` : ''}
                            <h3 class="font-bold text-${cardColor}-800 text-sm">${this.formatInlineText(cleanTitle)}</h3>
                        </div>
                `;
            } else {
                // This is content - parse and format beautifully
                const lines = section
                    .trim()
                    .split(/\n/)
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.match(/^(IF|ELSE|IF ALL|IF PROBLEMS|IF BELOW|IF AT|IF HIGH|IF LOANS)/i));
                
                if (lines.length > 0) {
                    html += `<div class="space-y-2.5">`;
                    
                    let i = 0;
                    while (i < lines.length) {
                        const line = lines[i];
                        const originalLine = line; // Keep original for fallback
                        
                        // Check for numbered items (1., 2., etc.) with full content
                        const numberedMatch = line.match(/^(\d+)\.\s*\*\*(.+?)\*\*\s*:\s*(.+)/);
                        const numberedSimple = line.match(/^(\d+)\.\s*(.+)/);
                        
                        // Check for bullet with bold title - but capture the ENTIRE line content
                        const bulletWithBold = line.match(/^•\s*\*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*(.*)/);
                        
                        // Check for arrow sub-items (→)
                        const arrowMatch = line.match(/^\s*→\s*(.+)/);
                        
                        // Check for key: value format (like "Needs: 55% actual vs 50% target")
                        const keyValueMatch = line.match(/^•\s*\*\*(.+?)\*\*\s*:\s*(.+)/);
                        const simpleKeyValue = line.match(/^•\s*(.+?):\s*(.+)/);
                        
                        if (numberedMatch) {
                            // Numbered action item with title and description
                            const formattedDesc = this.formatInlineText(numberedMatch[3]);
                            html += `
                                <div class="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                    <div class="flex items-start gap-3">
                                        <span class="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">${numberedMatch[1]}</span>
                                        <div class="flex-1">
                                            <div class="font-semibold text-gray-800 text-sm mb-1">${this.formatInlineText(numberedMatch[2])}</div>
                                            <div class="text-xs text-gray-600 leading-relaxed">${formattedDesc}</div>
                                        </div>
                                    </div>
                                </div>
                            `;
                            i++;
                        } else if (numberedSimple && !numberedMatch) {
                            // Simple numbered item - preserve full content
                            const formattedContent = this.formatInlineText(numberedSimple[2]);
                            html += `
                                <div class="flex items-start gap-2 pl-1">
                                    <span class="bg-purple-100 text-purple-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">${numberedSimple[1]}</span>
                                    <span class="text-xs text-gray-700 leading-relaxed flex-1">${formattedContent}</span>
                                </div>
                            `;
                            i++;
                        } else if (keyValueMatch) {
                            // Bullet with bold key and value (like "**Needs**: 55% actual vs 50% target")
                            const key = this.formatInlineText(keyValueMatch[1]);
                            const value = this.formatInlineText(keyValueMatch[2]);
                            html += `
                                <div class="flex items-start gap-2 text-xs text-gray-700 bg-white rounded-lg p-2 border border-gray-100">
                                    <span class="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                    <div class="flex-1">
                                        <span class="font-semibold text-gray-800">${key}:</span>
                                        <span class="ml-1">${value}</span>
                                    </div>
                                </div>
                            `;
                            i++;
                        } else if (simpleKeyValue) {
                            // Simple key: value format
                            const key = this.formatInlineText(simpleKeyValue[1]);
                            const value = this.formatInlineText(simpleKeyValue[2]);
                            html += `
                                <div class="flex items-start gap-2 text-xs text-gray-700 bg-white rounded-lg p-2 border border-gray-100">
                                    <span class="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                    <div class="flex-1">
                                        <span class="font-semibold text-gray-800">${key}:</span>
                                        <span class="ml-1">${value}</span>
                                    </div>
                                </div>
                            `;
                            i++;
                        } else if (bulletWithBold) {
                            // Main category/item - capture title, subtitle, AND any remaining content on same line
                            const mainTitle = this.formatInlineText(bulletWithBold[1]);
                            const subtitle = bulletWithBold[2] ? `(${bulletWithBold[2]})` : '';
                            const remainingContent = bulletWithBold[3] ? bulletWithBold[3].trim() : '';
                            
                            html += `
                                <div class="bg-white rounded-lg p-2.5 border border-gray-200">
                                    <div class="font-semibold text-gray-800 text-sm mb-1.5">
                                        <span class="text-purple-500 mr-1.5">•</span>
                                        ${mainTitle}
                                        ${subtitle ? `<span class="text-gray-500 text-xs font-normal ml-1">${subtitle}</span>` : ''}
                                        ${remainingContent ? `<span class="text-gray-600 text-xs font-normal ml-1">${this.formatInlineText(remainingContent)}</span>` : ''}
                                    </div>
                            `;
                            
                            // Collect sub-items (lines starting with →)
                            let subItems = [];
                            i++;
                            while (i < lines.length) {
                                const nextLine = lines[i];
                                if (nextLine.match(/^\s*→/)) {
                                    subItems.push(nextLine.trim());
                                    i++;
                                } else if (nextLine.match(/^•/) || nextLine.match(/^\d+\./)) {
                                    // Next main item
                                    break;
                                } else if (nextLine.trim().length === 0) {
                                    // Empty line
                                    i++;
                                } else {
                                    // Continuation or other content - include it
                                    subItems.push(nextLine);
                                    i++;
                                }
                            }
                            
                            if (subItems.length > 0) {
                                html += `<div class="ml-4 space-y-1.5 mt-1.5">`;
                                subItems.forEach(subItem => {
                                    const isArrow = subItem.match(/^→\s*(.+)/);
                                    const content = isArrow ? isArrow[1] : subItem.replace(/^→\s*/, '').trim();
                                    if (content) {
                                        const formattedContent = this.formatInlineText(content);
                                        html += `
                                            <div class="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5">
                                                <span class="text-blue-500 mt-0.5 flex-shrink-0">→</span>
                                                <span class="flex-1">${formattedContent}</span>
                                            </div>
                                        `;
                                    }
                                });
                                html += `</div>`;
                            }
                            html += `</div>`;
                        } else if (arrowMatch && i > 0) {
                            // Standalone arrow item
                            const formattedContent = this.formatInlineText(arrowMatch[1]);
                            html += `
                                <div class="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5 ml-4">
                                    <span class="text-blue-500 mt-0.5 flex-shrink-0">→</span>
                                    <span class="flex-1">${formattedContent}</span>
                                </div>
                            `;
                            i++;
                        } else {
                            // Regular bullet point or any other line - preserve ALL content
                            // Remove bullet marker but keep everything else
                            const cleanLine = line.replace(/^[-•]\s*/, '').trim();
                            if (cleanLine) {
                                const formattedLine = this.formatInlineText(cleanLine);
                                html += `
                                    <div class="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                                        <span class="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                        <span class="flex-1">${formattedLine}</span>
                                    </div>
                                `;
                            }
                            i++;
                        }
                    }
                    
                    html += `</div></div>`; // Close content div and card div
                } else {
                    html += `</div>`; // Close card if no content
                }
            }
        });
        
        return html || this.formatAIInsights(text);
    },
    
    /**
     * Format inline text with proper styling while preserving all content
     */
    formatInlineText(text) {
        if (!text) return '';
        
        // First handle markdown formatting (before HTML escaping)
        // Format bold text (**text**)
        text = text.replace(/\*\*(.*?)\*\*/g, '___BOLD_START___$1___BOLD_END___');
        
        // Now escape HTML to prevent XSS
        text = Utils.escapeHtml(text);
        
        // Restore bold formatting with HTML tags
        text = text.replace(/___BOLD_START___/g, '<strong class="text-gray-800 font-semibold">');
        text = text.replace(/___BOLD_END___/g, '</strong>');
        
        // Format currency (₹ followed by numbers) - after escaping
        text = text.replace(/₹(\d[\d,]*)/g, '<span class="text-green-600 font-bold">₹$1</span>');
        
        // Format arrows (→) - preserve the actual arrow character
        text = text.replace(/→/g, '<span class="text-blue-500 mx-0.5">→</span>');
        
        // Format percentages
        text = text.replace(/(\d+)%/g, '<span class="font-semibold">$1%</span>');
        
        // Emojis will display correctly as Unicode characters
        
        return text;
    },
    
    /**
     * Format AI insights text with proper HTML (fallback)
     */
    formatAIInsights(text) {
        if (!text) return '';
        
        // Convert markdown-style formatting to HTML
        return text
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Bullet points
            .replace(/^[-•]\s+(.*)$/gm, '<li class="ml-4">$1</li>')
            // Numbered lists
            .replace(/^(\d+)\.\s+(.*)$/gm, '<li class="ml-4"><span class="font-semibold">$1.</span> $2</li>')
            // Line breaks
            .replace(/\n\n/g, '</p><p class="mt-2">')
            .replace(/\n/g, '<br>')
            // Wrap in paragraph
            .replace(/^(.*)$/, '<p>$1</p>');
    },
    
    /**
     * Get next month's year
     */
    getNextMonthYear() {
        const now = new Date();
        return now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    },
    
    /**
     * Get next month (1-12)
     */
    getNextMonth() {
        const now = new Date();
        return now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    },
    
    /**
     * Format relative time
     */
    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    },
    
    /**
     * Fetch AI insights for expense reduction
     */
    async fetchAIInsights(year, month, forceReload = false) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        
        // Check cache unless force reload
        if (!forceReload && this.aiExpenseInsightsCache[monthKey]) {
            return;
        }
        
        // Check if AI is configured
        if (!window.AIProvider || !window.AIProvider.isConfigured()) {
            Utils.showError('Please configure AI provider in settings first');
            return;
        }
        
        this.aiInsightsLoading = true;
        this.updateAIInsightsUI(year, month);
        
        // Suppress AI provider info messages
        const previousSuppressState = window.AIProvider.suppressInfoMessages;
        window.AIProvider.suppressInfoMessages = true;
        
        try {
            // Prepare comprehensive expense data
            const analysisData = this.prepareExpenseAnalysisData(year, month);
            
            // Build the prompt
            const prompt = this.buildExpenseInsightsPrompt(analysisData, year, month);
            
            // Call AI
            const response = await window.AIProvider.call(prompt, null);
            
            // Cache the response (persisted to storage)
            this.aiExpenseInsightsCache[monthKey] = {
                insights: response,
                timestamp: Date.now(),
                year: year,
                month: month
            };
            window.Storage.save(); // Persist to storage
            
        } catch (error) {
            console.error('AI Insights error:', error);
            Utils.showError('Failed to get AI insights. Please try again.');
        } finally {
            // Restore AI provider info messages state
            window.AIProvider.suppressInfoMessages = previousSuppressState;
            this.aiInsightsLoading = false;
            this.updateAIInsightsUI(year, month);
        }
    },
    
    /**
     * Reload AI insights (force refresh)
     */
    reloadAIInsights(year, month) {
        this.fetchAIInsights(year, month, true);
    },
    
    /**
     * Update the AI insights UI in the modal
     */
    updateAIInsightsUI(year, month) {
        const actionsEl = document.getElementById('ai-insights-actions');
        const contentEl = document.getElementById('ai-insights-content');
        
        if (actionsEl) {
            actionsEl.innerHTML = this.getAIInsightsActions(year, month);
        }
        if (contentEl) {
            contentEl.innerHTML = this.getAIInsightsContent(year, month);
        }
    },
    
    /**
     * Mask sensitive data for AI (remove personal identifiers)
     */
    maskSensitiveData(text) {
        if (!text) return text;
        // Mask phone numbers, emails, account numbers
        return text
            .replace(/\b\d{10,}\b/g, '***')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***')
            .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '****-****-****-****');
    },
    
    /**
     * Prepare comprehensive expense analysis data for AI (with masking)
     */
    prepareExpenseAnalysisData(targetYear, targetMonth) {
        const data = {
            targetMonth: { year: targetYear, month: targetMonth },
            historicalExpenses: [],
            recurringPayments: [],
            loans: [],
            emis: [],
            categoryBreakdown: {},
            topExpenses: [],
            investments: [],
            insights: {}
        };
        
        // Categories to exclude (occasional, not continuous)
        const excludeCategories = ['Gifts', 'Gift', 'Gifting'];
        
        // Configuration: Number of months for analysis
        const ANALYSIS_MONTHS = 6;
        
        // Get last 6 months of expenses for recent trend
        const projectionData = this.getProjectedRegularExpensesWithDetails(ANALYSIS_MONTHS);
        data.historicalExpenses = projectionData.monthlyData || [];
        data.projectedAverage = projectionData.average;
        data.analysisMonths = ANALYSIS_MONTHS;
        
        // Get detailed expenses by category for last 6 months
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const analysisStartDate = new Date(today.getFullYear(), today.getMonth() - ANALYSIS_MONTHS, 1);
        
        const recentExpenses = expenses.filter(exp => {
            const expDate = new Date(exp.date);
            const cat = (exp.category || '').toLowerCase();
            // Exclude gift-related expenses
            const isGift = excludeCategories.some(g => cat.includes(g.toLowerCase()));
            return expDate >= analysisStartDate && expDate < new Date(today.getFullYear(), today.getMonth(), 1) && !isGift;
        });
        
        // Category breakdown with individual expense items
        const expensesByTitle = {}; // Group by title for detailed breakdown
        
        recentExpenses.forEach(exp => {
            const cat = exp.category || 'Other';
            const title = exp.title || 'Untitled';
            
            if (!data.categoryBreakdown[cat]) {
                data.categoryBreakdown[cat] = { total: 0, count: 0, avgPerTransaction: 0, items: {} };
            }
            data.categoryBreakdown[cat].total += parseFloat(exp.amount) || 0;
            data.categoryBreakdown[cat].count++;
            
            // Track individual items within each category
            if (!data.categoryBreakdown[cat].items[title]) {
                data.categoryBreakdown[cat].items[title] = { total: 0, count: 0 };
            }
            data.categoryBreakdown[cat].items[title].total += parseFloat(exp.amount) || 0;
            data.categoryBreakdown[cat].items[title].count++;
            
            // Also track overall by title
            if (!expensesByTitle[title]) {
                expensesByTitle[title] = { total: 0, count: 0, category: cat };
            }
            expensesByTitle[title].total += parseFloat(exp.amount) || 0;
            expensesByTitle[title].count++;
        });
        
        // Calculate averages
        Object.keys(data.categoryBreakdown).forEach(cat => {
            const info = data.categoryBreakdown[cat];
            info.avgPerTransaction = Math.round(info.total / info.count);
            info.monthlyAvg = Math.round(info.total / ANALYSIS_MONTHS);
            
            // Calculate averages for individual items
            Object.keys(info.items).forEach(title => {
                info.items[title].monthlyAvg = Math.round(info.items[title].total / ANALYSIS_MONTHS);
            });
        });
        
        // Top individual expenses (by title) for detailed breakdown
        data.topExpenses = Object.entries(expensesByTitle)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 15) // Top 15 expense titles
            .map(([title, info]) => ({
                title: title,
                category: info.category,
                total: info.total,
                count: info.count,
                monthlyAvg: Math.round(info.total / ANALYSIS_MONTHS)
            }));
        
        // Top expense categories with their top items
        data.topCategories = Object.entries(data.categoryBreakdown)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 8)
            .map(([cat, info]) => {
                // Get top items in this category
                const topItems = Object.entries(info.items || {})
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 5) // Top 5 items per category
                    .map(([title, itemInfo]) => ({
                        title: title,
                        total: itemInfo.total,
                        count: itemInfo.count,
                        monthlyAvg: itemInfo.monthlyAvg
                    }));
                
                return {
                    category: cat,
                    total: info.total,
                    count: info.count,
                    monthlyAvg: info.monthlyAvg,
                    topItems: topItems
                };
            });
        
        // Recurring payments with actual names
        if (window.RecurringExpenses) {
            const recurring = window.RecurringExpenses.getAll();
            data.recurringPayments = recurring
                .filter(r => r.isActive !== false)
                .filter(r => !excludeCategories.some(g => (r.category || '').toLowerCase().includes(g.toLowerCase())))
                .map(r => ({
                    name: r.title || r.name || 'Subscription',
                    category: r.category || 'Other',
                    amount: parseFloat(r.amount) || 0,
                    frequency: r.frequency
                }));
        }
        
        // Loans with actual names
        if (window.DB.loans && window.DB.loans.length > 0) {
            data.loans = window.DB.loans.map((loan) => {
                // Calculate EMI amount using the Loans module
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure && window.Loans) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                emiAmount = parseFloat(emiAmount) || 0;
                
                // Calculate remaining balance and months
                let remainingAmount = 0;
                let remainingMonths = 0;
                let paidEmis = 0;
                if (window.Loans && loan.firstEmiDate && loan.amount && loan.interestRate && loan.tenure) {
                    const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                    remainingAmount = remaining.remainingBalance || 0;
                    remainingMonths = remaining.emisRemaining || 0;
                    paidEmis = remaining.emisPaid || 0;
                }
                
                // Use actual loan name: "BankName LoanType" (e.g., "HDFC Home Loan", "SBI Personal Loan")
                const loanTypeDisplay = loan.loanType === 'Other' && loan.customLoanType 
                    ? loan.customLoanType 
                    : (loan.loanType || 'Loan');
                const loanName = `${loan.bankName || 'Unknown'} ${loanTypeDisplay}`;
                
                // Determine if this is a high-interest loan (bad loan)
                // Home loans: avg 8-9%, Personal: avg 12-15%, Credit Card: 15-24%
                const interestRate = parseFloat(loan.interestRate) || 0;
                let loanCategory = 'normal';
                if (loanTypeDisplay.toLowerCase().includes('personal') && interestRate > 15) {
                    loanCategory = 'high-interest';
                } else if (loanTypeDisplay.toLowerCase().includes('home') && interestRate > 10) {
                    loanCategory = 'high-interest';
                } else if (interestRate > 18) {
                    loanCategory = 'high-interest';
                }
                
                return {
                    name: loanName,
                    loanType: loanTypeDisplay,
                    reason: loan.reason || '',
                    emiAmount: Math.round(emiAmount),
                    remainingAmount: Math.round(remainingAmount),
                    totalAmount: Math.round(parseFloat(loan.amount) || 0),
                    totalTenure: loan.tenure || 0,
                    paidEmis: paidEmis,
                    remainingMonths: remainingMonths,
                    interestRate: interestRate,
                    loanCategory: loanCategory // 'normal' or 'high-interest'
                };
            }).filter(loan => loan.remainingMonths > 0); // Only include active loans
        }
        
        // EMIs from cards with actual names
        if (window.DB.cards) {
            window.DB.cards.forEach(card => {
                if (card.cardType === 'debit') return; // Skip debit cards
                if (card.emis && card.emis.length > 0) {
                    card.emis.forEach(emi => {
                        // Auto-update EMI progress
                        if (window.Cards && window.Cards.updateEMIProgress) {
                            window.Cards.updateEMIProgress(emi);
                        }
                        
                        const totalCount = emi.totalCount || emi.totalEmis || 0;
                        const paidCount = emi.paidCount || 0;
                        const remainingEmis = totalCount - paidCount;
                        
                        // Only include active EMIs with remaining payments
                        if (!emi.completed && remainingEmis > 0 && emi.emiAmount) {
                            // Use actual card and EMI name: "CardName - EMI Reason"
                            const emiName = `${card.nickname || card.name || 'Card'}: ${emi.reason || 'EMI'}`;
                            
                            data.emis.push({
                                name: emiName,
                                cardName: card.nickname || card.name || 'Card',
                                reason: emi.reason || '',
                                description: emi.description || '',
                                emiAmount: Math.round(parseFloat(emi.emiAmount) || 0),
                                paidEmis: paidCount,
                                remainingEmis: remainingEmis,
                                totalEmis: totalCount,
                                totalAmount: Math.round(parseFloat(emi.emiAmount) * totalCount)
                            });
                        }
                    });
                }
            });
        }
        
        // Investments data for the same period
        // Use getMonthInvestments which properly handles incomeMonth/incomeYear attribution
        const investmentsByMonth = {};
        const goldRate = window.DB.goldRatePerGram || 7000;
        const exchangeRate = typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : 83;
        
        for (let i = 1; i <= ANALYSIS_MONTHS; i++) {
            const analysisDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const invYear = analysisDate.getFullYear();
            const invMonth = analysisDate.getMonth() + 1;
            const monthKey = analysisDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const monthValue = `${invYear}-${String(invMonth).padStart(2, '0')}`;
            
            // Use the existing getMonthInvestments function
            const monthTotal = this.getMonthInvestments(monthValue);
            
            // Get investment items for type breakdown
            const monthItems = this.getMonthInvestmentItems ? this.getMonthInvestmentItems(monthValue) : [];
            const types = {};
            monthItems.forEach(item => {
                // Only include non-zero values with valid type
                if (item.amount && item.amount > 0 && item.type) {
                    const typeKey = item.type || 'Other';
                    types[typeKey] = (types[typeKey] || 0) + item.amount;
                }
            });
            
            // Only include month if there are actual investments
            if (monthTotal > 0) {
                investmentsByMonth[monthKey] = { 
                    total: Math.round(monthTotal), 
                    count: monthItems.filter(i => i.amount > 0).length, 
                    types: types 
                };
            }
        }
        
        // Calculate investment fluctuations and deviations
        const investmentMonths = Object.entries(investmentsByMonth)
            .map(([month, info]) => ({ month, amount: info.total, types: info.types }))
            .sort((a, b) => a.month.localeCompare(b.month));
        
        // Calculate fluctuations (month-to-month changes)
        const fluctuations = [];
        for (let i = 1; i < investmentMonths.length; i++) {
            const prev = investmentMonths[i - 1];
            const curr = investmentMonths[i];
            const change = curr.amount - prev.amount;
            const changePercent = prev.amount > 0 ? Math.round((change / prev.amount) * 100) : 0;
            fluctuations.push({
                from: prev.month,
                to: curr.month,
                change: change,
                changePercent: changePercent,
                trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
            });
        }
        
        // Find highest and lowest months
        const amounts = investmentMonths.map(m => m.amount);
        const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
        const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
        const maxMonth = investmentMonths.find(m => m.amount === maxAmount);
        const minMonth = investmentMonths.find(m => m.amount === minAmount);
        const variation = maxAmount - minAmount;
        const variationPercent = minAmount > 0 ? Math.round((variation / minAmount) * 100) : 0;
        
        // Create investments object with fluctuation data
        const totalInvestments = Object.values(investmentsByMonth).reduce((sum, m) => sum + (m.total || 0), 0);
        const monthlyAvg = ANALYSIS_MONTHS > 0 ? Math.round(totalInvestments / ANALYSIS_MONTHS) : 0;
        
        data.investments = {
            byMonth: investmentsByMonth,
            totalLastMonths: totalInvestments,
            monthlyAvg: monthlyAvg,
            // Fluctuation analysis
            fluctuations: fluctuations || [],
            highestMonth: maxMonth && maxAmount > 0 ? { month: maxMonth.month, amount: maxAmount } : null,
            lowestMonth: minMonth && minAmount > 0 ? { month: minMonth.month, amount: minAmount } : null,
            variation: variation || 0,
            variationPercent: variationPercent || 0,
            monthlyBreakdown: investmentMonths || []
        };
        
        // Budget Rule Analysis (Needs/Wants/Invest) for last 6 months
        const budgetRule = this.budgetRule; // User's target: e.g., 50/30/20
        data.budgetAnalysis = {
            targetRule: budgetRule,
            monthlyBreakdown: []
        };
        
        // Analyze each of the last 6 months
        for (let i = 1; i <= ANALYSIS_MONTHS; i++) {
            const analysisDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthYear = analysisDate.getFullYear();
            const monthNum = analysisDate.getMonth() + 1;
            const monthLabel = analysisDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            
            // Get income for this month using the correct function
            const incomeResult = this.getIncomeForExpenseComparison(monthYear, monthNum);
            const monthlyIncome = incomeResult.income || 0;
            
            // Get needs, wants for this month
            const needsTotal = this.getNeedsTotal(monthYear, monthNum);
            const wantsTotal = this.getWantsTotal(monthYear, monthNum);
            const monthInvestments = this.getMonthInvestments(`${monthYear}-${String(monthNum).padStart(2, '0')}`);
            
            // Calculate percentages
            const needsPercent = monthlyIncome > 0 ? Math.round((needsTotal / monthlyIncome) * 100) : 0;
            const wantsPercent = monthlyIncome > 0 ? Math.round((wantsTotal / monthlyIncome) * 100) : 0;
            const investPercent = monthlyIncome > 0 ? Math.round((monthInvestments / monthlyIncome) * 100) : 0;
            
            data.budgetAnalysis.monthlyBreakdown.push({
                month: monthLabel,
                income: monthlyIncome,
                needs: { amount: needsTotal, percent: needsPercent, target: budgetRule.needs },
                wants: { amount: wantsTotal, percent: wantsPercent, target: budgetRule.wants },
                invest: { amount: monthInvestments, percent: investPercent, target: budgetRule.invest },
                // Deviations from target
                needsDeviation: needsPercent - budgetRule.needs,
                wantsDeviation: wantsPercent - budgetRule.wants,
                investDeviation: investPercent - budgetRule.invest
            });
        }
        
        // Calculate averages for budget analysis
        const monthCount = data.budgetAnalysis.monthlyBreakdown.length || 1;
        const avgNeeds = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.needs.percent, 0) / monthCount);
        const avgWants = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.wants.percent, 0) / monthCount);
        const avgInvest = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.invest.percent, 0) / monthCount);
        const avgIncome = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.income, 0) / monthCount);
        
        data.budgetAnalysis.averages = {
            income: avgIncome,
            needsPercent: avgNeeds,
            wantsPercent: avgWants,
            investPercent: avgInvest,
            needsDeviation: avgNeeds - budgetRule.needs,
            wantsDeviation: avgWants - budgetRule.wants,
            investDeviation: avgInvest - budgetRule.invest
        };
        
        // Calculate target comparison for investments (AFTER budgetAnalysis is created)
        const investTargetPercent = budgetRule.invest; // e.g., 20%
        const targetComparisons = [];
        let targetMisses = 0;
        let targetHits = 0;
        
        // Match investment months with budget analysis months for target comparison
        if (data.budgetAnalysis && data.budgetAnalysis.monthlyBreakdown) {
            data.budgetAnalysis.monthlyBreakdown.forEach(monthData => {
                const investData = investmentMonths.find(m => m.month === monthData.month);
                const actualInvest = investData ? investData.amount : 0;
                const actualPercent = monthData.invest.percent;
                const targetAmount = monthData.income > 0 ? Math.round((monthData.income * investTargetPercent) / 100) : 0;
                const missedTarget = actualPercent < investTargetPercent;
                
                if (missedTarget) targetMisses++;
                else if (actualPercent >= investTargetPercent) targetHits++;
                
                targetComparisons.push({
                    month: monthData.month,
                    income: monthData.income,
                    actualAmount: actualInvest,
                    actualPercent: actualPercent,
                    targetAmount: targetAmount,
                    targetPercent: investTargetPercent,
                    missedTarget: missedTarget,
                    deviation: actualPercent - investTargetPercent,
                    gapAmount: Math.max(0, targetAmount - actualInvest)
                });
            });
        }
        
        // Calculate severity metrics
        const totalMonths = targetComparisons.length;
        const missRate = totalMonths > 0 ? (targetMisses / totalMonths) * 100 : 0;
        const severity = missRate >= 50 ? 'critical' : missRate >= 30 ? 'serious' : missRate > 0 ? 'moderate' : 'none';
        
        // Add target comparison to investments object (ensure it exists first)
        if (!data.investments) {
            data.investments = {};
        }
        data.investments.targetPercent = investTargetPercent;
        data.investments.targetComparisons = targetComparisons;
        data.investments.targetMisses = targetMisses;
        data.investments.targetHits = targetHits;
        data.investments.missRate = Math.round(missRate);
        data.investments.severity = severity;
        
        // Calculate insights
        const totalRecurring = data.recurringPayments.reduce((sum, r) => sum + r.amount, 0);
        const totalLoans = data.loans.reduce((sum, l) => sum + l.emiAmount, 0);
        const totalEmis = data.emis.reduce((sum, e) => sum + e.emiAmount, 0);
        const totalFixed = totalRecurring + totalLoans + totalEmis;
        
        data.insights = {
            totalRecurring,
            totalLoans,
            totalEmis,
            totalFixed,
            variableExpenses: data.projectedAverage,
            totalProjected: totalFixed + data.projectedAverage,
            investmentRate: data.investments.monthlyAvg,
            avgMonthlyIncome: avgIncome,
            savingsAfterExpenses: data.projectedAverage > 0 ? Math.round((data.investments.monthlyAvg / data.projectedAverage) * 100) : 0
        };
        
        // Add Year-over-Year comparison data
        // Use the passed targetMonth parameter (the month we're analyzing for)
        data.yearOverYear = this.getYearOverYearData(targetMonth);
        
        // Add detected annual patterns
        data.annualPatterns = this.detectAnnualPatterns(targetMonth);
        
        return data;
    },
    
    /**
     * Get Year-over-Year expense data for the same month from previous years
     * @param {number} targetMonth - Month to analyze (1-12)
     */
    getYearOverYearData(targetMonth) {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const result = {
            hasData: false,
            years: []
        };
        
        // Check last 2 years for the same month
        for (let yearsAgo = 1; yearsAgo <= 2; yearsAgo++) {
            const targetYear = currentYear - yearsAgo;
            const yearData = {
                year: targetYear,
                month: targetMonth,
                label: new Date(targetYear, targetMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                totalSpent: 0,
                expenses: [],
                categoryBreakdown: {}
            };
            
            // Filter expenses for this month/year
            const monthExpenses = expenses.filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getFullYear() === targetYear && (expDate.getMonth() + 1) === targetMonth;
            });
            
            if (monthExpenses.length > 0) {
                result.hasData = true;
                
                // Calculate totals and breakdown
                monthExpenses.forEach(exp => {
                    const amount = parseFloat(exp.amount) || 0;
                    yearData.totalSpent += amount;
                    
                    // Category breakdown
                    const cat = exp.category || 'Other';
                    if (!yearData.categoryBreakdown[cat]) {
                        yearData.categoryBreakdown[cat] = { total: 0, count: 0, items: [] };
                    }
                    yearData.categoryBreakdown[cat].total += amount;
                    yearData.categoryBreakdown[cat].count++;
                    yearData.categoryBreakdown[cat].items.push({
                        title: exp.title || 'Untitled',
                        amount: amount,
                        date: exp.date
                    });
                });
                
                // Get top expenses for this month
                yearData.expenses = monthExpenses
                    .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
                    .slice(0, 10)
                    .map(exp => ({
                        title: exp.title || 'Untitled',
                        category: exp.category || 'Other',
                        amount: parseFloat(exp.amount) || 0,
                        date: exp.date
                    }));
                
                // Sort categories by total spend
                yearData.topCategories = Object.entries(yearData.categoryBreakdown)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 5)
                    .map(([cat, info]) => ({
                        category: cat,
                        total: Math.round(info.total),
                        count: info.count
                    }));
                
                yearData.totalSpent = Math.round(yearData.totalSpent);
                result.years.push(yearData);
            }
        }
        
        return result;
    },
    
    /**
     * Detect recurring annual patterns for a specific month
     * Analyzes expenses across multiple years to find patterns
     * @param {number} targetMonth - Month to analyze (1-12)
     */
    detectAnnualPatterns(targetMonth) {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const result = {
            hasPatterns: false,
            patterns: [],
            monthName: new Date(2024, targetMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' })
        };
        
        // Collect expenses for this month across all available years
        const yearlyData = {};
        const categoryYearlySpend = {};
        const titleYearlySpend = {};
        
        expenses.forEach(exp => {
            const expDate = new Date(exp.date);
            const expMonth = expDate.getMonth() + 1;
            const expYear = expDate.getFullYear();
            
            // Only consider this specific month
            if (expMonth !== targetMonth) return;
            
            // Only look at data from previous years (not current year)
            if (expYear >= currentYear) return;
            
            const amount = parseFloat(exp.amount) || 0;
            const category = exp.category || 'Other';
            const title = exp.title || 'Untitled';
            
            // Track by year
            if (!yearlyData[expYear]) {
                yearlyData[expYear] = { total: 0, count: 0 };
            }
            yearlyData[expYear].total += amount;
            yearlyData[expYear].count++;
            
            // Track category spending per year
            if (!categoryYearlySpend[category]) {
                categoryYearlySpend[category] = {};
            }
            if (!categoryYearlySpend[category][expYear]) {
                categoryYearlySpend[category][expYear] = { total: 0, count: 0, items: [] };
            }
            categoryYearlySpend[category][expYear].total += amount;
            categoryYearlySpend[category][expYear].count++;
            categoryYearlySpend[category][expYear].items.push({ title, amount });
            
            // Track specific expense titles per year
            if (!titleYearlySpend[title]) {
                titleYearlySpend[title] = { category, years: {} };
            }
            if (!titleYearlySpend[title].years[expYear]) {
                titleYearlySpend[title].years[expYear] = 0;
            }
            titleYearlySpend[title].years[expYear] += amount;
        });
        
        const yearsWithData = Object.keys(yearlyData).length;
        
        // Need at least 1 year of historical data for the same month
        if (yearsWithData < 1) {
            return result;
        }
        
        result.hasPatterns = true;
        result.yearsAnalyzed = yearsWithData;
        
        // Detect category patterns (categories that spike in this month)
        Object.entries(categoryYearlySpend).forEach(([category, yearData]) => {
            const yearsPresent = Object.keys(yearData).length;
            
            // Pattern: Category appears in this month across multiple years
            if (yearsPresent >= 1) {
                const totalAcrossYears = Object.values(yearData).reduce((s, y) => s + y.total, 0);
                const avgSpend = Math.round(totalAcrossYears / yearsPresent);
                const countAcrossYears = Object.values(yearData).reduce((s, y) => s + y.count, 0);
                
                // Get most common items in this category for this month
                const allItems = {};
                Object.values(yearData).forEach(y => {
                    y.items.forEach(item => {
                        if (!allItems[item.title]) {
                            allItems[item.title] = { total: 0, count: 0 };
                        }
                        allItems[item.title].total += item.amount;
                        allItems[item.title].count++;
                    });
                });
                
                const topItems = Object.entries(allItems)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 3)
                    .map(([title, info]) => ({
                        title,
                        avgAmount: Math.round(info.total / yearsPresent)
                    }));
                
                // Only include significant patterns (above ₹500 average)
                if (avgSpend > 500) {
                    result.patterns.push({
                        type: 'category',
                        category: category,
                        yearsDetected: yearsPresent,
                        avgSpend: avgSpend,
                        totalTransactions: countAcrossYears,
                        topItems: topItems,
                        confidence: yearsPresent >= 2 ? 'high' : 'medium',
                        description: `${category} spending typically increases in ${result.monthName}`
                    });
                }
            }
        });
        
        // Detect specific recurring expense titles (same expense every year)
        Object.entries(titleYearlySpend).forEach(([title, data]) => {
            const yearsPresent = Object.keys(data.years).length;
            
            // Strong pattern: Same expense title appears in multiple years
            if (yearsPresent >= 2) {
                const totalAcrossYears = Object.values(data.years).reduce((s, amt) => s + amt, 0);
                const avgAmount = Math.round(totalAcrossYears / yearsPresent);
                
                // Only include significant patterns
                if (avgAmount > 1000) {
                    result.patterns.push({
                        type: 'recurring_expense',
                        title: title,
                        category: data.category,
                        yearsDetected: yearsPresent,
                        avgAmount: avgAmount,
                        yearlyAmounts: data.years,
                        confidence: 'high',
                        description: `"${title}" is a recurring annual expense in ${result.monthName}`
                    });
                }
            }
        });
        
        // Sort patterns by average spend (highest first)
        result.patterns.sort((a, b) => (b.avgSpend || b.avgAmount || 0) - (a.avgSpend || a.avgAmount || 0));
        
        // Keep top 10 patterns
        result.patterns = result.patterns.slice(0, 10);
        
        return result;
    },
    
    /**
     * Build the prompt for expense insights
     */
    buildExpenseInsightsPrompt(data, year, month) {
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Build detailed category breakdown with individual items
        let categoryDetailText = data.topCategories.map(c => {
            let text = `\n**${c.category}** - ₹${Math.round(c.monthlyAvg).toLocaleString()}/month (${c.count} transactions):`;
            if (c.topItems && c.topItems.length > 0) {
                c.topItems.forEach(item => {
                    text += `\n  - ${item.title}: ₹${Math.round(item.monthlyAvg).toLocaleString()}/month (${item.count} times)`;
                });
            }
            return text;
        }).join('\n');
        
        // Build top individual expenses list
        const analysisMonths = data.analysisMonths || 6;
        let topExpensesText = '';
        if (data.topExpenses && data.topExpenses.length > 0) {
            topExpensesText = data.topExpenses.map(e => 
                `• ${e.title} (${e.category}): ₹${Math.round(e.monthlyAvg).toLocaleString()}/month - ${e.count} times in ${analysisMonths} months`
            ).join('\n');
        }
        
        // Build recurring payments with actual names
        let recurringText = '';
        if (data.recurringPayments.length > 0) {
            // Sort by amount descending and list each subscription by name
            recurringText = data.recurringPayments
                .sort((a, b) => b.amount - a.amount)
                .map(r => `• ${r.name} (${r.category}): ₹${Math.round(r.amount).toLocaleString()}/${r.frequency || 'month'}`)
                .join('\n');
        }
        
        // Build loans summary - separate into problem loans and healthy loans
        const problemLoans = data.loans.filter(l => l.loanCategory === 'high-interest');
        const healthyLoans = data.loans.filter(l => l.loanCategory !== 'high-interest');
        const endingSoonLoans = data.loans.filter(l => l.remainingMonths <= 3 && l.remainingMonths > 0);
        
        let loansText = '';
        if (data.loans.length > 0) {
            // Quick summary line
            loansText = `**Summary**: ${data.loans.length} active loan(s), Total EMI: ₹${Math.round(data.insights.totalLoans).toLocaleString()}/month\n\n`;
            
            // Only show detailed info for problem loans
            if (problemLoans.length > 0) {
                loansText += `⚠️ **NEEDS ATTENTION** (High Interest):\n`;
                loansText += problemLoans.map(l => {
                    let text = `• ${l.name}: ₹${Math.round(l.emiAmount).toLocaleString()}/month @ **${l.interestRate}%** (${l.paidEmis}/${l.totalTenure} paid)`;
                    text += `\n  → Balance: ₹${Math.round(l.remainingAmount).toLocaleString()} | Consider pre-closure`;
                    return text;
                }).join('\n');
                loansText += '\n\n';
            }
            
            // Show loans ending soon
            if (endingSoonLoans.length > 0) {
                loansText += `🎉 **ENDING SOON** (≤3 months left):\n`;
                loansText += endingSoonLoans.map(l => 
                    `• ${l.name}: ${l.remainingMonths} EMI(s) left (₹${Math.round(l.remainingAmount).toLocaleString()} remaining)`
                ).join('\n');
                loansText += '\n\n';
            }
            
            // Brief list of healthy loans (no action needed)
            if (healthyLoans.length > 0 && problemLoans.length === 0) {
                loansText += `✓ **On Track**: `;
                loansText += healthyLoans.map(l => `${l.name} (${l.interestRate}%)`).join(', ');
                loansText += ' - No action needed';
            }
        } else {
            loansText = 'No active loans ✓';
        }
        
        // Build EMIs summary - similar approach
        const endingSoonEmis = data.emis.filter(e => e.remainingEmis <= 2 && e.remainingEmis > 0);
        
        let emisText = '';
        if (data.emis.length > 0) {
            emisText = `**Summary**: ${data.emis.length} active EMI(s), Total: ₹${Math.round(data.insights.totalEmis).toLocaleString()}/month\n\n`;
            
            // Show EMIs ending soon
            if (endingSoonEmis.length > 0) {
                emisText += `🎉 **ENDING SOON**:\n`;
                emisText += endingSoonEmis.map(e => 
                    `• ${e.name}: ${e.remainingEmis} EMI(s) left`
                ).join('\n');
                emisText += '\n\n';
            }
            
            // Brief list of ongoing EMIs
            const ongoingEmis = data.emis.filter(e => e.remainingEmis > 2);
            if (ongoingEmis.length > 0) {
                emisText += `📋 **Ongoing**: `;
                emisText += ongoingEmis.map(e => `${e.name} (${e.paidEmis}/${e.totalEmis})`).join(', ');
            }
        } else {
            emisText = 'No active card EMIs ✓';
        }
        
        // Build investments summary - only show months with actual investments
        let investText = '';
        if (data.investments && data.investments.byMonth) {
            const months = Object.entries(data.investments.byMonth).filter(([_, info]) => info.total > 0);
            if (months.length > 0) {
                investText = months.map(([month, info]) => {
                    let text = `• **${month}**: ₹${Math.round(info.total).toLocaleString()} total`;
                    if (Object.keys(info.types).length > 0) {
                        const typeBreakdown = Object.entries(info.types)
                            .filter(([t, amt]) => t && t !== 'undefined' && t !== 'null' && amt > 0)
                            .map(([t, amt]) => `  - ${t || 'Other'}: ₹${Math.round(amt).toLocaleString()}`)
                            .join('\n');
                        if (typeBreakdown) {
                            text += `\n${typeBreakdown}`;
                        }
                    }
                    return text;
                }).join('\n\n');
            } else {
                investText = 'No investments recorded in last 3 months';
            }
        }
        
        // Build budget rule analysis - only show problematic categories
        let budgetText = '';
        if (data.budgetAnalysis && data.budgetAnalysis.monthlyBreakdown) {
            const rule = data.budgetAnalysis.targetRule;
            const avg = data.budgetAnalysis.averages;
            
            budgetText = `Target Budget: ${rule.needs}% Needs / ${rule.wants}% Wants / ${rule.invest}% Invest\n`;
            budgetText += `Average Income (${analysisMonths} months): ₹${Math.round(avg.income).toLocaleString()}/month\n\n`;
            
            // Only show categories that are problematic
            const problems = [];
            
            if (avg.needsDeviation > 0) {
                problems.push({
                    category: 'Needs',
                    actual: avg.needsPercent,
                    target: rule.needs,
                    deviation: avg.needsDeviation,
                    amount: Math.round((avg.needsDeviation/100) * avg.income),
                    type: 'over'
                });
            }
            
            if (avg.wantsDeviation > 0) {
                problems.push({
                    category: 'Wants',
                    actual: avg.wantsPercent,
                    target: rule.wants,
                    deviation: avg.wantsDeviation,
                    amount: Math.round((avg.wantsDeviation/100) * avg.income),
                    type: 'over'
                });
            }
            
            if (avg.investDeviation < 0) {
                problems.push({
                    category: 'Invest',
                    actual: avg.investPercent,
                    target: rule.invest,
                    deviation: Math.abs(avg.investDeviation),
                    amount: Math.round((Math.abs(avg.investDeviation)/100) * avg.income),
                    type: 'under'
                });
            }
            
            if (problems.length > 0) {
                budgetText += `⚠️ **BUDGET ISSUES DETECTED**:\n`;
                problems.forEach(p => {
                    if (p.type === 'over') {
                        budgetText += `• ${p.category}: ${p.actual}% actual vs ${p.target}% target → **OVER by ${p.deviation}%** (₹${p.amount.toLocaleString()}/month)\n`;
                    } else {
                        budgetText += `• ${p.category}: ${p.actual}% actual vs ${p.target}% target → **UNDER by ${p.deviation}%** (₹${p.amount.toLocaleString()}/month gap)\n`;
                    }
                });
            } else {
                budgetText += `✓ **All categories within budget** - Great job!\n`;
            }
            
            // Show investment appreciation if above target
            if (avg.investDeviation > 0) {
                budgetText += `\n🎉 **Investment**: ${avg.investPercent}% actual vs ${rule.invest}% target → **EXCEEDING by ${avg.investDeviation}%** (₹${Math.round((avg.investDeviation/100) * avg.income).toLocaleString()}/month extra) - Excellent!\n`;
            }
        }
        
        // Build Year-over-Year comparison text
        let yoyText = '';
        if (data.yearOverYear && data.yearOverYear.hasData) {
            yoyText = data.yearOverYear.years.map(yearData => {
                let text = `**${yearData.label}**: Total spent ₹${yearData.totalSpent.toLocaleString()}\n`;
                
                // Top categories for that month
                if (yearData.topCategories && yearData.topCategories.length > 0) {
                    text += '  Top spending categories:\n';
                    yearData.topCategories.forEach(cat => {
                        text += `  • ${cat.category}: ₹${cat.total.toLocaleString()} (${cat.count} transactions)\n`;
                    });
                }
                
                // Notable high expenses
                if (yearData.expenses && yearData.expenses.length > 0) {
                    const highExpenses = yearData.expenses.filter(e => e.amount > 2000).slice(0, 5);
                    if (highExpenses.length > 0) {
                        text += '  Notable expenses:\n';
                        highExpenses.forEach(exp => {
                            text += `  • ${exp.title} (${exp.category}): ₹${Math.round(exp.amount).toLocaleString()}\n`;
                        });
                    }
                }
                
                return text;
            }).join('\n');
        } else {
            yoyText = 'No historical data available for this month from previous years.';
        }
        
        // Build Annual Patterns text
        let patternsText = '';
        if (data.annualPatterns && data.annualPatterns.hasPatterns) {
            const patterns = data.annualPatterns.patterns;
            if (patterns.length > 0) {
                patternsText = patterns.map(p => {
                    if (p.type === 'recurring_expense') {
                        return `• **RECURRING ANNUAL**: "${p.title}" (${p.category})\n  - Detected in ${p.yearsDetected} years\n  - Average amount: ₹${p.avgAmount.toLocaleString()}\n  - Confidence: ${p.confidence.toUpperCase()}\n  - ${p.description}`;
                    } else {
                        let text = `• **CATEGORY SPIKE**: ${p.category}\n  - Detected in ${p.yearsDetected} year(s)\n  - Average spend: ₹${p.avgSpend.toLocaleString()}\n  - Confidence: ${p.confidence.toUpperCase()}`;
                        if (p.topItems && p.topItems.length > 0) {
                            text += '\n  - Typical expenses:';
                            p.topItems.forEach(item => {
                                text += `\n    · ${item.title}: ~₹${item.avgAmount.toLocaleString()}`;
                            });
                        }
                        return text;
                    }
                }).join('\n\n');
            }
        } else {
            patternsText = 'No recurring annual patterns detected for this month (need more historical data).';
        }
        
        return `You are a personal finance advisor analyzing detailed spending data. Provide SPECIFIC, ACTIONABLE insights based on the actual expense names and amounts below.

**IMPORTANT**: All projections and averages are based on the last ${analysisMonths} months of actual expense data, plus Year-over-Year comparison from previous years for the same month.

## BUDGET RULE ANALYSIS (${data.budgetAnalysis?.targetRule?.needs || 50}/${data.budgetAnalysis?.targetRule?.wants || 30}/${data.budgetAnalysis?.targetRule?.invest || 20} Rule)
${budgetText || 'No budget data'}

## EXPENSE TREND (Last ${analysisMonths} Months)
${data.historicalExpenses.map(h => `• ${h.label}: ₹${Math.round(h.amount).toLocaleString()}`).join('\n')}
→ Monthly Average: ₹${Math.round(data.projectedAverage).toLocaleString()}

## YEAR-OVER-YEAR COMPARISON (Same month from previous years)
${yoyText}

## DETECTED ANNUAL PATTERNS FOR ${monthName.toUpperCase()}
These are recurring expenses/patterns detected in the same month from previous years:
${patternsText}

## DETAILED CATEGORY BREAKDOWN (with individual expenses)
${categoryDetailText || 'No category data'}

## TOP 15 INDIVIDUAL EXPENSES (by monthly spend)
${topExpensesText || 'No individual expense data'}

## FIXED MONTHLY OBLIGATIONS
Recurring (Total: ₹${Math.round(data.insights.totalRecurring).toLocaleString()}/month):
${recurringText || 'None'}

Loans (Total: ₹${Math.round(data.insights.totalLoans).toLocaleString()}/month):
${loansText}

Card EMIs (Total: ₹${Math.round(data.insights.totalEmis).toLocaleString()}/month):
${emisText}

## INVESTMENTS (Last ${analysisMonths} Months)
${investText || 'No investment data'}

Investment Fluctuations Analysis:
${data.investments?.fluctuations && data.investments.fluctuations.length > 0 ? data.investments.fluctuations.map(f => 
    `• ${f.from} → ${f.to}: ${f.change >= 0 ? '+' : ''}₹${Math.round(f.change).toLocaleString()} (${f.changePercent >= 0 ? '+' : ''}${f.changePercent}%) - ${f.trend}`
).join('\n') : '• No fluctuations detected (consistent investments)'}

${data.investments?.highestMonth ? `• Highest: ${data.investments.highestMonth.month} - ₹${Math.round(data.investments.highestMonth.amount).toLocaleString()}` : ''}
${data.investments?.lowestMonth ? `• Lowest: ${data.investments.lowestMonth.month} - ₹${Math.round(data.investments.lowestMonth.amount).toLocaleString()}` : ''}
${data.investments?.variation ? `• Variation Range: ₹${Math.round(data.investments.variation).toLocaleString()} (${data.investments.variationPercent >= 0 ? '+' : ''}${data.investments.variationPercent}% difference)` : ''}

## PROJECTION FOR ${monthName.toUpperCase()}
• Avg Monthly Income: ₹${Math.round(data.insights.avgMonthlyIncome || 0).toLocaleString()}
• Fixed costs: ₹${Math.round(data.insights.totalFixed).toLocaleString()}
• Variable (est): ₹${Math.round(data.insights.variableExpenses).toLocaleString()}
• Total Expected: ₹${Math.round(data.insights.totalProjected).toLocaleString()}

---
RESPOND IN THIS EXACT FORMAT. Use proper hierarchical bullet points with indentation. DO NOT use HTML tables.

**📊 BUDGET HEALTH ANALYSIS**
(Only mention categories that are problematic - over budget for spending)

IF PROBLEMS EXIST:
• **Needs**: X% actual vs Y% target → ⚠️ **OVER by Z%** = ₹[amount]/month
• **Wants**: X% actual vs Y% target → ⚠️ **OVER by Z%** = ₹[amount]/month
• **Key Issue**: [One-line summary of main budget problem]
• **Total Over Budget**: ₹[amount]/month across all categories

IF ALL GOOD:
• ✓ All spending categories within budget - Great job!

**🎂 EXPECTED ANNUAL EVENTS FOR ${monthName.toUpperCase()}**
Based on Year-over-Year data and detected patterns, list expected expenses:
• **[Event/Occasion]**: ~₹X expected (based on [year] data)
  → Last year spent: ₹Y on [category/items]
  → **Recommendation**: [Budget accordingly / Set aside funds]
• **[Recurring Annual Expense]**: ~₹X expected
  → Pattern: Occurs every ${monthName.split(' ')[0]}
  → **Tip**: [Plan in advance / Compare prices]
• **Total Expected Annual Expenses This Month: ~₹X**
(If no patterns detected, state: "No specific annual patterns detected for this month")

**💡 REALISTIC EXPENSE REDUCTIONS FOR ${monthName.toUpperCase()}**
Focus ONLY on discretionary spending the USER can personally limit. Group each expense with its action plan using proper indentation:

• **Swiggy** (Food Delivery)
  → Current: ₹5,000/month | Target: ₹3,000/month | Savings: ₹2,000/month
  → **Action**: Cook at home 3 days more per week instead of ordering

• **Amazon** (Online Shopping)
  → Current: ₹8,000/month | Target: ₹5,000/month | Savings: ₹3,000/month
  → **Action**: Create wishlist, wait 48 hours before purchasing, avoid impulse buys

(List 3-5 expenses that USER can control through their own habits)

**Total Potential Savings: ₹X/month**

**🔄 SUBSCRIPTION & LIFESTYLE REVIEW**
• [Subscription 1]: ₹X/month - [Keep/Pause/Cancel recommendation with reason]
• [Subscription 2]: ₹X/month - [Keep/Pause/Cancel recommendation with reason]
• Redundant subscriptions found: [List if multiple similar services]
• Potential subscription savings: ₹X/month

**🏦 LOAN & EMI STATUS**
(Only include this section if there are actionable items - high interest loans, pre-closure opportunities, or loans ending soon)

IF HIGH INTEREST LOANS EXIST:
• **⚠️ [Loan Name]**: Consider pre-closure
  → Current rate: X% (above Y% benchmark for this loan type)
  → Balance: ₹Z remaining
  → **Action**: [Specific pre-closure advice with amount if lump sum available]

IF LOANS ENDING SOON (≤3 months):
• **🎉 [Loan Name]**: Almost done!
  → X EMI(s) remaining
  → **Tip**: [e.g., "After this, redirect ₹X to investments"]

IF ALL LOANS ARE HEALTHY:
• ✓ All loans on track with competitive interest rates - no action needed

LOAN INTEREST BENCHMARKS:
→ Home: <9% good | Personal: <12% good | Card EMI: 12-18% typical | >18%: Pre-close priority

**📈 INVESTMENT HEALTH ANALYSIS**
(Focus on fluctuation patterns, target comparison, and investment health)

CRITICAL TARGET COMPARISON ANALYSIS REQUIRED:
1. **Target Miss Analysis**:
   - Compare each month's investment % against target ${data.investments?.targetPercent || 20}%
   - Count how many months missed the target: ${data.investments?.targetMisses || 0} out of ${data.investments?.targetComparisons?.length || 0} months
   - Calculate miss rate: ${data.investments?.missRate || 0}%
   - Identify severity level based on miss rate:
     * **Critical (≥50% misses)**: Serious planning issue - investment discipline is severely lacking
     * **Serious (30-49% misses)**: Significant planning gaps - needs immediate attention
     * **Moderate (1-29% misses)**: Occasional misses - investigate root causes
     * **None (0% misses)**: Excellent - all months met target

2. **Month-by-Month Target Comparison**:
${data.investments?.targetComparisons && data.investments.targetComparisons.length > 0 ? data.investments.targetComparisons.map(tc => {
    const status = tc.missedTarget ? '❌ MISSED' : '✅ MET';
    const gap = tc.missedTarget ? ` (Gap: ₹${Math.round(tc.gapAmount).toLocaleString()})` : '';
    return `   → ${tc.month}: ${tc.actualPercent}% actual vs ${tc.targetPercent}% target ${status}${gap}`;
}).join('\n') : '   → No investment data available'}

3. **Severity Assessment**:
   - Current Severity: **${data.investments?.severity ? data.investments.severity.toUpperCase() : 'UNKNOWN'}**
   - Miss Rate: ${data.investments?.missRate || 0}% (${data.investments?.targetMisses || 0} months missed out of ${data.investments?.targetComparisons?.length || 0})
   - Interpretation:
     ${data.investments?.severity === 'critical' ? '⚠️ **CRITICAL**: More than half the months missed target - this indicates a serious planning issue. Investment discipline needs immediate correction.' : ''}
     ${data.investments?.severity === 'serious' ? '⚠️ **SERIOUS**: Significant portion of months missed target - planning gaps need attention.' : ''}
     ${data.investments?.severity === 'moderate' ? 'ℹ️ **MODERATE**: Occasional target misses - investigate root causes for those specific months.' : ''}
     ${data.investments?.severity === 'none' ? '✅ **EXCELLENT**: All months met or exceeded target - great investment discipline!' : ''}

CRITICAL FLUCTUATION ANALYSIS REQUIRED:
1. **Month-to-Month Changes**: 
   - Identify each significant fluctuation with exact amounts
   - Example: "Nov → Dec: Dropped ₹15,000 (40% decrease) - likely due to holiday spending"
   - Example: "Jan → Feb: Increased ₹8,000 (25% increase) - good recovery"
   - Highlight consecutive months with same trend (e.g., "3 months of decline")

2. **Fluctuation Pattern Assessment**:
   - **Consistent Pattern**: "Investments stable at ₹X/month - excellent discipline"
   - **Increasing Trend**: "Investments growing from ₹X to ₹Y over ${analysisMonths} months - positive momentum"
   - **Decreasing Trend**: "Investments declining from ₹X to ₹Y - needs immediate attention"
   - **Irregular Pattern**: "Investments vary ₹X to ₹Y - indicates inconsistent saving habits"

3. **Health Diagnosis** (Be Specific):
   - **Peak Performance**: "Highest investment ₹X in [month] - replicate this month's approach"
   - **Lowest Point**: "Lowest investment ₹X in [month] - identify what caused the drop"
   - **Volatility**: "Variation range ₹X (Y% difference) - [High/Moderate/Low] volatility indicates [assessment]"
   - **Consistency Score**: "X out of ${analysisMonths} months show consistent investment - [Good/Needs Improvement]"

4. **Root Cause Analysis**:
   - If declining: "Decline started in [month] - check if expenses increased or income decreased"
   - If irregular: "No consistent pattern - likely manual investments without automation"
   - If increasing: "Positive trend suggests improving financial discipline"

5. **Specific Actionable Recommendations**:
   - Address fluctuation root cause: "Set up auto-SIP of ₹X/month to eliminate ₹Y variation"
   - Stabilize pattern: "Your investments range ₹X-₹Y - aim for consistent ₹Z/month (mid-point)"
   - Build on success: "You invested ₹X in [best month] - maintain this level monthly"
   - Fix decline: "Reverse the ₹X/month decline by reducing [specific expense category] by ₹Y"

FORMAT (Use exact data from fluctuations):
• **Fluctuation Pattern**: [Increasing/Decreasing/Irregular/Stable] trend
  → Highest: ₹${data.investments?.highestMonth ? Math.round(data.investments.highestMonth.amount).toLocaleString() : 'N/A'} in ${data.investments?.highestMonth?.month || 'N/A'}
  → Lowest: ₹${data.investments?.lowestMonth ? Math.round(data.investments.lowestMonth.amount).toLocaleString() : 'N/A'} in ${data.investments?.lowestMonth?.month || 'N/A'}
  → Variation: ₹${data.investments?.variation ? Math.round(data.investments.variation).toLocaleString() : 'N/A'} (${data.investments?.variationPercent !== undefined ? data.investments.variationPercent : 'N/A'}% difference)

• **Month-by-Month Changes**:
${data.investments?.fluctuations && data.investments.fluctuations.length > 0 ? data.investments.fluctuations.map(f => 
    `  → ${f.from} → ${f.to}: ${f.change >= 0 ? '+' : ''}₹${Math.round(f.change).toLocaleString()} (${f.changePercent >= 0 ? '+' : ''}${f.changePercent}%) - ${f.trend}`
).join('\n') : '  → No significant fluctuations (consistent pattern)'}

• **Target Performance Summary**:
  → Target: ${data.investments?.targetPercent || 20}% of income
  → Months Met Target: ${data.investments?.targetHits || 0} out of ${data.investments?.targetComparisons?.length || 0}
  → Months Missed Target: ${data.investments?.targetMisses || 0} out of ${data.investments?.targetComparisons?.length || 0}
  → Severity: **${data.investments?.severity ? data.investments.severity.toUpperCase() : 'UNKNOWN'}** (${data.investments?.missRate || 0}% miss rate)
  ${data.investments?.targetComparisons && data.investments.targetComparisons.length > 0 ? `→ Average Gap: ₹${Math.round(data.investments.targetComparisons.filter(tc => tc.missedTarget).reduce((sum, tc) => sum + tc.gapAmount, 0) / Math.max(1, data.investments.targetMisses)).toLocaleString()}/month when missed` : ''}

• **Health Assessment**:
  → [Specific diagnosis based on pattern AND target performance: e.g., "Irregular saving habits detected with ${data.investments?.missRate || 0}% target miss rate" OR "Excellent consistency but ${data.investments?.targetMisses || 0} months missed target" OR "Declining trend needs reversal - critical planning issue"]
  → [Root cause: e.g., "Manual investments without automation" OR "Expense pressure reducing investment capacity" OR "Target miss rate of ${data.investments?.missRate || 0}% indicates systematic planning gaps"]
  ${data.investments?.severity === 'critical' ? '  → **CRITICAL ISSUE**: More than 50% of months missed target - this is a serious planning problem requiring immediate action' : ''}
  ${data.investments?.severity === 'serious' ? '  → **SERIOUS ISSUE**: Significant portion of months missed target - planning discipline needs improvement' : ''}
  ${data.investments?.severity === 'moderate' ? '  → **MODERATE ISSUE**: Some months missed target - investigate specific causes for those months' : ''}

• **Action Plan** (Prioritize based on severity):
  ${data.investments?.severity === 'critical' ? '  → **URGENT**: Set up auto-SIP of ₹X/month (target amount) to ensure consistent investments\n  → **URGENT**: Review and reduce expenses by ₹Y/month to free up investment capacity\n  → **URGENT**: Create monthly investment reminder/automation to prevent misses' : ''}
  ${data.investments?.severity === 'serious' ? '  → Set up auto-SIP of ₹X/month to improve consistency\n  → Review months that missed target and identify common causes\n  → Adjust budget to prioritize investments' : ''}
  ${data.investments?.severity === 'moderate' ? (() => {
    const missedMonths = data.investments?.targetComparisons?.filter(tc => tc.missedTarget).map(tc => tc.month).join(', ') || 'N/A';
    return `  → Investigate specific months that missed target (${missedMonths})\n  → Set up reminders for investment deadlines\n  → Consider auto-SIP to prevent future misses`;
  })() : ''}
  → [Specific action 1 with exact amount: e.g., "Set up ₹X/month auto-SIP to stabilize pattern"]
  → [Specific action 2: e.g., "Maintain ₹Y/month (your highest month) consistently"]
  → [Specific action 3: e.g., "Reduce variation from ₹X-₹Y to consistent ₹Z/month"]
  ${data.investments?.targetComparisons && data.investments.targetComparisons.filter(tc => tc.missedTarget).length > 0 ? `→ **Address Target Gaps**: Total gap of ₹${Math.round(data.investments.targetComparisons.filter(tc => tc.missedTarget).reduce((sum, tc) => sum + tc.gapAmount, 0)).toLocaleString()} across missed months - prioritize closing this gap` : ''}

**✅ PRIORITY ACTIONS FOR ${monthName.toUpperCase()}**
List 5 specific actions in order of priority:
1. **[Action]**: Save/Invest ₹X by [specific method]
2. **[Action]**: Save/Invest ₹X by [specific method]
3. **[Action]**: Save/Invest ₹X by [specific method]
4. **[Action]**: Save/Invest ₹X by [specific method]
5. **[Action]**: Save/Invest ₹X by [specific method]

**Total Monthly Impact: ₹X potential savings/additional investment**

═══════════════════════════════════════════════════════════════
CRITICAL RULES FOR AI:
═══════════════════════════════════════════════════════════════

FORMATTING RULES (CRITICAL):
• **DO NOT use HTML tables** - they break the UI. Use simple bullet points with arrows (→) for comparisons
• **Use hierarchical structure** with proper indentation:
  - Main bullet (•) for category/expense name
  - Sub-bullets with arrows (→) for details, indented with 2 spaces
  - Example:
    • **Swiggy** (Food Delivery)
      → Current: ₹X/month | Target: ₹Y/month | Savings: ₹Z/month
      → **Action**: [specific tip]
• **Group related information together**:
  - Category spending and its reduction action MUST be in the same bullet group
  - Loan details and pre-closure advice MUST be in the same bullet group
• Use **bold** for expense names, key numbers, and action items
• Use arrows (→) for sub-items and comparisons
• Each main bullet point on a NEW LINE
• Keep sections clearly separated
• No long paragraphs - break into structured bullet points

NEVER SUGGEST REDUCING (these are MANDATORY):
• Insurance premiums (health, life, vehicle)
• Maintenance (vehicle, home, society)
• Medical/Healthcare expenses
• Rent or Housing EMI
• Utilities (electricity, water, gas, internet)
• Education fees
• Basic groceries
• Fuel for daily commute

ONLY SUGGEST REDUCING (USER's personal choices):
• Food delivery (Swiggy, Zomato) - user can cook more
• Online shopping (Amazon, Flipkart) - user can avoid impulse buys
• Entertainment (movies, OTT, gaming) - user can limit
• Dining out - user can eat at home
• Lifestyle subscriptions - user can pause/cancel
• Fashion/clothing beyond basics - user can defer
• Gadgets and electronics - user can postpone
• Travel/vacation - user can plan budget trips
• Coffee shops, snacks - user can reduce frequency

LOAN ADVICE:
• Only suggest pre-closure for HIGH INTEREST loans (above benchmarks)
• Never suggest pre-closing low-interest loans (waste of opportunity cost)
• Consider remaining tenure when advising pre-closure
• Personal loans with <12% interest are NOT bad loans
• Home loans with <9% interest are NOT bad loans

DATA USAGE & FILTERING:
• USE EXACT names from the data provided
• Reference actual EMI progress (X/Y paid) from data
• Use actual investment amounts per month from data
• **ONLY SHOW PROBLEMATIC CATEGORIES**:
  - Spending categories: Only if OVER budget (don't mention if under/on target)
  - Investment: Only if UNDER target (appreciate if above target)
  - Loans: Only if high-interest or ending soon (skip healthy loans)
• Categories show accumulated spending - don't negotiate, advise user to limit
• Skip investment types that are undefined/null/empty in the data

YEAR-OVER-YEAR & ANNUAL PATTERNS (IMPORTANT):
• If YoY data shows higher spending in same month last year, MENTION IT
• If annual patterns are detected (e.g., birthday, anniversary, festival), HIGHLIGHT them
• Adjust projections based on historical patterns for this specific month
• Example: "Based on last year's ${monthName}, expect ~₹X for [occasion]"
• Recurring annual expenses should be EXPECTED, not flagged as overspending
• Help user PLAN for these known annual expenses in advance`;
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
                    
                    // Format: BankName: LoanType
                    const loanTypeDisplay = loan.loanType === 'Other' && loan.customLoanType 
                        ? loan.customLoanType 
                        : (loan.loanType || 'Loan');
                    const displayName = `${loan.bankName}: ${loanTypeDisplay}`;
                    
                    items.push({
                        name: displayName,
                        category: 'Loan EMI',
                        amount: parseFloat(emiAmount),
                        date: emiDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: emiDueDate.getTime(),
                        // Additional fields for enhanced display
                        type: 'loan',
                        paidCount: remaining.emisPaid,
                        totalCount: loan.tenure,
                        description: loan.reason || null,
                        progress: Math.round((remaining.emisPaid / loan.tenure) * 100)
                    });
                }
            }
        });
        
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    // Auto-update EMI progress
                    if (window.Cards && window.Cards.updateEMIProgress) {
                        window.Cards.updateEMIProgress(emi);
                    }
                    
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
                        
                        // Format: CardName: EMI Reason
                        const displayName = `${card.nickname || card.name}: ${emi.reason || 'EMI'}`;
                        
                        items.push({
                            name: displayName,
                            category: 'Card EMI',
                            amount: parseFloat(emi.emiAmount),
                            date: emiDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                            sortDate: emiDueDate.getTime(),
                            // Additional fields for enhanced display
                            type: 'card',
                            paidCount: paidCount,
                            totalCount: totalCount,
                            description: emi.description || null,
                            progress: Math.round((paidCount / totalCount) * 100)
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
     * Uses the average of the last 6 completed months (excluding current month)
     */
    getProjectedRegularExpenses() {
        return this.getProjectedRegularExpensesWithDetails(6).average;
    },
    
    /**
     * Get projected regular expenses with detailed breakdown
     * Returns both the average and individual month data
     * @param {number} numMonths - Number of months to analyze (default: 3)
     */
    getProjectedRegularExpensesWithDetails(numMonths = 3) {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        // Calculate averages from the last N completed months
        const monthlyData = [];
        
        for (let i = 1; i <= numMonths; i++) {
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
                    
                    // Format: BankName: LoanType
                    const loanTypeDisplay = loan.loanType === 'Other' && loan.customLoanType 
                        ? loan.customLoanType 
                        : (loan.loanType || 'Loan');
                    const displayName = `${loan.bankName}: ${loanTypeDisplay}`;
                    
                    items.push({
                        title: displayName,
                        category: 'Loan EMI',
                        amount: parseFloat(emiAmount),
                        date: `Day ${emiDay}`,
                        type: 'loan',
                        paidCount: remaining.emisPaid,
                        totalCount: loan.tenure,
                        description: loan.reason || null,
                        progress: Math.round((remaining.emisPaid / loan.tenure) * 100)
                    });
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    // Auto-update EMI progress
                    if (window.Cards && window.Cards.updateEMIProgress) {
                        window.Cards.updateEMIProgress(emi);
                    }
                    
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
                        // Format: CardName: EMI Reason
                        const displayName = `${card.nickname || card.name}: ${emi.reason || 'EMI'}`;
                        
                        items.push({
                            title: displayName,
                            category: 'Credit Card EMI',
                            amount: parseFloat(emi.emiAmount),
                            date: `${paidCount}/${totalCount} paid`,
                            type: 'card',
                            paidCount: paidCount,
                            totalCount: totalCount,
                            description: emi.description || null,
                            progress: Math.round((paidCount / totalCount) * 100)
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
        
        // Check if this is EMI list
        const isEmiList = type === 'emis';
        
        const itemsHtml = items.length > 0 
            ? items.map(item => {
                // Enhanced display for EMI items
                if (isEmiList && item.paidCount !== undefined && item.totalCount !== undefined) {
                    const progressColor = item.type === 'loan' ? 'blue' : 'purple';
                    return `
                        <div class="py-3 border-b border-gray-100 last:border-0">
                            <!-- Title and Amount -->
                            <div class="flex justify-between items-start mb-2">
                                <div class="font-semibold text-gray-800 text-sm truncate flex-1 mr-2">${Utils.escapeHtml(item.title)}</div>
                                <div class="text-sm font-bold text-${progressColor}-600 flex-shrink-0">₹${Utils.formatIndianNumber(item.amount)}</div>
                            </div>
                            
                            <!-- Progress Bar -->
                            <div class="mb-2">
                                <div class="flex justify-between items-center text-xs text-gray-600 mb-1">
                                    <span class="font-medium">${item.paidCount}/${item.totalCount} EMIs paid</span>
                                    <span>${item.progress}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-1.5">
                                    <div class="bg-${progressColor}-500 h-1.5 rounded-full transition-all" style="width: ${item.progress}%"></div>
                                </div>
                            </div>
                            
                            <!-- Date and Description -->
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                                <span>📅 ${item.date}</span>
                                ${item.description ? `<span>•</span><span class="italic truncate">${Utils.escapeHtml(item.description)}</span>` : ''}
                            </div>
                        </div>
                    `;
                }
                
                // Default display for non-EMI items
                return `
                    <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                            <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                        </div>
                        <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                    </div>
                `;
            }).join('')
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
    },
    
    /**
     * Show Settlement Calculations Modal
     */
    showSettlementModal(year, month) {
        // Save scroll positions before re-rendering
        const scrollPositions = {};
        const existingModal = document.getElementById('settlement-modal');
        if (existingModal) {
            // Cards content scrolls the entire content div
            const cardsContent = existingModal.querySelector('#cards-content');
            if (cardsContent) scrollPositions.cards = cardsContent.scrollTop;
            
            // Recurring content has nested scrollable div
            const recurringScrollable = existingModal.querySelector('#recurring-content .max-h-48.overflow-y-auto');
            if (recurringScrollable) scrollPositions.recurring = recurringScrollable.scrollTop;
            
            // Loans content has nested scrollable div
            const loansScrollable = existingModal.querySelector('#loans-content .max-h-48.overflow-y-auto');
            if (loansScrollable) scrollPositions.loans = loansScrollable.scrollTop;
            
            // Custom content scrolls the entire content div
            const customContent = existingModal.querySelector('#custom-content');
            if (customContent) scrollPositions.custom = customContent.scrollTop;
        }
        
        // Calculate default income/recurring month based on pay schedule
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        let defaultIncomeYear = year;
        let defaultIncomeMonth = month;
        
        if (paySchedule === 'last_week') {
            // If last week pay schedule, income is from next month
            defaultIncomeMonth = month === 12 ? 1 : month + 1;
            defaultIncomeYear = month === 12 ? year + 1 : year;
        }
        
        // Initialize settlement data in DB if not exists
        if (!window.DB.settlementData) {
            window.DB.settlementData = {};
        }
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const settlementData = window.DB.settlementData[monthKey] || {
            cardSelections: {}, // { cardId: 'bill' | 'outstanding' }
            enabledRecurring: [], // Array of enabled recurring item names
            enabledLoanEmis: [], // Array of enabled loan EMI names
            customItems: [],
            incomeMonth: `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`,
            recurringMonth: `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`,
            loansMonth: null // Will default to incomeMonth
        };
        
        // Get income for selected month
        const incomeMonthKey = settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`;
        const [incomeYear, incomeMonth] = incomeMonthKey.split('-').map(Number);
        const incomeData = this.getIncomeForExpenseComparison(incomeYear, incomeMonth);
        const income = incomeData.income || 0;
        
        // Check if using actual salary or estimated payslip
        const salaries = window.DB.salaries || [];
        const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
        const isEstimatedIncome = !actualSalary && income > 0;
        
        // Get credit cards with outstanding and bill amounts
        const creditCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        const unpaidBills = (window.DB.cardBills || []).filter(b => !b.isPaid);
        
        // Calculate current bill amounts per card
        const currentCardData = creditCards.map(card => {
            const cardBills = unpaidBills.filter(b => String(b.cardId) === String(card.id));
            const billAmount = cardBills.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
            const outstandingAmount = parseFloat(card.outstanding) || 0;
            return {
                id: card.id,
                name: card.name,
                billAmount: billAmount,
                outstandingAmount: outstandingAmount,
                hasBills: billAmount > 0,
                hasOutstanding: outstandingAmount > 0
            };
        }).filter(card => card.billAmount > 0 || card.outstandingAmount > 0); // Skip cards with both amounts as 0
        
        // Use saved card data if exists and not loaded, otherwise use current data
        const hasSavedData = settlementData.savedCardData && settlementData.savedCardData.length > 0;
        const cardData = (hasSavedData && !settlementData.cardDataLoaded) ? settlementData.savedCardData : currentCardData;
        
        // If no saved data exists, initialize with current data
        if (!hasSavedData) {
            settlementData.savedCardData = currentCardData;
            settlementData.cardDataLoaded = false;
        }
        
        // Get individual recurring payments for selected month
        const recurringMonthKey = settlementData.recurringMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`;
        const [recurringYear, recurringMonth] = recurringMonthKey.split('-').map(Number);
        const recurringItems = this.getRecurringExpenseItemsForMonth(recurringYear, recurringMonth);
        
        // Initialize enabled recurring if not exists
        if (!settlementData.enabledRecurring || settlementData.enabledRecurring.length === 0) {
            settlementData.enabledRecurring = recurringItems.map(r => r.name);
        }
        
        // Get individual loan EMIs for selected month (only loan EMIs, not card EMIs)
        const loansMonthKey = settlementData.loansMonth || settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`;
        const [loansYear, loansMonth] = loansMonthKey.split('-').map(Number);
        const loanEmiItems = this.getEmiItemsForMonth(loansYear, loansMonth).filter(emi => emi.type === 'loan');
        
        // Initialize enabled loan EMIs if not exists (all enabled by default)
        if (!settlementData.enabledLoanEmis || settlementData.enabledLoanEmis.length === 0) {
            settlementData.enabledLoanEmis = loanEmiItems.map(emi => emi.name);
        }
        
        // Initialize card selections if not exists
        cardData.forEach(card => {
            if (!settlementData.cardSelections[card.id]) {
                // Default to bill if available, otherwise outstanding
                settlementData.cardSelections[card.id] = card.hasBills ? 'bill' : 'outstanding';
            }
        });
        
        // Initialize enabled recurring if not exists
        if (!settlementData.enabledRecurring) {
            settlementData.enabledRecurring = recurringItems.map(r => r.name);
        }
        
        // Initialize enabled cards if not exists (all cards enabled by default)
        // Only initialize if the property doesn't exist at all, not if it's empty
        if (settlementData.enabledCards === undefined) {
            settlementData.enabledCards = cardData.map(c => String(c.id));
        } else if (!Array.isArray(settlementData.enabledCards)) {
            settlementData.enabledCards = cardData.map(c => String(c.id));
        }
        
        // Initialize expanded sections state
        if (!settlementData.expandedSections) {
            settlementData.expandedSections = { cards: false, recurring: false, loans: false, custom: false, summary: false };
        }
        
        // Calculate totals
        const cardsTotal = cardData
            .filter(card => (settlementData.enabledCards || []).some(id => String(id) === String(card.id)))
            .reduce((sum, card) => {
                const selection = settlementData.cardSelections[card.id] || 'bill';
                return sum + (selection === 'bill' ? card.billAmount : card.outstandingAmount);
            }, 0);
        
        const recurringTotal = recurringItems
            .filter(r => settlementData.enabledRecurring.includes(r.name))
            .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        
        // Calculate loan EMIs total
        const loansTotal = loanEmiItems
            .filter(emi => settlementData.enabledLoanEmis.includes(emi.name))
            .reduce((sum, emi) => sum + (parseFloat(emi.amount) || 0), 0);
        
        const customItemsTotal = (settlementData.customItems || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        
        const totalDeductions = cardsTotal + recurringTotal + loansTotal + customItemsTotal;
        const balance = income - totalDeductions;
        
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Build modal HTML
        const modalHTML = `
            <div id="settlement-modal" class="fixed inset-0 bg-black bg-opacity-75 z-[10000] flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeSettlementModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div class="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex justify-between items-center rounded-t-2xl z-10">
                        <h2 class="text-xl font-bold text-white">Settlement Calculations</h2>
                        <button onclick="Dashboard.closeSettlementModal()" class="text-white hover:text-gray-200 p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="p-4 space-y-3">
                        <!-- Summary Section: Income and Balance -->
                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <!-- Income Summary -->
                            <div class="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-3">
                                <!-- First line: Income label on left, Month filter on right -->
                                <div class="flex items-center justify-between mb-2">
                                    <p class="text-xs text-green-600 font-medium">Income</p>
                                    <div class="relative">
                                        <input type="month" id="settlement-income-month-selector" 
                                               value="${settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`}"
                                               onchange="Dashboard.updateSettlementIncomeMonth(${year}, ${month}, this.value)"
                                               class="absolute opacity-0 pointer-events-none">
                                        <button id="settlement-income-month-button" 
                                                onclick="document.getElementById('settlement-income-month-selector').showPicker()"
                                                class="px-2 py-1 border border-green-300 rounded text-[10px] font-medium text-green-700 hover:bg-green-50 transition-all whitespace-nowrap">
                                            ${this.getFormattedMonth(settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`)} ▼
                                        </button>
                                    </div>
                                </div>
                                <!-- Second line: Amount -->
                                <p class="text-xl font-bold text-green-900 mb-1">₹${Utils.formatIndianNumber(income)}</p>
                                <!-- Below: Info text -->
                                ${isEstimatedIncome ? `
                                    <p class="text-[9px] text-green-500">~ Estimated from payslip</p>
                                ` : income > 0 ? `
                                    <p class="text-[9px] text-green-500">✓ Actual salary</p>
                                ` : ''}
                            </div>
                            
                            <!-- Final Balance Summary -->
                            <div class="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-3">
                                <!-- First line: Final Balance label -->
                                <div class="mb-2">
                                    <p class="text-xs text-blue-600 font-medium">Final Balance</p>
                                </div>
                                <!-- Second line: Amount -->
                                <p class="text-xl font-bold text-blue-900 mb-1">₹${Utils.formatIndianNumber(balance)}</p>
                                <!-- Below: Info text -->
                                <p class="text-[10px] text-blue-500">Income - Deductions</p>
                            </div>
                        </div>
                        
                        <!-- Credit Card Bills (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('cards', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">💳</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Credit Card Bills</p>
                                        <p class="text-[10px] text-gray-500">${cardData.length} card(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(cardsTotal)}</span>
                                    <svg id="cards-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.cards ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="cards-content" class="${settlementData.expandedSections?.cards ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-2 border-t border-gray-200">
                                <div class="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200" onclick="event.stopPropagation()">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] text-gray-600 leading-tight mb-0.5">${settlementData.cardDataLoaded ? 'Showing current bills from credit cards page' : 'Showing last saved data'}</p>
                                        <p class="text-[9px] text-gray-500">${settlementData.cardDataLoaded ? 'Click revert to restore saved data' : 'Click load to fetch current bills'}</p>
                                    </div>
                                    ${settlementData.cardDataLoaded ? `
                                        <button onclick="event.stopPropagation(); Dashboard.revertCardData(${year}, ${month})" 
                                                class="p-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-all flex-shrink-0 mt-0.5"
                                                title="Revert to saved data">
                                            <svg class="w-3.5 h-3.5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                                            </svg>
                                        </button>
                                    ` : `
                                        <button onclick="event.stopPropagation(); Dashboard.loadCardData(${year}, ${month})" 
                                                class="p-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-all flex-shrink-0 mt-0.5"
                                                title="Load current bills">
                                            <svg class="w-3.5 h-3.5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                            </svg>
                                        </button>
                                    `}
                                </div>
                                ${cardData.length > 0 ? cardData.map(card => {
                                    const isEnabled = (settlementData.enabledCards || []).some(id => String(id) === String(card.id));
                                    const selection = settlementData.cardSelections[card.id] || 'bill';
                                    return `
                                        <div class="bg-gray-50 rounded p-2" onclick="event.stopPropagation()">
                                            <div class="flex items-center gap-2 mb-1.5">
                                                <input type="checkbox" id="card-checkbox-${card.id}" ${isEnabled ? 'checked' : ''}
                                                       onchange="event.stopPropagation(); Dashboard.toggleCardEnabled(${year}, ${month}, '${card.id}', this.checked)"
                                                       class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                                <p class="text-xs font-semibold text-gray-700 flex-1">${Utils.escapeHtml(card.name)}</p>
                                            </div>
                                            ${isEnabled ? `
                                                <div class="flex items-center gap-3 ml-5">
                                                    <label class="flex items-center gap-1.5 cursor-pointer">
                                                        <input type="radio" name="card-${card.id}" value="bill" 
                                                               ${selection === 'bill' ? 'checked' : ''}
                                                               onchange="event.stopPropagation(); Dashboard.updateCardSelection(${year}, ${month}, '${card.id}', 'bill')"
                                                               class="w-3.5 h-3.5 text-green-600 border-gray-300">
                                                        <span class="text-[10px] text-gray-700">
                                                            Bill: ₹${Utils.formatIndianNumber(card.billAmount)}
                                                        </span>
                                                    </label>
                                                    <label class="flex items-center gap-1.5 cursor-pointer">
                                                        <input type="radio" name="card-${card.id}" value="outstanding" 
                                                               ${selection === 'outstanding' ? 'checked' : ''}
                                                               onchange="event.stopPropagation(); Dashboard.updateCardSelection(${year}, ${month}, '${card.id}', 'outstanding')"
                                                               class="w-3.5 h-3.5 text-green-600 border-gray-300">
                                                        <span class="text-[10px] text-gray-700">
                                                            Outstanding: ₹${Utils.formatIndianNumber(card.outstandingAmount)}
                                                        </span>
                                                    </label>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No credit cards available</p>'}
                            </div>
                        </div>
                        
                        <!-- Recurring Payments (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('recurring', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">🔄</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Recurring Payments</p>
                                        <p class="text-[10px] text-gray-500">${recurringItems.length} item(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(recurringTotal)}</span>
                                    <svg id="recurring-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.recurring ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="recurring-content" class="${settlementData.expandedSections?.recurring ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div class="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200" onclick="event.stopPropagation()">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] text-gray-600 leading-tight mb-0.5">Select month for recurring payments</p>
                                        <p class="text-[9px] text-gray-500">Default: Based on income pay schedule</p>
                                    </div>
                                    <div class="relative flex-shrink-0 mt-0.5">
                                        <input type="month" id="settlement-recurring-month-selector" 
                                               value="${settlementData.recurringMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`}"
                                               onchange="Dashboard.updateSettlementRecurringMonth(${year}, ${month}, this.value)"
                                               class="absolute opacity-0 pointer-events-none">
                                        <button id="settlement-recurring-month-button" 
                                                onclick="event.stopPropagation(); document.getElementById('settlement-recurring-month-selector').showPicker()"
                                                class="px-2 py-1 border border-gray-300 rounded text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-all whitespace-nowrap">
                                            ${this.getFormattedMonth(settlementData.recurringMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`)} ▼
                                        </button>
                                    </div>
                                </div>
                                <div class="max-h-48 overflow-y-auto">
                                ${recurringItems.length > 0 ? recurringItems.map(item => {
                                    const isEnabled = settlementData.enabledRecurring.includes(item.name);
                                    return `
                                        <label class="flex items-center gap-2 p-1.5 bg-gray-50 rounded cursor-pointer hover:bg-gray-100" onclick="event.stopPropagation()">
                                            <input type="checkbox" ${isEnabled ? 'checked' : ''}
                                                   onchange="event.stopPropagation(); Dashboard.toggleRecurringItem(${year}, ${month}, '${Utils.escapeHtml(item.name)}')"
                                                   class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(item.name)}</p>
                                                <p class="text-[10px] text-gray-500 truncate">${item.category || 'Uncategorized'}</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(item.amount)}</span>
                                        </label>
                                    `;
                                }).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No recurring payments for this month</p>'}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Loan EMIs (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('loans', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">🏦</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Loan EMIs</p>
                                        <p class="text-[10px] text-gray-500">${loanEmiItems.length} EMI(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(loansTotal)}</span>
                                    <svg id="loans-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.loans ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="loans-content" class="${settlementData.expandedSections?.loans ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div class="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200" onclick="event.stopPropagation()">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] text-gray-600 leading-tight mb-0.5">Select month for loan EMIs</p>
                                        <p class="text-[9px] text-gray-500">Default: Same as income month</p>
                                    </div>
                                    <div class="relative flex-shrink-0 mt-0.5">
                                        <input type="month" id="settlement-loans-month-selector" 
                                               value="${settlementData.loansMonth || settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`}"
                                               onchange="Dashboard.updateSettlementLoansMonth(${year}, ${month}, this.value)"
                                               class="absolute opacity-0 pointer-events-none">
                                        <button id="settlement-loans-month-button" 
                                                onclick="event.stopPropagation(); document.getElementById('settlement-loans-month-selector').showPicker()"
                                                class="px-2 py-1 border border-gray-300 rounded text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-all whitespace-nowrap">
                                            ${this.getFormattedMonth(settlementData.loansMonth || settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`)} ▼
                                        </button>
                                    </div>
                                </div>
                                <div class="max-h-48 overflow-y-auto">
                                ${loanEmiItems.length > 0 ? loanEmiItems.map(emi => {
                                    const isEnabled = settlementData.enabledLoanEmis.includes(emi.name);
                                    return `
                                        <label class="flex items-center gap-2 p-1.5 bg-gray-50 rounded cursor-pointer hover:bg-gray-100" onclick="event.stopPropagation()">
                                            <input type="checkbox" ${isEnabled ? 'checked' : ''}
                                                   onchange="event.stopPropagation(); Dashboard.toggleLoanEmiItem(${year}, ${month}, '${Utils.escapeHtml(emi.name)}')"
                                                   class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(emi.name)}</p>
                                                <p class="text-[10px] text-gray-500 truncate">${emi.date}${emi.description ? ' • ' + Utils.escapeHtml(emi.description) : ''}</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(emi.amount)}</span>
                                        </label>
                                    `;
                                }).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No loan EMIs for this month</p>'}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Custom Items (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('custom', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">➕</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Custom Items</p>
                                        <p class="text-[10px] text-gray-500">${(settlementData.customItems || []).length} item(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(customItemsTotal)}</span>
                                    <svg id="custom-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.custom ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="custom-content" class="${settlementData.expandedSections?.custom ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div id="custom-items-list" class="space-y-1.5">
                                    ${(settlementData.customItems || []).length > 0 ? (settlementData.customItems || []).map((item, idx) => `
                                        <div class="flex items-center gap-2 p-1.5 bg-gray-50 rounded">
                                            <button onclick="event.stopPropagation(); Dashboard.removeCustomItem(${year}, ${month}, ${idx})" 
                                                    class="px-1.5 py-0.5 text-[10px] bg-red-500 hover:bg-red-600 text-white rounded flex-shrink-0 transition-all"
                                                    title="Remove item">
                                                ×
                                            </button>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(item.name)}</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(item.amount)}</span>
                                        </div>
                                    `).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No custom items added</p>'}
                                </div>
                                <button onclick="event.stopPropagation(); Dashboard.showAddCustomItemModal(${year}, ${month})" 
                                        class="w-full flex items-center justify-center p-1.5 border-2 border-dashed border-green-400 rounded hover:border-green-500 hover:bg-green-50 transition-all"
                                        title="Add custom item">
                                    <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Summary (Collapsible) -->
                        <div class="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('summary', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-red-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">📊</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-red-600">Total Deductions</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold text-red-600">₹${Utils.formatIndianNumber(totalDeductions)}</span>
                                    <svg id="summary-arrow" class="w-4 h-4 text-red-500 transform transition-transform ${settlementData.expandedSections?.summary ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="summary-content" class="${settlementData.expandedSections?.summary ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1 border-t border-red-200">
                                <div class="space-y-1">
                                    <div class="flex justify-between text-xs">
                                        <span class="text-red-600">Credit Card Bills:</span>
                                        <span class="font-semibold text-red-700">₹${Utils.formatIndianNumber(cardsTotal)}</span>
                                    </div>
                                    <div class="flex justify-between text-xs">
                                        <span class="text-red-600">Recurring Payments:</span>
                                        <span class="font-semibold text-red-700">₹${Utils.formatIndianNumber(recurringTotal)}</span>
                                    </div>
                                    <div class="flex justify-between text-xs">
                                        <span class="text-red-600">Loan EMIs:</span>
                                        <span class="font-semibold text-red-700">₹${Utils.formatIndianNumber(loansTotal)}</span>
                                    </div>
                                    <div class="flex justify-between text-xs">
                                        <span class="text-red-600">Custom Items:</span>
                                        <span class="font-semibold text-red-700">₹${Utils.formatIndianNumber(customItemsTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const modalToRemove = document.getElementById('settlement-modal');
        if (modalToRemove) modalToRemove.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Restore scroll positions after a brief delay to ensure DOM is ready
        setTimeout(() => {
            const newModal = document.getElementById('settlement-modal');
            if (newModal) {
                if (scrollPositions.cards !== undefined) {
                    // Cards content scrolls the entire content div
                    const cardsContent = newModal.querySelector('#cards-content');
                    if (cardsContent) {
                        cardsContent.scrollTop = scrollPositions.cards;
                    }
                }
                if (scrollPositions.recurring !== undefined) {
                    // Recurring content has nested scrollable div
                    const recurringContent = newModal.querySelector('#recurring-content .max-h-48.overflow-y-auto');
                    if (recurringContent) {
                        recurringContent.scrollTop = scrollPositions.recurring;
                    }
                }
                if (scrollPositions.loans !== undefined) {
                    // Loans content has nested scrollable div
                    const loansContent = newModal.querySelector('#loans-content .max-h-48.overflow-y-auto');
                    if (loansContent) {
                        loansContent.scrollTop = scrollPositions.loans;
                    }
                }
                if (scrollPositions.custom !== undefined) {
                    // Custom content scrolls the entire content div
                    const customContent = newModal.querySelector('#custom-content');
                    if (customContent) {
                        customContent.scrollTop = scrollPositions.custom;
                    }
                }
            }
        }, 10);
    },
    
    /**
     * Close Settlement Modal
     */
    closeSettlementModal() {
        const modal = document.getElementById('settlement-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Toggle settlement section (collapsible) - preserves state
     */
    toggleSettlementSection(section, year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: { cards: false, recurring: false, loans: false, custom: false, summary: false } };
        }
        if (!window.DB.settlementData[monthKey].expandedSections) {
            window.DB.settlementData[monthKey].expandedSections = { cards: false, recurring: false, loans: false, custom: false, summary: false };
        }
        
        // Toggle the state
        const currentState = window.DB.settlementData[monthKey].expandedSections[section] || false;
        window.DB.settlementData[monthKey].expandedSections[section] = !currentState;
        window.Storage.save();
        
        // Update UI
        const content = document.getElementById(`${section}-content`);
        const arrow = document.getElementById(`${section}-arrow`);
        if (content && arrow) {
            if (!currentState) {
                content.classList.remove('hidden');
                arrow.classList.add('rotate-180');
            } else {
                content.classList.add('hidden');
                arrow.classList.remove('rotate-180');
            }
        }
    },
    
    /**
     * Toggle card enabled/disabled - preserves expanded state
     */
    toggleCardEnabled(year, month, cardId, checked) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: { cards: true, recurring: false, loans: false, custom: false, summary: false } };
        }
        if (!Array.isArray(window.DB.settlementData[monthKey].enabledCards)) {
            window.DB.settlementData[monthKey].enabledCards = [];
        }
        if (!window.DB.settlementData[monthKey].expandedSections) {
            window.DB.settlementData[monthKey].expandedSections = { cards: true, recurring: false, loans: false, custom: false, summary: false };
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: true, recurring: false, loans: false, custom: false, summary: false };
        
        const enabledCards = window.DB.settlementData[monthKey].enabledCards || [];
        const cardIdStr = String(cardId);
        const index = enabledCards.findIndex(id => String(id) === cardIdStr);
        
        if (checked) {
            // Add to enabled cards (check) - only if not already present
            if (index === -1) {
                enabledCards.push(cardIdStr);
            }
        } else {
            // Remove from enabled cards (uncheck)
            if (index > -1) {
                enabledCards.splice(index, 1);
            }
        }
        
        window.DB.settlementData[monthKey].enabledCards = enabledCards;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update settlement income month
     */
    updateSettlementIncomeMonth(year, month, incomeMonthValue) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: {} };
        }
        window.DB.settlementData[monthKey].incomeMonth = incomeMonthValue;
        window.Storage.save();
        
        // Update button text
        const button = document.getElementById('settlement-income-month-button');
        if (button) {
            button.innerHTML = this.getFormattedMonth(incomeMonthValue) + ' ▼';
        }
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update settlement recurring month
     */
    updateSettlementRecurringMonth(year, month, recurringMonthValue) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: {} };
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: false, recurring: true, loans: false, custom: false, summary: false };
        
        window.DB.settlementData[monthKey].recurringMonth = recurringMonthValue;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        // Update button text
        const button = document.getElementById('settlement-recurring-month-button');
        if (button) {
            button.innerHTML = this.getFormattedMonth(recurringMonthValue) + ' ▼';
        }
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update settlement loans month
     */
    updateSettlementLoansMonth(year, month, loansMonthValue) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: {} };
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: false, recurring: false, loans: true, custom: false, summary: false };
        
        window.DB.settlementData[monthKey].loansMonth = loansMonthValue;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        // Update button text
        const button = document.getElementById('settlement-loans-month-button');
        if (button) {
            button.innerHTML = this.getFormattedMonth(loansMonthValue) + ' ▼';
        }
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Toggle loan EMI item enable/disable - preserves expanded state
     */
    toggleLoanEmiItem(year, month, itemName) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: { cards: false, recurring: false, loans: true, custom: false, summary: false } };
        }
        if (!window.DB.settlementData[monthKey].enabledLoanEmis) {
            window.DB.settlementData[monthKey].enabledLoanEmis = [];
        }
        if (!window.DB.settlementData[monthKey].expandedSections) {
            window.DB.settlementData[monthKey].expandedSections = { cards: false, recurring: false, loans: true, custom: false, summary: false };
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: false, recurring: false, loans: true, custom: false, summary: false };
        
        const enabledLoanEmis = window.DB.settlementData[monthKey].enabledLoanEmis;
        const index = enabledLoanEmis.indexOf(itemName);
        if (index > -1) {
            enabledLoanEmis.splice(index, 1);
        } else {
            enabledLoanEmis.push(itemName);
        }
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this.showSettlementModal(year, month);
    },
    
    /**
     * Load current card data from credit cards page
     */
    loadCardData(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: {} };
        }
        
        // Get current credit cards data
        const creditCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        const unpaidBills = (window.DB.cardBills || []).filter(b => !b.isPaid);
        
        const currentCardData = creditCards.map(card => {
            const cardBills = unpaidBills.filter(b => String(b.cardId) === String(card.id));
            const billAmount = cardBills.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
            const outstandingAmount = parseFloat(card.outstanding) || 0;
            return {
                id: card.id,
                name: card.name,
                billAmount: billAmount,
                outstandingAmount: outstandingAmount,
                hasBills: billAmount > 0,
                hasOutstanding: outstandingAmount > 0
            };
        }).filter(card => card.billAmount > 0 || card.outstandingAmount > 0); // Skip cards with both amounts as 0
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: true, recurring: false, loans: false, custom: false, summary: false };
        
        // Save current data as loaded data
        window.DB.settlementData[monthKey].savedCardData = currentCardData;
        window.DB.settlementData[monthKey].cardDataLoaded = true;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Revert to saved card data
     */
    revertCardData(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData || !window.DB.settlementData[monthKey]) {
            return;
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: true, recurring: false, loans: false, custom: false, summary: false };
        
        // Revert to saved data
        window.DB.settlementData[monthKey].cardDataLoaded = false;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update card selection (bill or outstanding) - preserves expanded state
     */
    updateCardSelection(year, month, cardId, selectionType) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: { cards: true, recurring: false, loans: false, custom: false, summary: false } };
        }
        if (!window.DB.settlementData[monthKey].cardSelections) {
            window.DB.settlementData[monthKey].cardSelections = {};
        }
        if (!window.DB.settlementData[monthKey].expandedSections) {
            window.DB.settlementData[monthKey].expandedSections = { cards: true, recurring: false, loans: false, custom: false, summary: false };
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: true, recurring: false, loans: false, custom: false, summary: false };
        
        window.DB.settlementData[monthKey].cardSelections[cardId] = selectionType;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this.showSettlementModal(year, month);
    },
    
    /**
     * Toggle recurring item enable/disable - preserves expanded state
     */
    toggleRecurringItem(year, month, itemName) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], enabledLoanEmis: [], enabledCards: [], customItems: [], expandedSections: { cards: false, recurring: true, loans: false, custom: false, summary: false } };
        }
        if (!window.DB.settlementData[monthKey].enabledRecurring) {
            window.DB.settlementData[monthKey].enabledRecurring = [];
        }
        if (!window.DB.settlementData[monthKey].expandedSections) {
            window.DB.settlementData[monthKey].expandedSections = { cards: false, recurring: true, loans: false, custom: false, summary: false };
        }
        
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: false, recurring: true, loans: false, custom: false, summary: false };
        
        const enabledRecurring = window.DB.settlementData[monthKey].enabledRecurring;
        const index = enabledRecurring.indexOf(itemName);
        if (index > -1) {
            enabledRecurring.splice(index, 1);
        } else {
            enabledRecurring.push(itemName);
        }
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this.showSettlementModal(year, month);
    },
    
    /**
     * Show modal to add custom settlement item
     */
    showAddCustomItemModal(year, month) {
        const modalHTML = `
            <div id="add-custom-item-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeAddCustomItemModal()">
                <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-gray-800">Add Custom Item</h3>
                        <button onclick="Dashboard.closeAddCustomItemModal()" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
                            <input type="text" id="custom-item-name" 
                                   class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                   placeholder="e.g., Medical expenses, Shopping">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                            <input type="number" id="custom-item-amount" 
                                   class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                   placeholder="0" min="0" step="0.01">
                        </div>
                        <div class="flex gap-3 pt-2">
                            <button onclick="Dashboard.closeAddCustomItemModal()" 
                                    class="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancel
                            </button>
                            <button onclick="Dashboard.saveCustomItem(${year}, ${month})" 
                                    class="flex-1 px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('add-custom-item-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Focus on name input
        setTimeout(() => {
            const nameInput = document.getElementById('custom-item-name');
            if (nameInput) nameInput.focus();
        }, 100);
    },
    
    /**
     * Close add custom item modal
     */
    closeAddCustomItemModal() {
        const modal = document.getElementById('add-custom-item-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Save custom item from modal
     */
    saveCustomItem(year, month) {
        const nameInput = document.getElementById('custom-item-name');
        const amountInput = document.getElementById('custom-item-amount');
        
        if (!nameInput || !amountInput) return;
        
        const name = nameInput.value.trim();
        const amount = parseFloat(amountInput.value) || 0;
        
        if (!name) {
            alert('Please enter an item name');
            return;
        }
        
        if (amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData) window.DB.settlementData = {};
        if (!window.DB.settlementData[monthKey]) {
            window.DB.settlementData[monthKey] = { cardSelections: {}, enabledRecurring: [], customItems: [] };
        }
        if (!window.DB.settlementData[monthKey].customItems) {
            window.DB.settlementData[monthKey].customItems = [];
        }
        // Preserve expanded state
        const expandedState = window.DB.settlementData[monthKey].expandedSections || { cards: false, recurring: false, loans: false, custom: true, summary: false };
        
        window.DB.settlementData[monthKey].customItems.push({ name: name, amount: amount });
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        this.closeAddCustomItemModal();
        this.showSettlementModal(year, month);
    },
    
    
    /**
     * Remove custom item
     */
    removeCustomItem(year, month, index) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData || !window.DB.settlementData[monthKey] || !window.DB.settlementData[monthKey].customItems) {
            return;
        }
        window.DB.settlementData[monthKey].customItems.splice(index, 1);
        window.Storage.save();
        this.showSettlementModal(year, month);
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
}

