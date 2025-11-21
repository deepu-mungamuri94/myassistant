/**
 * Dashboard Module
 * Provides overview of expenses, income, and EMI/Loan progress
 */

const Dashboard = {
    // Store selected month range
    selectedMonthRange: null,
    // Store selected filter month for second line cards
    selectedFilterMonth: null,
    
    /**
     * Render dashboard
     */
    render() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;
        
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
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
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
            
            <!-- Category Expenses Chart -->
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <h3 class="text-sm font-semibold text-gray-700">Expenses by Category</h3>
                    <div class="relative">
                        <input type="month" id="category-month-selector" value="${this.getCurrentMonthValue()}" onchange="Dashboard.updateCategoryButton(); Dashboard.renderCategoryChart()" class="absolute opacity-0 pointer-events-none" />
                        <button id="category-month-button" onclick="document.getElementById('category-month-selector').showPicker()" class="px-3 py-1.5 border border-purple-300 rounded-lg text-xs font-medium text-purple-700 hover:bg-purple-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(this.getCurrentMonthValue())} ▼
                        </button>
                    </div>
                </div>
                <div class="flex justify-center max-w-full" style="height: 210px;">
                    <div style="width: 70%; max-width: 500px;">
                        <canvas id="category-chart"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Income vs Expenses Chart -->
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
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
            
            <!-- EMI/Loan Progress -->
            ${loans.length > 0 ? `
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <h3 class="text-sm font-semibold text-gray-700 mb-3">EMI/Loan Progress</h3>
                <div style="height: ${Math.max(200, Math.min(400, loans.length * 60))}px; max-width: 100%;">
                    <canvas id="loans-chart"></canvas>
                </div>
            </div>
            ` : ''}
        `;
        
        // Initialize charts after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.initializeCharts();
        }, 100);
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
                
                const total = monthExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
                
                // Get loans EMI for this month
                const loans = window.DB.loans || [];
                const monthLoans = loans.filter(loan => {
                    if (loan.status !== 'active') return false;
                    const firstEmiDate = new Date(loan.firstEmiDate);
                    const loanMonth = new Date(currentYear, currentMonth - 1, 1);
                    return firstEmiDate <= loanMonth;
                });
                
                const totalLoansEmi = monthLoans.reduce((sum, loan) => {
                    const emi = parseFloat(loan.emi) || 0;
                    return sum + emi;
                }, 0);
                
                monthsData.push({
                    label: monthName,
                    expenses: total,
                    withLoans: total + totalLoansEmi
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
     */
    getIncomeData(monthsCount = 6) {
        const monthsData = [];
        
        const income = window.DB.income;
        if (!income || !income.ctc) {
            return [];
        }
        
        // Generate payslips for all months
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        // Use custom range if selected
        if (this.selectedMonthRange) {
            const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'long' });
                const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Find payslip for this month
                const payslip = yearlyPayslips.find(p => p.month === monthName);
                const netPay = payslip ? payslip.totalNetPay : 0;
                
                monthsData.push({
                    label: shortMonth,
                    income: netPay
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
            const monthName = date.toLocaleDateString('en-US', { month: 'long' });
            const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });
            
            // Find payslip for this month
            const payslip = yearlyPayslips.find(p => p.month === monthName);
            const netPay = payslip ? payslip.totalNetPay : 0;
            
            monthsData.push({
                label: shortMonth,
                income: netPay
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
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
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
            type: 'bar',
            data: {
                labels: expensesData.map(d => d.label),
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData.map(d => d.income),
                        backgroundColor: 'rgba(34, 197, 94, 0.85)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Expenses',
                        data: expensesData.map(d => d.withoutLoans),
                        backgroundColor: 'rgba(239, 68, 68, 0.85)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
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
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + (value >= 100000 ? (value/100000).toFixed(1) + 'L' : (value >= 1000 ? (value/1000).toFixed(0) + 'k' : value));
                            },
                            stepSize: 25000
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
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
    getCategoryData() {
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
        
        // Convert to array and sort by amount
        return Object.entries(categoryMap)
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount);
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
        
        const data = this.getCategoryData();
        
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
                        display: true,
                        position: 'right',
                        align: 'center',
                        labels: {
                            boxWidth: 12,
                            padding: 8,
                            font: {
                                size: 10
                            },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
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
    },
    
    /**
     * Get minimum net pay across all 12 months of payslips
     */
    getMinimumNetPay() {
        const income = window.DB.income;
        console.log('=== MINIMUM NET PAY DEBUG ===');
        console.log('Income data:', income);
        
        if (!income || !income.ctc) {
            console.log('No income or CTC found, returning 0');
            return 0;
        }
        
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        console.log('CTC:', ctc, 'Bonus:', bonusPercent, 'ESPP1:', esppPercentCycle1, 'ESPP2:', esppPercentCycle2, 'PF:', pfPercent);
        
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        console.log('Generated payslips:', yearlyPayslips.length);
        
        if (yearlyPayslips.length === 0) {
            console.log('No payslips generated, returning 0');
            return 0;
        }
        
        // Find minimum net pay
        yearlyPayslips.forEach((p, i) => {
            console.log(`  ${p.month}: ₹${p.totalNetPay}`);
        });
        
        const minNetPay = Math.min(...yearlyPayslips.map(p => p.totalNetPay));
        console.log('Minimum Net Pay:', minNetPay);
        return minNetPay;
    },
    
    /**
     * Get total recurring expenses for current month (excluding Loan EMI and Credit Card EMI)
     */
    getTotalRecurringExpenses() {
        console.log('=== RECURRING EXPENSES DEBUG ===');
        
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        console.log(`Calculating for: ${currentYear}-${String(currentMonth).padStart(2, '0')}`);
        
        if (!window.RecurringExpenses) {
            console.log('RecurringExpenses module not available');
            return 0;
        }
        
        // Get all recurring expenses due this month using the same logic as Recurring page
        const allRecurring = window.RecurringExpenses.getAll();
        console.log('Total recurring items:', allRecurring.length);
        
        let total = 0;
        let excludedTotal = 0;
        
        allRecurring.forEach((recurring, i) => {
            console.log(`${i+1}. ${recurring.name} - Category: "${recurring.category || 'none'}" - Amount: ₹${recurring.amount}`);
            
            // Skip inactive
            if (recurring.isActive === false) {
                console.log(`   ✗ Skipped (inactive)`);
                return;
            }
            
            // Skip if end date is before this month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(currentYear, currentMonth - 1, 1);
                if (checkDate > endDate) {
                    console.log(`   ✗ Skipped (ended before this month)`);
                    return;
                }
            }
            
            // Check if due in this month (reusing RecurringExpenses.isDueInMonth)
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, currentYear, currentMonth);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category === 'Loan EMI' || category === 'Credit Card EMI') {
                    excludedTotal += recurring.amount;
                    console.log(`   ✗ Excluded ₹${recurring.amount} (EMI category: "${category}")`);
                } else {
                    total += recurring.amount;
                    console.log(`   ✓ Added ₹${recurring.amount}`);
                }
            } else {
                console.log(`   ✗ Not due in current month`);
            }
        });
        
        console.log(`Total Recurring Expenses (excluding EMIs): ₹${total}`);
        console.log(`Excluded EMIs: ₹${excludedTotal}`);
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
        
        console.log('=== EMIs DEBUG ===');
        console.log(`Current Month: ${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`);
        console.log('Total loans:', loans.length);
        console.log('Total cards:', cards.length);
        
        // Add active loan EMIs
        loans.forEach((loan, i) => {
            console.log(`Loan ${i+1}: ${loan.bankName || 'Unknown'} - ${loan.reason || loan.loanType || 'Loan'}`);
            
            // Check if loan has started before or during this month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const currentMonthStart = new Date(currentYear, currentMonth, 1);
            
            if (firstEmiMonth > currentMonthStart) {
                console.log(`  ✗ Not started yet (starts: ${loan.firstEmiDate})`);
                return;
            }
            
            // Calculate remaining EMIs and EMI amount
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                console.log(`  EMIs Remaining: ${remaining.emisRemaining} / ${loan.tenure}`);
                
                // Calculate EMI amount if not stored
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                    console.log(`  Monthly EMI (calculated): ₹${emiAmount}`);
                } else {
                    console.log(`  Monthly EMI (stored): ₹${emiAmount || 'N/A'}`);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    total += parseFloat(emiAmount);
                    console.log(`  ✓ Added ₹${emiAmount} to total (EMI is due this month)`);
                } else if (remaining.emisRemaining > 0) {
                    console.log(`  ✗ EMI amount not available (need amount, rate, tenure)`);
                } else {
                    console.log(`  ✗ Loan completed`);
                }
            } else {
                console.log(`  ✗ Loans module not available`);
            }
        });
        
        // Add active credit card EMIs
        cards.forEach((card, i) => {
            // Skip debit cards
            if (card.cardType === 'debit') {
                return;
            }
            
            console.log(`Card ${i+1}: ${card.nickname || card.name}`);
            if (card.emis && card.emis.length > 0) {
                console.log(`  Total EMI entries: ${card.emis.length}`);
                card.emis.forEach((emi, j) => {
                    console.log(`    EMI ${j+1}: ${emi.reason}`);
                    
                    // Check if EMI has started before or during this month
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const currentMonthStart = new Date(currentYear, currentMonth, 1);
                        
                        if (emiFirstMonth > currentMonthStart) {
                            console.log(`      ✗ Not started yet (starts: ${emi.firstEmiDate})`);
                            return;
                        }
                    }
                    
                    // Check if completed (using correct field names)
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    console.log(`      Paid: ${paidCount} / Total: ${totalCount}, Remaining: ${remaining}`);
                    console.log(`      EMI Amount: ₹${emi.emiAmount || 'N/A'}`);
                    console.log(`      Status: ${emi.status || 'active'}, Completed: ${emi.completed}`);
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        total += parseFloat(emi.emiAmount);
                        console.log(`      ✓ Added ₹${emi.emiAmount} to total (EMI is due this month)`);
                    } else {
                        console.log(`      ✗ Skipped (completed: ${emi.completed}, remaining: ${remaining})`);
                    }
                });
            }
        });
        
        console.log('Total EMIs for current month: ₹', total);
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
     * Render monthly breakdown section (second line)
     */
    renderMonthlyBreakdown() {
        const filterMonth = this.getFilterMonthValue();
        const expenses = this.getMonthExpenses(filterMonth);
        const investments = this.getMonthInvestments(filterMonth);
        const netPay = this.getMonthNetPay(filterMonth);
        
        const balance = netPay - expenses - investments;
        const expensesPercent = netPay > 0 ? ((expenses / netPay) * 100).toFixed(1) : 0;
        const investmentsPercent = netPay > 0 ? ((investments / netPay) * 100).toFixed(1) : 0;
        const balancePercent = netPay > 0 ? ((balance / netPay) * 100).toFixed(1) : 0;
        
        return `
            <!-- Monthly Breakdown Cards Box -->
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 shadow-sm mb-4 max-w-full overflow-hidden">
                <!-- Header with Month Label and Selector -->
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <h3 class="text-sm font-semibold text-gray-700">${this.getFormattedFilterMonth(filterMonth)}</h3>
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
                            <div class="text-3xl font-bold">${expensesPercent}<span class="text-lg opacity-80">%</span></div>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(expenses))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Total expenses for selected month from Expenses page')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    
                    <div class="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Investments</div>
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-3xl font-bold">${investmentsPercent}<span class="text-lg opacity-80">%</span></div>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(investments))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Total monthly investments added in selected month')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
                        </div>
                    </div>
                    
                    <div class="bg-gradient-to-br ${balance >= 0 ? 'from-teal-500 to-cyan-600' : 'from-gray-500 to-gray-600'} rounded-lg p-3 text-white shadow-lg relative flex flex-col">
                        <div class="text-xs opacity-90 leading-tight">Balance</div>
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-3xl font-bold">${balancePercent}<span class="text-lg opacity-80">%</span></div>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="text-xs opacity-90">₹${Utils.formatIndianNumber(Math.round(balance))}</div>
                            <button onclick="Dashboard.showTooltip(event, 'Balance: Net Pay - (Expenses + Investments) for selected month')" class="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0">i</button>
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

