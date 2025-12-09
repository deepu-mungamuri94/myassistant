/**
 * Loans Module
 * Manages loan tracking with EMI calculations
 */

const Loans = {
    expandedLoans: new Set(), // Track which loans are expanded
    viewModalExpanded: false, // Track expansion in view modal
    currentTab: 'active', // Track current active tab (active/closed)
    mainTab: 'borrowed', // Track main tab (borrowed/lentout)
    lentOutTab: 'active', // Track lent out sub-tab (active/closed)
    
    /**
     * Show loan details in a view-only modal
     */
    showDetailsModal(loanId) {
        const loan = window.DB.loans.find(l => l.id === loanId || String(l.id) === String(loanId));
        if (!loan) {
            Utils.showError('Loan not found');
            return;
        }
        
        // Force expand for view modal
        this.viewModalExpanded = true;
        
        // Check if loan is completed
        const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
        const isCompleted = remaining.emisRemaining === 0;
        
        // Render the loan card (same design as list)
        const cardHtml = this.renderLoanCardForModal(loan, isCompleted);
        
        // Create and show modal
        const modalHtml = `
            <div id="loan-details-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 z-[1001] flex items-center justify-center p-4" onclick="if(event.target===this) Loans.closeDetailsModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                        <h2 class="text-xl font-bold text-white">Loan Details</h2>
                        <button onclick="Loans.closeDetailsModal()" class="text-white hover:text-gray-200 p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="p-6">
                        ${cardHtml}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existing = document.getElementById('loan-details-modal');
        if (existing) existing.remove();
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    /**
     * Close details modal
     */
    closeDetailsModal() {
        const modal = document.getElementById('loan-details-modal');
        if (modal) modal.remove();
        this.viewModalExpanded = false;
    },
    
    /**
     * Toggle expansion in view modal
     */
    toggleViewModalExpansion() {
        this.viewModalExpanded = !this.viewModalExpanded;
        // Re-render modal content
        const modal = document.getElementById('loan-details-modal');
        if (modal) {
            // Get the loan ID from the modal (we'll need to store it)
            const loanId = modal.dataset.loanId;
            if (loanId) {
                this.showDetailsModal(parseInt(loanId));
            }
        }
    },
    
    /**
     * Toggle loan expansion
     */
    toggleExpansion(loanId) {
        if (this.expandedLoans.has(loanId)) {
            this.expandedLoans.delete(loanId);
        } else {
            this.expandedLoans.add(loanId);
        }
        this.render();
    },
    
    /**
     * Switch between Borrowed and Lent Out main tabs
     */
    switchMainTab(tab) {
        this.mainTab = tab;
        
        // Update inline tabs (if they exist)
        const borrowedBtn = document.getElementById('main-tab-borrowed');
        const lentoutBtn = document.getElementById('main-tab-lentout');
        const borrowedContent = document.getElementById('main-content-borrowed');
        const lentoutContent = document.getElementById('main-content-lentout');
        
        // Update bottom tabs
        const borrowedBottomBtn = document.getElementById('loans-bottom-tab-borrowed');
        const lentoutBottomBtn = document.getElementById('loans-bottom-tab-lentout');
        
        // Reset all tabs to inactive state
        if (borrowedBtn) borrowedBtn.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        if (lentoutBtn) lentoutBtn.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        if (borrowedContent) borrowedContent.classList.add('hidden');
        if (lentoutContent) lentoutContent.classList.add('hidden');
        
        // Activate selected tab
        if (tab === 'borrowed') {
            if (borrowedBtn) borrowedBtn.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-blue-500 text-blue-600';
            if (borrowedContent) borrowedContent.classList.remove('hidden');
            if (borrowedBottomBtn) borrowedBottomBtn.className = 'flex-1 py-3 px-3 rounded-lg transition-all font-medium text-sm bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md';
            if (lentoutBottomBtn) lentoutBottomBtn.className = 'flex-1 py-3 px-3 rounded-lg transition-all font-medium text-sm bg-gray-200 text-gray-700 hover:bg-gray-300';
        } else if (tab === 'lentout') {
            if (lentoutBtn) lentoutBtn.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-teal-500 text-teal-600';
            if (lentoutContent) lentoutContent.classList.remove('hidden');
            if (borrowedBottomBtn) borrowedBottomBtn.className = 'flex-1 py-3 px-3 rounded-lg transition-all font-medium text-sm bg-gray-200 text-gray-700 hover:bg-gray-300';
            if (lentoutBottomBtn) lentoutBottomBtn.className = 'flex-1 py-3 px-3 rounded-lg transition-all font-medium text-sm bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md';
        }
    },
    
    /**
     * Switch between Active and Closed tabs in loans page
     */
    switchLoansTab(tab) {
        // Store current tab
        this.currentTab = tab;
        
        // Tab buttons
        const activeTab = document.getElementById('loans-tab-active');
        const closedTab = document.getElementById('loans-tab-closed');
        
        // Tab contents
        const activeContent = document.getElementById('loans-content-active');
        const closedContent = document.getElementById('loans-content-closed');
        
        if (tab === 'active') {
            // Activate active tab
            if (activeTab) {
                activeTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-blue-500 text-blue-600 flex items-center justify-center gap-2';
            }
            if (closedTab) {
                closedTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            }
            
            // Show active content
            if (activeContent) activeContent.classList.remove('hidden');
            if (closedContent) closedContent.classList.add('hidden');
        } else if (tab === 'closed') {
            // Activate closed tab
            if (activeTab) {
                activeTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            }
            if (closedTab) {
                closedTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-green-500 text-green-600 flex items-center justify-center gap-2';
            }
            
            // Show closed content
            if (activeContent) activeContent.classList.add('hidden');
            if (closedContent) closedContent.classList.remove('hidden');
        }
    },
    
    /**
     * Switch between Active and Closed tabs in lent out section
     */
    switchLentOutTab(tab) {
        // Store current lent out tab
        this.lentOutTab = tab;
        
        // Tab buttons
        const activeTab = document.getElementById('lentout-tab-active');
        const closedTab = document.getElementById('lentout-tab-closed');
        
        // Tab contents
        const activeContent = document.getElementById('lentout-content-active');
        const closedContent = document.getElementById('lentout-content-closed');
        
        if (tab === 'active') {
            // Activate active tab
            if (activeTab) {
                activeTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-teal-500 text-teal-600 flex items-center justify-center gap-2';
            }
            if (closedTab) {
                closedTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            }
            
            // Show active content
            if (activeContent) activeContent.classList.remove('hidden');
            if (closedContent) closedContent.classList.add('hidden');
        } else if (tab === 'closed') {
            // Activate closed tab
            if (activeTab) {
                activeTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2';
            }
            if (closedTab) {
                closedTab.className = 'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-green-500 text-green-600 flex items-center justify-center gap-2';
            }
            
            // Show closed content
            if (activeContent) activeContent.classList.add('hidden');
            if (closedContent) closedContent.classList.remove('hidden');
        }
    },
    
    /**
     * Add a new loan
     */
    add(bankName, loanType, reason, amount, interestRate, tenure, firstEmiDate) {
        if (!bankName || !loanType || !amount || !interestRate || !tenure || !firstEmiDate) {
            throw new Error('All required fields must be filled');
        }
        
        const loan = {
            id: Utils.generateId(),
            bankName: bankName.trim(),
            loanType: loanType.trim(),
            reason: reason ? reason.trim() : '',
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
    update(id, bankName, loanType, reason, amount, interestRate, tenure, firstEmiDate) {
        const loan = this.getById(id);
        if (!loan) throw new Error('Loan not found');
        
        loan.bankName = bankName.trim();
        loan.loanType = loanType.trim();
        loan.reason = reason ? reason.trim() : '';
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
        
        // Check if there are any EMI expenses linked to this loan
        const loanEmiTitle = `${loan.bankName} ${loan.loanType || 'Loan'} EMI`;
        const linkedExpenses = window.DB.expenses.filter(e => 
            e.title === loanEmiTitle || e.title.includes(loan.bankName)
        );
        
        // Check if loan is still active (has remaining EMIs)
        const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
        const isActive = remaining.emisRemaining > 0;
        
        let message = `Delete loan "${loan.reason}" from ${loan.bankName}?`;
        
        if (linkedExpenses.length > 0) {
            message += `\n\n⚠️ Warning: ${linkedExpenses.length} EMI expense(s) are linked to this loan. They will remain in your expenses but the loan link will show as deleted.`;
        }
        
        if (isActive) {
            message += `\n\n⚠️ This loan has ${remaining.emisRemaining} pending EMI(s). Auto-adding will stop after deletion.`;
        }
        
        message += '\n\nThis action cannot be undone.';
        
        const confirmed = await window.Utils.confirm(
            message,
            'Delete Loan'
        );
        
        if (!confirmed) return false;
        
        const index = window.DB.loans.findIndex(l => String(l.id) === String(id));
        if (index !== -1) {
            window.DB.loans.splice(index, 1);
            window.Storage.save();
            this.render();
            Utils.showSuccess('Loan deleted successfully');
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
        // Ensure values are numbers
        const P = parseFloat(principal);
        const R = parseFloat(annualRate);
        const N = parseInt(tenure);
        
        const monthlyRate = (R / 12) / 100;
        
        if (monthlyRate === 0) {
            return Math.round((P / N) * 100) / 100;
        }
        
        const powerTerm = Math.pow(1 + monthlyRate, N);
        const emi = (P * monthlyRate * powerTerm) / (powerTerm - 1);
        
        return Math.round(emi * 100) / 100; // Round to 2 decimals
    },
    
    /**
     * Calculate total amount payable
     */
    calculateTotalAmount(emi, tenure) {
        const total = parseFloat(emi) * parseInt(tenure);
        return Math.round(total * 100) / 100;
    },
    
    /**
     * Calculate total interest
     */
    calculateTotalInterest(totalAmount, principal) {
        const interest = parseFloat(totalAmount) - parseFloat(principal);
        return Math.round(interest * 100) / 100;
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
        
        // Calculate months elapsed (including start month)
        let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 
                          + (today.getMonth() - startDate.getMonth()) + 1;
        
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
            remainingBalance: Math.round(remainingBalance * 100) / 100,
            totalRemainingPayment: Math.round(emi * remainingTenure * 100) / 100
        };
    },
    
    /**
     * Render loans list
     */
    render() {
        const list = document.getElementById('loans-list');
        if (!list) return;
        
        const loans = this.getAll();
        const moneyLentTotals = window.MoneyLent ? window.MoneyLent.calculateTotals() : { totalLent: 0, totalReturned: 0, totalOutstanding: 0, count: 0 };
        
        // Build borrowed tab content
        let borrowedContent = '';
        let borrowedSummary = '';
        
        if (loans.length === 0) {
            borrowedContent = '<p class="text-gray-500 text-center py-8">No loans yet. Add your first one above!</p>';
        } else {
            // Separate active and closed loans and calculate totals
            const activeLoans = [];
            const closedLoans = [];
            let totalRemainingAmount = 0; // Total future payment (EMI × pending count)
            let totalAmountTaken = 0;
            let totalInterestPaidSoFar = 0;
            let latestClosureDate = null;
            
            loans.forEach(loan => {
                const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                const emi = this.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                totalAmountTaken += parseFloat(loan.amount);
                
                if (remaining.emisRemaining === 0) {
                    closedLoans.push(loan);
                    // Calculate total interest paid for closed loans
                    const totalPaid = emi * loan.tenure;
                    const interestPaid = totalPaid - parseFloat(loan.amount);
                    totalInterestPaidSoFar += interestPaid;
                } else {
                    activeLoans.push(loan);
                    // Use total remaining payment (EMI × pending EMIs)
                    totalRemainingAmount += remaining.totalRemainingPayment;
                    
                    // Calculate interest paid so far for active loans
                    const principalPaid = parseFloat(loan.amount) - remaining.remainingBalance;
                    const totalPaidSoFar = emi * remaining.emisPaid;
                    const interestPaidSoFar = totalPaidSoFar - principalPaid;
                    totalInterestPaidSoFar += interestPaidSoFar;
                    
                    // Find the latest closure date among active loans
                    const closureDate = this.calculateClosureDate(loan.firstEmiDate, loan.tenure);
                    if (!latestClosureDate || closureDate > latestClosureDate) {
                        latestClosureDate = closureDate;
                    }
                }
            });
            
            // Sort loans by first EMI date (earliest first)
            activeLoans.sort((a, b) => new Date(a.firstEmiDate) - new Date(b.firstEmiDate));
            closedLoans.sort((a, b) => new Date(a.firstEmiDate) - new Date(b.firstEmiDate));
            
            // Render summary for borrowed
            borrowedSummary = `
                <div class="mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl p-4 shadow-lg">
                    <div class="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <p class="text-xs opacity-90">Total Borrowed</p>
                            <p class="text-base font-bold">₹${Utils.formatIndianNumber(totalAmountTaken)}</p>
                        </div>
                        <div>
                            <p class="text-xs opacity-90">Remaining to Pay</p>
                            <p class="text-base font-bold">₹${Utils.formatIndianNumber(totalRemainingAmount)}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-xs opacity-90">Interest Paid So Far</p>
                            <p class="text-sm font-bold text-yellow-200">₹${Utils.formatIndianNumber(Math.round(totalInterestPaidSoFar))}</p>
                        </div>
                        ${latestClosureDate ? `
                            <div>
                                <p class="text-xs opacity-90">Last EMI Date</p>
                                <p class="text-sm font-bold">${latestClosureDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                            </div>
                        ` : '<div></div>'}
                    </div>
                </div>
            `;
            
            // Render tabs for Active and Closed loans
            if (activeLoans.length > 0 || closedLoans.length > 0) {
                borrowedContent = borrowedSummary + `
                    <div class="bg-white rounded-xl border-2 border-blue-200 overflow-hidden">
                        <!-- Tabs -->
                        <div class="border-b border-blue-200">
                            <div class="flex justify-evenly">
                                ${activeLoans.length > 0 ? `
                                    <button onclick="Loans.switchLoansTab('active')" 
                                            id="loans-tab-active"
                                            class="flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-blue-500 text-blue-600 flex items-center justify-center gap-2">
                                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"/>
                                        </svg>
                                        Active (${activeLoans.length})
                                    </button>
                                ` : ''}
                                ${closedLoans.length > 0 ? `
                                    <button onclick="Loans.switchLoansTab('closed')" 
                                            id="loans-tab-closed"
                                            class="flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2">
                                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                        </svg>
                                        Closed (${closedLoans.length})
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        
                        <!-- Tab Content: Active Loans -->
                        ${activeLoans.length > 0 ? `
                            <div id="loans-content-active" class="p-3 space-y-3">
                                ${activeLoans.map(loan => this.renderLoanCard(loan, false)).join('')}
                            </div>
                        ` : ''}
                        
                        <!-- Tab Content: Closed Loans -->
                        ${closedLoans.length > 0 ? `
                            <div id="loans-content-closed" class="p-3 space-y-3 hidden">
                                ${closedLoans.map(loan => this.renderLoanCard(loan, true)).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        }
        
        // Build lent out tab content with summary and tabs
        let lentOutContent = '';
        if (window.MoneyLent) {
            // Calculate active and closed counts
            const lentOutRecords = window.MoneyLent.getAll();
            const activeRecords = lentOutRecords.filter(r => {
                const status = window.MoneyLent.getStatus(r);
                return status === 'Pending' || status === 'Partially Returned';
            });
            const closedRecords = lentOutRecords.filter(r => {
                const status = window.MoneyLent.getStatus(r);
                return status === 'Fully Returned';
            });
            
            // Build lent out summary
            let lentOutSummary = '';
            if (moneyLentTotals.count > 0) {
                lentOutSummary = `
                    <div class="mb-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl p-4 shadow-lg">
                        <div class="grid grid-cols-2 gap-4 mb-3">
                            <div>
                                <p class="text-xs opacity-90">Total Lent Out</p>
                                <p class="text-base font-bold">₹${Utils.formatIndianNumber(moneyLentTotals.totalLent)}</p>
                            </div>
                            <div>
                                <p class="text-xs opacity-90">Outstanding</p>
                                <p class="text-base font-bold">₹${Utils.formatIndianNumber(moneyLentTotals.totalOutstanding)}</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-xs opacity-90">Total Returned</p>
                                <p class="text-sm font-bold text-green-200">₹${Utils.formatIndianNumber(Math.round(moneyLentTotals.totalReturned))}</p>
                            </div>
                            <div>
                                <p class="text-xs opacity-90">Records</p>
                                <p class="text-sm font-bold">${moneyLentTotals.count}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // Build tabbed content for Lent Out
            if (lentOutRecords.length > 0) {
                lentOutContent = `
                    ${lentOutSummary}
                    <div class="bg-white rounded-xl border-2 border-teal-200 overflow-hidden">
                        <!-- Active/Closed Tabs for Lent Out -->
                        <div class="flex border-b border-gray-200">
                            <button id="lentout-tab-active" 
                                    onclick="Loans.switchLentOutTab('active')"
                                    class="flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-teal-500 text-teal-600 flex items-center justify-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                Active (${activeRecords.length})
                            </button>
                            <button id="lentout-tab-closed" 
                                    onclick="Loans.switchLentOutTab('closed')"
                                    class="flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                Closed (${closedRecords.length})
                            </button>
                        </div>
                        
                        <!-- Tab Content: Active Lent Out -->
                        <div id="lentout-content-active" class="p-3">
                            ${window.MoneyLent.renderList('active')}
                        </div>
                        
                        <!-- Tab Content: Closed Lent Out -->
                        ${closedRecords.length > 0 ? `
                            <div id="lentout-content-closed" class="p-3 hidden">
                                ${window.MoneyLent.renderList('closed')}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                lentOutContent = `
                    ${lentOutSummary}
                    <div class="text-center py-12">
                        <div class="text-6xl mb-4">🤝</div>
                        <p class="text-gray-500 text-sm">No lent out records yet</p>
                        <p class="text-gray-400 text-xs mt-2">Use the + button below to add your first record</p>
                    </div>
                `;
            }
        } else {
            lentOutContent = '<p class="text-gray-500 text-center py-8">Money Lent module not loaded</p>';
        }
        
        // Build main HTML - content only (tabs are fixed at bottom)
        const html = `
            <!-- Borrowed Content -->
            <div id="main-content-borrowed" class="space-y-0">
                ${borrowedContent}
            </div>
            
            <!-- Lent Out Content -->
            <div id="main-content-lentout" class="hidden space-y-0">
                ${lentOutContent}
            </div>
        `;
        
        list.innerHTML = html;
        
        // Restore the main tab state
        if (this.mainTab === 'lentout') {
            setTimeout(() => {
                this.switchMainTab('lentout');
            }, 0);
        }
        
        // Restore the current sub-tab state after re-rendering (for borrowed tab)
        if (this.mainTab === 'borrowed' && this.currentTab === 'closed') {
            setTimeout(() => {
                this.switchLoansTab('closed');
            }, 0);
        }
        
        // Restore the lent out sub-tab state after re-rendering
        if (this.mainTab === 'lentout' && this.lentOutTab === 'closed') {
            setTimeout(() => {
                this.switchLentOutTab('closed');
            }, 0);
        }
    },
    
    /**
     * Render individual loan card
     */
    renderLoanCard(loan, isClosed) {
        const emi = this.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
        const totalAmount = this.calculateTotalAmount(emi, loan.tenure);
        const totalInterest = this.calculateTotalInterest(totalAmount, loan.amount);
        const closureDate = this.calculateClosureDate(loan.firstEmiDate, loan.tenure);
        const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
        
        // Get EMI day of month from first EMI date
        const firstEmiDate = new Date(loan.firstEmiDate);
        const emiDay = firstEmiDate.getDate();
        const emiDayOrdinal = this.getOrdinalSuffix(emiDay);
        
        const progress = ((loan.tenure - remaining.emisRemaining) / loan.tenure) * 100;
        const isCompleted = remaining.emisRemaining === 0;
        const isExpanded = this.expandedLoans.has(loan.id);
        
        return `
            <div class="bg-gradient-to-br from-blue-50 via-white to-cyan-50 rounded-xl border-2 ${isCompleted ? 'border-green-400' : 'border-blue-300'} hover:shadow-lg transition-all">
                <!-- Collapsed Header - Always Visible -->
                <div class="p-4 cursor-pointer" onclick="Loans.toggleExpansion(${loan.id})">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <div class="flex items-center gap-2">
                                    <h4 class="font-bold text-blue-900 text-sm">${Utils.escapeHtml(loan.bankName)}</h4>
                                    ${isCompleted ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-semibold">✓</span>' : ''}
                                </div>
                                <span class="font-bold text-blue-900 text-base">₹${Utils.formatIndianNumber(loan.amount)}</span>
                            </div>
                            <p class="text-xs text-gray-700 mb-2">
                                <strong>${Utils.escapeHtml(loan.loanType || 'Loan')}</strong>${loan.reason ? ': ' + Utils.escapeHtml(loan.reason) : ''}
                            </p>
                            
                            <!-- Key Info in Collapsed View -->
                            <div class="flex justify-between items-center text-xs mb-2">
                                <span class="text-gray-600">To Pay: <strong class="${isCompleted ? 'text-green-700' : 'text-red-700'}">₹${Utils.formatIndianNumber(remaining.totalRemainingPayment)}</strong></span>
                                <span class="text-gray-600">EMI: <strong class="text-green-700">₹${Utils.formatIndianNumber(emi)}</strong></span>
                            </div>
                            
                            <!-- Progress Bar in Collapsed View -->
                            <div class="mb-1">
                                <div class="flex justify-between text-xs text-gray-600 mb-1">
                                    <span><span class="font-semibold">${remaining.emisPaid}/${loan.tenure}</span> EMIs paid</span>
                                    <span class="font-semibold">${Math.round(progress)}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-1.5">
                                    <div class="bg-gradient-to-r from-blue-500 to-cyan-500 h-1.5 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                                </div>
                            </div>
                            
                            <!-- EMI Date Info at Bottom -->
                            <div class="text-xs text-gray-600">
                                📅 EMI on <strong>${emiDayOrdinal}</strong> of every month
                            </div>
                        </div>
                        
                        <!-- Expand/Collapse Icon -->
                        <div class="ml-3">
                            <svg class="w-4 h-4 text-blue-600 transition-transform details-arrow ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </div>
                    </div>
                </div>
                
                <!-- Expanded Content -->
                <div class="${isExpanded ? '' : 'hidden'} px-4 pb-4 border-t border-blue-200 pt-4">
                    <!-- Action Buttons -->
                    <div class="flex gap-2 mb-4">
                        ${!isCompleted ? `
                            <button onclick="event.stopPropagation(); openLoanModal(${loan.id})" class="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all font-semibold text-sm flex items-center justify-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                                Edit
                            </button>
                        ` : ''}
                        <button onclick="event.stopPropagation(); Loans.delete(${loan.id})" class="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all font-semibold text-sm flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                    
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
                    
                    <!-- Financial Summary -->
                    <div class="space-y-2 bg-white bg-opacity-70 p-3 rounded-lg">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Original Total:</span>
                            <span class="font-bold text-blue-900">₹${Utils.formatIndianNumber(totalAmount)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Total Interest:</span>
                            <span class="font-bold text-orange-700">₹${Utils.formatIndianNumber(totalInterest)}</span>
                        </div>
                        <div class="flex justify-between text-sm pt-2 border-t border-gray-200">
                            <span class="text-gray-700">Remaining to Pay:</span>
                            <span class="font-bold ${isCompleted ? 'text-green-700' : 'text-red-700'}">₹${Utils.formatIndianNumber(remaining.totalRemainingPayment)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-600">Principal Balance:</span>
                            <span class="font-semibold text-gray-800">₹${Utils.formatIndianNumber(remaining.remainingBalance)}</span>
                        </div>
                        <div class="flex justify-between text-sm pt-2 border-t border-gray-200">
                            <span class="text-gray-700">Closure Date:</span>
                            <span class="font-semibold text-blue-800">${closureDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Render loan card for view modal (always expanded, no edit/delete buttons)
     */
    renderLoanCardForModal(loan, isClosed) {
        const emi = this.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
        const totalAmount = this.calculateTotalAmount(emi, loan.tenure);
        const totalInterest = this.calculateTotalInterest(totalAmount, loan.amount);
        const closureDate = this.calculateClosureDate(loan.firstEmiDate, loan.tenure);
        const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
        
        // Get EMI day of month from first EMI date
        const firstEmiDate = new Date(loan.firstEmiDate);
        const emiDay = firstEmiDate.getDate();
        const emiDayOrdinal = this.getOrdinalSuffix(emiDay);
        
        const progress = ((loan.tenure - remaining.emisRemaining) / loan.tenure) * 100;
        const isCompleted = remaining.emisRemaining === 0;
        
        return `
            <div class="bg-gradient-to-br from-blue-50 via-white to-cyan-50 rounded-xl border-2 ${isCompleted ? 'border-green-400' : 'border-blue-300'} shadow-lg">
                <div class="p-4">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <div class="flex items-center gap-2">
                                    <h4 class="font-bold text-blue-900 text-lg">${Utils.escapeHtml(loan.bankName)}</h4>
                                    ${isCompleted ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-semibold">✓ Completed</span>' : ''}
                                </div>
                                <span class="font-bold text-blue-900 text-lg">₹${Utils.formatIndianNumber(loan.amount)}</span>
                            </div>
                            <p class="text-sm text-gray-700 mb-2">
                                <strong>${Utils.escapeHtml(loan.loanType || 'Loan')}</strong>${loan.reason ? ': ' + Utils.escapeHtml(loan.reason) : ''}
                            </p>
                            
                            <!-- Key Info -->
                            <div class="flex justify-between items-center text-xs mb-2">
                                <span class="text-gray-600">To Pay: <strong class="${isCompleted ? 'text-green-700' : 'text-red-700'}">₹${Utils.formatIndianNumber(remaining.totalRemainingPayment)}</strong></span>
                                <span class="text-gray-600">EMI: <strong class="text-green-700">₹${Utils.formatIndianNumber(emi)}</strong></span>
                            </div>
                            
                            <!-- Progress Bar -->
                            <div class="mb-2">
                                <div class="flex justify-between text-xs text-gray-600 mb-1">
                                    <span><span class="font-semibold">${remaining.emisPaid}/${loan.tenure}</span> EMIs paid</span>
                                    <span class="font-semibold">${Math.round(progress)}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                                </div>
                            </div>
                            
                            <!-- EMI Date Info -->
                            <div class="text-xs text-gray-600">
                                📅 EMI on <strong>${emiDayOrdinal}</strong> of every month
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Detailed Info -->
                <div class="px-4 pb-4 border-t border-blue-200 pt-4">
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
                        <div class="bg-white bg-opacity-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-600">First EMI Date</p>
                            <p class="font-bold text-blue-900">${new Date(loan.firstEmiDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                        </div>
                        <div class="bg-white bg-opacity-50 p-2 rounded-lg">
                            <p class="text-xs text-gray-600">EMIs Remaining</p>
                            <p class="font-bold text-blue-900">${remaining.emisRemaining} EMIs</p>
                        </div>
                    </div>
                    
                    <!-- Summary Section -->
                    <div class="bg-gradient-to-r from-blue-50 to-cyan-50 p-3 rounded-lg space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Original Total:</span>
                            <span class="font-bold text-blue-900">₹${Utils.formatIndianNumber(totalAmount)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-700">Total Interest:</span>
                            <span class="font-bold text-orange-700">₹${Utils.formatIndianNumber(totalInterest)}</span>
                        </div>
                        <div class="flex justify-between text-sm pt-2 border-t border-gray-200">
                            <span class="text-gray-700">Remaining to Pay:</span>
                            <span class="font-bold ${isCompleted ? 'text-green-700' : 'text-red-700'}">₹${Utils.formatIndianNumber(remaining.totalRemainingPayment)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-600">Principal Balance:</span>
                            <span class="font-semibold text-gray-800">₹${Utils.formatIndianNumber(remaining.remainingBalance)}</span>
                        </div>
                        <div class="flex justify-between text-sm pt-2 border-t border-gray-200">
                            <span class="text-gray-700">Closure Date:</span>
                            <span class="font-semibold text-blue-800">${closureDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    
    /**
     * Auto-add loan EMI expenses that are due
     */
    autoAddToExpenses() {
        const today = new Date();
        let addedCount = 0;
        
        if (!window.DB.loans || !window.Expenses) return 0;
        
        window.DB.loans.forEach(loan => {
            // Check if loan has started
            const firstDate = new Date(loan.firstEmiDate);
            if (firstDate > today) return; // Loan hasn't started yet
            
            // Check if loan is still active
            const remaining = this.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
            if (remaining.emisRemaining === 0) return; // Skip closed loans
            
            const emi = this.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
            const emiDay = firstDate.getDate();
            
            // Check if EMI is due this month and date has passed
            if (today.getDate() >= emiDay) {
                const thisMonthEmiDate = new Date(today.getFullYear(), today.getMonth(), emiDay);
                const emiDateStr = Utils.formatLocalDate(thisMonthEmiDate);
                
                const loanEmiTitle = `${loan.bankName} ${loan.loanType || 'Loan'} EMI`;
                
                // Check if dismissed by user
                const isDismissed = window.Expenses && window.Expenses.isDismissed(loanEmiTitle, emiDateStr, emi);
                
                if (isDismissed) {
                    console.log('Loan EMI dismissed by user, skipping:', loanEmiTitle);
                    return;
                }
                
                // Check if already added to expenses
                const exists = window.DB.expenses.find(exp => 
                    exp.title === loanEmiTitle &&
                    exp.date === emiDateStr &&
                    Math.abs(exp.amount - emi) < 0.01
                );
                
                if (!exists) {
                    // Add to expenses
                    window.Expenses.add(
                        loanEmiTitle,
                        emi,
                        'emi',
                        emiDateStr,
                        loan.reason || 'Monthly payment',
                        null
                    );
                    addedCount++;
                }
            }
        });
        
        return addedCount;
    },
    
    /**
     * Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
     */
    getOrdinalSuffix(day) {
        if (day > 3 && day < 21) return day + 'th';
        switch (day % 10) {
            case 1: return day + 'st';
            case 2: return day + 'nd';
            case 3: return day + 'rd';
            default: return day + 'th';
        }
    }
};

// Export to global
window.Loans = Loans;

