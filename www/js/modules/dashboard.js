/**
 * Dashboard Module
 * Provides overview of expenses, income, and EMI/Loan progress
 */

const Dashboard = {
    
    /**
     * Render dashboard
     */
    render() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;
        
        // Destroy all existing chart instances first
        this.destroyAllCharts();
        
        // Get data for last 6 months
        const expenses = this.getExpensesData();
        const income = this.getIncomeData();
        const loans = this.getLoansData();
        
        container.innerHTML = `
            <!-- Expenses Chart -->
            <div class="bg-white rounded-xl shadow-lg p-4 border-2 border-purple-200">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="text-lg font-bold text-purple-900">Monthly Expenses (Last 6 Months)</h2>
                    <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" id="include-loans-toggle" onchange="Dashboard.toggleLoans()" class="w-4 h-4">
                        <span class="text-gray-700">Include Loans</span>
                    </label>
                </div>
                <div style="height: ${Math.min(300, expenses.length * 50)}px;">
                    <canvas id="expenses-chart"></canvas>
                </div>
            </div>
            
            <!-- Income vs Expense Chart -->
            <div class="bg-white rounded-xl shadow-lg p-4 border-2 border-green-200">
                <h2 class="text-lg font-bold text-green-900 mb-3">Income vs Expenses (Last 6 Months)</h2>
                <div style="height: ${Math.min(350, expenses.length * 50)}px;">
                    <canvas id="income-expense-chart"></canvas>
                </div>
            </div>
            
            <!-- EMI/Loan Progress -->
            ${loans.length > 0 ? `
            <div class="bg-white rounded-xl shadow-lg p-4 border-2 border-blue-200">
                <h2 class="text-lg font-bold text-blue-900 mb-3">EMI/Loan Progress</h2>
                <div style="height: ${Math.max(200, Math.min(400, loans.length * 60))}px;">
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
        if (this.expensesChartInstance) {
            try {
                this.expensesChartInstance.destroy();
                this.expensesChartInstance = null;
            } catch (e) {
                console.error('Error destroying expenses chart:', e);
            }
        }
        if (this.incomeExpenseChartInstance) {
            try {
                this.incomeExpenseChartInstance.destroy();
                this.incomeExpenseChartInstance = null;
            } catch (e) {
                console.error('Error destroying income/expense chart:', e);
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
     * Get expenses data for last 6 months
     */
    getExpensesData() {
        const now = new Date();
        const monthsData = [];
        
        for (let i = 5; i >= 0; i--) {
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
     * Get income data for last 6 months
     */
    getIncomeData() {
        const now = new Date();
        const monthsData = [];
        
        const income = window.DB.income;
        if (!income || !income.ctc) {
            return [];
        }
        
        // Generate payslips for all months
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        // Get financial year months
        const financialMonths = ['April', 'May', 'June', 'July', 'August', 'September', 
                                'October', 'November', 'December', 'January', 'February', 'March'];
        
        for (let i = 5; i >= 0; i--) {
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
            this.renderExpensesChart(false);
            this.renderIncomeExpenseChart();
            this.renderLoansChart();
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    },
    
    /**
     * Toggle loans in expenses chart
     */
    toggleLoans() {
        const includeLoans = document.getElementById('include-loans-toggle').checked;
        this.renderExpensesChart(includeLoans);
    },
    
    /**
     * Render expenses chart
     */
    renderExpensesChart(includeLoans) {
        const canvas = document.getElementById('expenses-chart');
        if (!canvas) {
            console.warn('Expenses chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from expenses chart canvas');
            return;
        }
        
        const data = this.getExpensesData();
        
        // Destroy existing chart
        if (this.expensesChartInstance) {
            try {
                this.expensesChartInstance.destroy();
                this.expensesChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing expenses chart:', e);
            }
        }
        
        this.expensesChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'Expenses',
                    data: data.map(d => includeLoans ? d.withLoans : d.withoutLoans),
                    backgroundColor: 'rgba(147, 51, 234, 0.6)',
                    borderColor: 'rgba(147, 51, 234, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: function(context) {
                            const maxValue = Math.max(...context.chart.data.datasets[0].data);
                            return Math.ceil(maxValue / 100000) * 100000; // Round to nearest 100k
                        },
                        ticks: {
                            callback: function(value) {
                                return '₹' + (value >= 100000 ? (value/100000).toFixed(1) + 'L' : (value >= 1000 ? (value/1000).toFixed(0) + 'k' : value));
                            },
                            stepSize: 100000
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        grid: {
                            display: false
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
        
        const expensesData = this.getExpensesData();
        const incomeData = this.getIncomeData();
        
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
                        backgroundColor: 'rgba(34, 197, 94, 0.6)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Expenses',
                        data: expensesData.map(d => d.withoutLoans),
                        backgroundColor: 'rgba(239, 68, 68, 0.6)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: function(context) {
                            const allValues = context.chart.data.datasets.flatMap(ds => ds.data);
                            const maxValue = Math.max(...allValues);
                            return Math.ceil(maxValue / 100000) * 100000; // Round to nearest 100k
                        },
                        ticks: {
                            callback: function(value) {
                                return '₹' + (value >= 100000 ? (value/100000).toFixed(1) + 'L' : (value >= 1000 ? (value/1000).toFixed(0) + 'k' : value));
                            },
                            stepSize: 100000
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        grid: {
                            display: false
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
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
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
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
}

