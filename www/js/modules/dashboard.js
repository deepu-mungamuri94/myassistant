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
    
    // Category mappings for Needs vs Wants
    needsCategories: [
        'Bills & Utilities', 'Groceries', 'Healthcare', 'Transportation', 
        'EMI', 'Loan EMI', 'Credit Card EMI', 'Rent', 'Insurance', 
        'Education', 'Personal & Family'
    ],
    wantsCategories: [
        'Entertainment', 'Food & Dining', 'Shopping', 'Travel', 
        'Subscriptions', 'Gifts', 'Hobbies', 'Other'
    ],
    
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
        const expenses = this.getExpensesData(monthsCount);
        const income = this.getIncomeData(monthsCount);
        const loans = this.getLoansData();
        
        // Get percentage cards data
        const minNetPay = this.getMinimumNetPay();
        const recurringExpenses = this.getTotalRecurringExpenses();
        const totalEmis = this.getTotalEmis();
        const regularExpenses = this.getRegularExpenses(); // Only non-recurring expenses
        
        const recurringPercent = minNetPay > 0 ? ((recurringExpenses / minNetPay) * 100).toFixed(1) : 0;
        const emisPercent = minNetPay > 0 ? ((totalEmis / minNetPay) * 100).toFixed(1) : 0;
        const regularPercent = minNetPay > 0 ? ((regularExpenses / minNetPay) * 100).toFixed(1) : 0;
        
        container.innerHTML = `
            <!-- Current Month Cards Box -->
            <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <h3 class="text-sm font-semibold text-gray-700 mb-3">Current Month</h3>
                <div class="grid grid-cols-3 gap-3 max-w-full">
                    <div class="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Rec.Payments</div>
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-3xl font-bold">${recurringPercent}<span class="text-lg opacity-80">%</span></div>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(recurringExpenses)}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Recurring payments (Current Month): Scheduled payments excluding monthly Loans/EMIs')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Loans / EMIs</div>
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-3xl font-bold">${emisPercent}<span class="text-lg opacity-80">%</span></div>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(totalEmis)}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Loans / EMIs (Current Month): Total monthly EMIs from active loans and credit cards')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Reg.Expenses</div>
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-3xl font-bold">${regularPercent}<span class="text-lg opacity-80">%</span></div>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(regularExpenses)}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Regular Expenses (Current Month): All monthly expenses without Recurring payments and Monthly EMIs')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                </div>
            </div>
            
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
            
            <!-- Investments Trend Chart -->
            <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <h3 class="text-sm font-semibold text-gray-700">📈 Investments Trend</h3>
                    <button onclick="Dashboard.openInvestmentRangeModal()" class="px-3 py-1.5 border border-emerald-300 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-all whitespace-nowrap">
                        <span id="investment-range-label">${this.getInvestmentRangeLabel()}</span> ▼
                    </button>
                </div>
                <div style="height: 300px; max-width: 100%;">
                    <canvas id="investments-trend-chart"></canvas>
                </div>
            </div>
            
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
     * Render Credit Card Bills section
     */
    renderCreditCardBillsSection() {
        const paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && b.paidAt);
        if (paidBills.length === 0) return '';
        
        return `
        <div class="bg-white rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">💳 Credit Card Bills</h3>
            <div style="height: 220px; max-width: 100%;">
                <canvas id="credit-card-bills-chart"></canvas>
            </div>
        </div>
        `;
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
     */
    getExpensesData(monthsCount = 6) {
        const monthsData = [];
        
        // Use custom range if selected
        if (this.selectedMonthRange) {
            const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Get expenses for this month
                const expenses = window.DB.expenses || [];
                const monthExpenses = expenses.filter(exp => {
                    const expDate = new Date(exp.date);
                    return expDate.getFullYear() === currentYear && expDate.getMonth() + 1 === currentMonth;
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
            
            // Get expenses for this month
            const expenses = window.DB.expenses || [];
            const monthExpenses = expenses.filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getFullYear() === year && expDate.getMonth() + 1 === month;
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
            
            // Try actual salary first
            const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
            if (actualSalary) {
                return actualSalary.amount;
            }
            
            // Fallback to payslip
            const monthNamesLong = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const payslip = yearlyPayslips.find(p => p.month === monthNamesLong[incomeMonth - 1]);
            return payslip ? payslip.totalNetPay : 0;
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
        const paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && b.paidAt);
        if (paidBills.length === 0) return;
        
        // Get credit cards (non-placeholder)
        const creditCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        
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
        
        // Get unique months (sorted)
        const allMonths = [...new Set(paidBills.map(b => {
            const d = new Date(b.paidAt);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }))].sort();
        
        // Format labels (MMM YY)
        const labels = allMonths.map(d => {
            const [year, month] = d.split('-');
            const date = new Date(year, month - 1);
            return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
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
        
        // Create datasets for each card
        const datasets = [];
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
        
        // Ideal percentages (50/30/20 rule)
        const needsIdeal = 50;
        const wantsIdeal = 30;
        const investIdeal = 20;
        
        // Status indicators
        const needsStatus = hasIncome ? (parseFloat(needsPercent) <= needsIdeal ? '✓' : '↑') : '';
        const wantsStatus = hasIncome ? (parseFloat(wantsPercent) <= wantsIdeal ? '✓' : '↑') : '';
        const investStatus = hasIncome ? (parseFloat(investPercent) >= investIdeal ? '✓' : '↓') : '';
        
        return `
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-sm font-semibold text-gray-700">50/30/20 Budget Rule</h3>
                    <div class="relative">
                        <input type="month" id="budget-month-selector" value="${budgetMonth}" onchange="Dashboard.updateBudgetMonth()" class="absolute opacity-0 pointer-events-none" />
                        <button id="budget-month-button" onclick="document.getElementById('budget-month-selector').showPicker()" class="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(budgetMonth)} ▼
                        </button>
                    </div>
                </div>
                <p class="text-[10px] text-gray-400 mb-3">Ideal: Needs ≤50% • Wants ≤30% • Invest ≥20%</p>
                
                <div class="grid grid-cols-3 gap-3 max-w-full">
                    <!-- Needs Card -->
                    <div class="bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90 leading-tight">Needs</div>
                            <span class="text-xs font-bold ${hasIncome && parseFloat(needsPercent) <= needsIdeal ? 'text-green-200' : 'text-red-200'}">${needsStatus}</span>
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncome 
                                ? `<div class="text-3xl font-bold">${needsPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(needs))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Needs: Essential expenses - Bills, Groceries, Healthcare, Transport, EMIs, Rent, Insurance, Education. Ideal: ≤50%')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    
                    <!-- Wants Card -->
                    <div class="bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90 leading-tight">Wants</div>
                            <span class="text-xs font-bold ${hasIncome && parseFloat(wantsPercent) <= wantsIdeal ? 'text-green-200' : 'text-red-200'}">${wantsStatus}</span>
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncome 
                                ? `<div class="text-3xl font-bold">${wantsPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(wants))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Wants: Non-essential expenses - Entertainment, Dining Out, Shopping, Travel, Subscriptions, Hobbies. Ideal: ≤30%')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    
                    <!-- Investments Card -->
                    <div class="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90 leading-tight">Invest</div>
                            <span class="text-xs font-bold ${hasIncome && parseFloat(investPercent) >= investIdeal ? 'text-green-200' : 'text-red-200'}">${investStatus}</span>
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncome 
                                ? `<div class="text-3xl font-bold">${investPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(investments))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Investments: Stocks, Gold, EPF, FDs, and other investments made this month. Ideal: ≥20%')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Get total "Needs" expenses for a month
     */
    getNeedsTotal(year, month) {
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const expDate = new Date(exp.date);
                if (expDate.getFullYear() !== year || (expDate.getMonth() + 1) !== month) {
                    return false;
                }
                const category = exp.category || 'Other';
                return this.needsCategories.some(c => c.toLowerCase() === category.toLowerCase());
            })
            .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    },
    
    /**
     * Get total "Wants" expenses for a month
     */
    getWantsTotal(year, month) {
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const expDate = new Date(exp.date);
                if (expDate.getFullYear() !== year || (expDate.getMonth() + 1) !== month) {
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
     */
    getInvestmentsDataForChart(monthsCount = 6) {
        const monthsData = [];
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const goldRate = window.DB.goldRatePerGram || 7000;
        const exchangeRate = typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : 83;
        
        // Use investment-specific range if selected
        if (this.selectedInvestmentRange) {
            const [startYear, startMonth] = this.selectedInvestmentRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedInvestmentRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Get investments for this month
                const monthInvs = monthlyInvestments.filter(inv => {
                    const invDate = new Date(inv.date);
                    return invDate.getFullYear() === currentYear && invDate.getMonth() + 1 === currentMonth;
                });
                
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
            
            // Get investments for this month
            const monthInvs = monthlyInvestments.filter(inv => {
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && invDate.getMonth() + 1 === month;
            });
            
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
        
        this.investmentChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [
                    {
                        label: 'Total',
                        data: data.map(d => d.total),
                        borderColor: 'rgba(16, 185, 129, 1)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        order: 0
                    },
                    {
                        label: 'Shares',
                        data: data.map(d => d.shares),
                        borderColor: 'rgba(99, 102, 241, 0.7)',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        order: 1
                    },
                    {
                        label: 'Gold',
                        data: data.map(d => d.gold),
                        borderColor: 'rgba(251, 191, 36, 0.7)',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: 'rgba(251, 191, 36, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        order: 2
                    },
                    {
                        label: 'EPF/FD',
                        data: data.map(d => d.epfFd),
                        borderColor: 'rgba(34, 197, 94, 0.7)',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        order: 3
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
                            padding: 12,
                            font: { size: 11 },
                            filter: function(item, chart) {
                                // Make Total more prominent in legend
                                return true;
                            }
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
                                const prefix = label === 'Total' ? '💰 ' : '   ';
                                return prefix + label + ': ₹' + value.toLocaleString('en-IN');
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
     */
    getCategoryData(includeExcluded = false) {
        const selector = document.getElementById('category-month-selector');
        if (!selector) return [];
        
        const [year, month] = selector.value.split('-').map(Number);
        
        // Get all expenses for the selected month
        const expenses = window.DB.expenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getFullYear() === year && expDate.getMonth() + 1 === month;
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
     * Get regular expenses for current month (excluding expenses with 'emi' or 'recurring' categories)
     */
    getRegularExpenses() {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        // Get only regular expenses (non-recurring, non-EMI) for current month
        let regularTotal = 0;
        expenses.forEach(expense => {
            const expenseDate = new Date(expense.date);
            const expenseYear = expenseDate.getFullYear();
            const expenseMonth = expenseDate.getMonth() + 1;
            
            // Only count expenses in current month that are NOT 'emi' or 'recurring'
            if (expenseYear === currentYear && expenseMonth === currentMonth) {
                const category = (expense.category || '').toLowerCase();
                // Exclude expenses with category 'emi' or 'recurring'
                if (category !== 'emi' && category !== 'recurring') {
                    regularTotal += parseFloat(expense.amount) || 0;
                }
            }
        });
        
        return regularTotal;
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
     */
    getMonthExpenses(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getFullYear() === year && (expDate.getMonth() + 1) === month;
            })
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    },
    
    /**
     * Get total monthly investments for selected filter month
     */
    getMonthInvestments(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const goldRate = window.DB.goldRatePerGram || 7000;
        
        return monthlyInvestments
            .filter(inv => {
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
     * @param {number} expenseYear - Year of expenses
     * @param {number} expenseMonth - Month of expenses (1-12)
     * @returns {Object} { income: number|null, month: number, year: number, monthName: string }
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
        
        // Try to find actual salary first
        const salaries = window.DB.salaries || [];
        const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
        
        if (actualSalary) {
            return { income: actualSalary.amount, month: incomeMonth, year: incomeYear, monthName };
        }
        
        // Fallback to estimated payslip
        const incomeData = window.DB.income || {};
        const ctc = incomeData.ctc || 0;
        
        if (!ctc || ctc === 0) {
            return { income: null, month: incomeMonth, year: incomeYear, monthName };
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
        const income = payslip ? (payslip.totalNetPay || payslip.netPay || 0) : null;
        
        return { income, month: incomeMonth, year: incomeYear, monthName };
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
                <!-- Header with Month Label and Selector -->
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <div>
                        <h3 class="text-sm font-semibold text-gray-700">${this.getFormattedFilterMonth(filterMonth)}</h3>
                        ${paySchedule === 'last_week' ? `<p class="text-[10px] text-gray-500">vs ${incomeData.monthName} income</p>` : ''}
                    </div>
                    <div class="relative">
                        <input type="month" id="filter-month-selector" value="${filterMonth}" onchange="Dashboard.updateFilterMonthButton()" class="absolute opacity-0 pointer-events-none" />
                        <button id="filter-month-button" onclick="document.getElementById('filter-month-selector').showPicker()" class="px-2 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                            ▼
                        </button>
                    </div>
                </div>
                
                <!-- Breakdown Cards -->
                <div class="grid grid-cols-3 gap-3 max-w-full">
                    <div class="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Expenses</div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncomeData 
                                ? `<div class="text-3xl font-bold">${expensesPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(expenses))}</div>
                            <button onclick="Dashboard.showTooltip(event, '${incomeSourceLabel}')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    
                    <div class="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Investments</div>
                        <div class="flex-1 flex items-center justify-center">
                            ${hasIncomeData 
                                ? `<div class="text-3xl font-bold">${investmentsPercent}<span class="text-lg opacity-80">%</span></div>`
                                : `<div class="text-xl font-bold opacity-70">N/A</div>`
                            }
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(investments))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Total monthly investments added in selected month')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
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
                            <button onclick="Dashboard.showTooltip(event, '${hasIncomeData ? 'Balance: Income - (Expenses + Investments). ' + incomeSourceLabel : 'No income data for ' + incomeData.monthName + ' ' + incomeData.year}')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
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

