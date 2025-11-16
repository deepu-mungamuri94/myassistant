/**
 * Loans Module
 * Manages loan tracking with EMI calculations
 */

const Loans = {
    /**
     * Add a new loan
     */
    add(bankName, reason, amount, interestRate, tenure, firstEmiDate) {
        if (!bankName || !reason || !amount || !interestRate || !tenure || !firstEmiDate) {
            throw new Error('All fields are required');
        }
        
        const loan = {
            id: Utils.generateId(),
            bankName: bankName.trim(),
            reason: reason.trim(),
            amount: parseFloat(amount),
            interestRate: parseFloat(interestRate),
            tenure: parseInt(tenure),
            firstEmiDate: firstEmiDate,
            createdAt: Utils.getCurrentTimestamp(),
            isActive: true
        };
        
        window.DB.loans.push(loan);
        window.Storage.save();
        
        return loan;
    },
    
    /**
     * Update a loan
     */
    update(id, bankName, reason, amount, interestRate, tenure, firstEmiDate) {
        const loan = this.getById(id);
        if (!loan) throw new Error('Loan not found');
        
        loan.bankName = bankName.trim();
        loan.reason = reason.trim();
        loan.amount = parseFloat(amount);
        loan.interestRate = parseFloat(interestRate);
        loan.tenure = parseInt(tenure);
        loan.firstEmiDate = firstEmiDate;
        loan.lastUpdated = Utils.getCurrentTimestamp();
        
        window.Storage.save();
        return loan;
    },
    
    /**
     * Delete a loan
     */
    async delete(id) {
        const loan = this.getById(id);
        if (!loan) throw new Error('Loan not found');
        
        const confirmed = await window.Utils.confirm(
            `Delete loan "${loan.reason}" from ${loan.bankName}?`,
            'Delete Loan'
        );
        
        if (!confirmed) return false;
        
        const index = window.DB.loans.findIndex(l => String(l.id) === String(id));
        if (index !== -1) {
            window.DB.loans.splice(index, 1);
            window.Storage.save();
            this.render();
            window.Toast.success('Loan deleted successfully');
        }
        return true;
    },
    
    /**
     * Get loan by ID
     */
    getById(id) {
        return window.DB.loans.find(l => String(l.id) === String(id));
    },
    
    /**
     * Get all loans
     */
    getAll() {
        return window.DB.loans;
    },
    
    /**
     * Calculate monthly EMI using standard formula
     * EMI = P × r × (1 + r)^n / ((1 + r)^n - 1)
     * P = Principal, r = Monthly interest rate, n = Number of months
     */
    calculateEMI(principal, annualRate, tenure) {
        const monthlyRate = (annualRate / 12) / 100;
        if (monthlyRate === 0) return principal / tenure;
        
        const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
                    (Math.pow(1 + monthlyRate, tenure) - 1);
        return Math.round(emi * 100) / 100; // Round to 2 decimals
    },
    
    /**
     * Calculate total amount payable
     */
    calculateTotalAmount(emi, tenure) {
        return emi * tenure;
    },
    
    /**
     * Calculate total interest
     */
    calculateTotalInterest(totalAmount, principal) {
        return totalAmount - principal;
    },
    
    /**
     * Calculate loan closure date
     */
    calculateClosureDate(firstEmiDate, tenure) {
        const startDate = new Date(firstEmiDate);
        const closureDate = new Date(startDate);
        closureDate.setMonth(closureDate.getMonth() + tenure);
        return closureDate;
    },
    
    /**
     * Calculate remaining balance and EMIs
     */
    calculateRemaining(firstEmiDate, principal, annualRate, tenure) {
        const today = new Date();
        const startDate = new Date(firstEmiDate);
        
        // Calculate months elapsed
        let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 
                          + (today.getMonth() - startDate.getMonth());
        
        // If today's date is before the EMI date in the month, subtract 1
        if (today.getDate() < startDate.getDate()) {
            monthsElapsed--;
        }
        
        // Ensure non-negative
        if (monthsElapsed < 0) monthsElapsed = 0;
        if (monthsElapsed > tenure) monthsElapsed = tenure;
        
        const remainingTenure = tenure - monthsElapsed;
        
        // Calculate remaining principal using outstanding balance formula
        const monthlyRate = (annualRate / 12) / 100;
        const emi = this.calculateEMI(principal, annualRate, tenure);
        
        let remainingBalance;
        if (remainingTenure <= 0) {
            remainingBalance = 0;
        } else if (monthlyRate === 0) {
            remainingBalance = (principal / tenure) * remainingTenure;
        } else {
            // Outstanding balance = P * [(1 + r)^n - (1 + r)^p] / [(1 + r)^n - 1]
            // where p = EMIs paid, n = total tenure
            const factor1 = Math.pow(1 + monthlyRate, tenure);
            const factor2 = Math.pow(1 + monthlyRate, monthsElapsed);
            remainingBalance = principal * (factor1 - factor2) / (factor1 - 1);
        }
        
        return {
            emisPaid: monthsElapsed,
            emisRemaining: remainingTenure,
            remainingBalance: Math.round(remainingBalance * 100) / 100
        };
    },
    
    /**
     * Render loans list
     */
    render() {
        const list = document.getElementById('loans-list');
        if (!list) return;
        
        const loans = this.getAll();
        
        if (loans.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No loans yet. Add your first one above!</p>';
            return;
        }
        
        list.innerHTML = loans.map(loan => {
            const emi = this.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
            const totalAmount = this.calculateTotalAmount(emi, loan.tenure);
            const totalInterest = this.calculateTotalInterest(totalAmount, loan.amount);
            const closureDate = this.calculateClosureDate(loan.firstEmiDate, loan.tenure);
            const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
            
            const progress = ((loan.tenure - remaining.emisRemaining) / loan.tenure) * 100;
            const isCompleted = remaining.emisRemaining === 0;
            
            return `
                <div class="p-4 bg-gradient-to-br from-blue-50 via-white to-cyan-50 rounded-xl border-2 ${isCompleted ? 'border-green-400' : 'border-blue-300'} hover:shadow-lg transition-all">
                    <!-- Top Row: Bank & Reason + Actions -->
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h4 class="font-bold text-blue-900 text-lg">${Utils.escapeHtml(loan.bankName)}</h4>
                            <p class="text-sm text-blue-700">${Utils.escapeHtml(loan.reason)}</p>
                        </div>
                        <div class="flex gap-2">
                            ${!isCompleted ? `
                                <button onclick="openLoanModal(${loan.id})" class="text-blue-600 hover:text-blue-800 p-1" title="Edit">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                    </svg>
                                </button>
                            ` : ''}
                            <button onclick="Loans.delete(${loan.id})" class="text-red-600 hover:text-red-800 p-1" title="Delete">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Status Badge -->
                    ${isCompleted ? `
                        <div class="mb-3 inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                            ✓ Loan Completed
                        </div>
                    ` : ''}
                    
                    <!-- Loan Details Grid -->
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div class="bg-white bg-opacity-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-600">Principal Amount</p>
                            <p class="font-bold text-blue-900">₹${Utils.formatIndianNumber(loan.amount)}</p>
                        </div>
                        <div class="bg-white bg-opacity-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-600">Interest Rate</p>
                            <p class="font-bold text-blue-900">${loan.interestRate}% p.a.</p>
                        </div>
                        <div class="bg-white bg-opacity-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-600">Monthly EMI</p>
                            <p class="font-bold text-blue-900">₹${Utils.formatIndianNumber(emi)}</p>
                        </div>
                        <div class="bg-white bg-opacity-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-600">Tenure</p>
                            <p class="font-bold text-blue-900">${loan.tenure} months</p>
                        </div>
                    </div>
                    
                    <!-- Progress Bar -->
                    <div class="mb-3">
                        <div class="flex justify-between text-xs text-gray-600 mb-1">
                            <span>${remaining.emisPaid} / ${loan.tenure} EMIs paid</span>
                            <span>${Math.round(progress)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    
                    <!-- Financial Summary -->
                    <div class="space-y-2 bg-white bg-opacity-70 p-3 rounded-lg">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Total Payable:</span>
                            <span class="font-bold text-blue-900">₹${Utils.formatIndianNumber(totalAmount)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Total Interest:</span>
                            <span class="font-bold text-orange-700">₹${Utils.formatIndianNumber(totalInterest)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Balance Remaining:</span>
                            <span class="font-bold ${isCompleted ? 'text-green-700' : 'text-red-700'}">₹${Utils.formatIndianNumber(remaining.remainingBalance)}</span>
                        </div>
                        <div class="flex justify-between text-sm pt-2 border-t border-gray-200">
                            <span class="text-gray-700">Closure Date:</span>
                            <span class="font-semibold text-blue-800">${closureDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
};

// Export to global
window.Loans = Loans;

