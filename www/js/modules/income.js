/**
 * Income Module
 * Handles salary, payslip, bonus, and tax calculations
 */

const Income = {
    
    /**
     * Get default tax slabs (New Tax Regime 2024)
     */
    getDefaultTaxSlabs() {
        return [
            { min: 0, max: 400000, rate: 0, label: 'Up to ₹4L' },
            { min: 400000, max: 800000, rate: 5, label: '₹4L - ₹8L' },
            { min: 800000, max: 1200000, rate: 10, label: '₹8L - ₹12L' },
            { min: 1200000, max: 1600000, rate: 15, label: '₹12L - ₹16L' },
            { min: 1600000, max: 2000000, rate: 20, label: '₹16L - ₹20L' },
            { min: 2000000, max: 2400000, rate: 25, label: '₹20L - ₹24L' },
            { min: 2400000, max: Infinity, rate: 30, label: 'Above ₹24L' }
        ];
    },
    
    /**
     * Get default surcharge slabs (New Tax Regime)
     */
    getDefaultSurchargeSlabs() {
        return [
            { min: 0, max: 5000000, rate: 0, label: 'Up to ₹50 Lakhs' },
            { min: 5000000, max: 10000000, rate: 10, label: '₹50L - ₹1 Cr' },
            { min: 10000000, max: 20000000, rate: 15, label: '₹1 Cr - ₹2 Cr' },
            { min: 20000000, max: 50000000, rate: 25, label: '₹2 Cr - ₹5 Cr' },
            { min: 50000000, max: Infinity, rate: 25, label: 'Above ₹5 Cr' }
        ];
    },
    
    /**
     * Get saved income data
     */
    getData() {
        if (!window.DB.income) {
            window.DB.income = {
                ctc: 0,
                bonusPercent: 0,
                esppPercentCycle1: 0, // Dec to May
                esppPercentCycle2: 0, // Jun to Nov
                pfPercent: 12, // Default PF is 12%
                taxSlabs: this.getDefaultTaxSlabs(),
                stdDeduction: 75000,
                cessPercent: 4,
                surchargeSlabs: this.getDefaultSurchargeSlabs(),
                // Additional deductions
                hraExemption: 0,
                section80C: 0,
                section80D: 0,
                otherDeductions: 0
            };
        }
        // Migrate old esppPercent to new dual cycle format
        if (window.DB.income.esppPercent !== undefined && window.DB.income.esppPercentCycle1 === undefined) {
            window.DB.income.esppPercentCycle1 = window.DB.income.esppPercent;
            window.DB.income.esppPercentCycle2 = window.DB.income.esppPercent;
            delete window.DB.income.esppPercent;
        }
        // Ensure tax slabs exist
        if (!window.DB.income.taxSlabs || window.DB.income.taxSlabs.length === 0) {
            window.DB.income.taxSlabs = this.getDefaultTaxSlabs();
        }
        // Ensure std deduction and cess exist
        if (!window.DB.income.stdDeduction) {
            window.DB.income.stdDeduction = 75000;
        }
        if (!window.DB.income.cessPercent) {
            window.DB.income.cessPercent = 4;
        }
        // Ensure surcharge slabs exist
        if (!window.DB.income.surchargeSlabs || window.DB.income.surchargeSlabs.length === 0) {
            window.DB.income.surchargeSlabs = this.getDefaultSurchargeSlabs();
        }
        // Ensure additional deductions exist
        if (window.DB.income.hraExemption === undefined) window.DB.income.hraExemption = 0;
        if (window.DB.income.section80C === undefined) window.DB.income.section80C = 0;
        if (window.DB.income.section80D === undefined) window.DB.income.section80D = 0;
        if (window.DB.income.otherDeductions === undefined) window.DB.income.otherDeductions = 0;
        // Ensure health insurance fields exist
        if (window.DB.income.hasInsurance === undefined) window.DB.income.hasInsurance = false;
        if (window.DB.income.insuranceTotal === undefined) window.DB.income.insuranceTotal = 0;
        if (window.DB.income.insuranceMonths === undefined) window.DB.income.insuranceMonths = [];
        // Ensure leave encashment fields exist
        if (window.DB.income.leaveDays === undefined) window.DB.income.leaveDays = 0;
        
        return window.DB.income;
    },
    
    /**
     * Add a salary record
     */
    addSalary(month, year, amount) {
        if (!month || !year || !amount) {
            throw new Error('Month, year, and amount are required');
        }
        
        // Check if salary for this month/year already exists
        const exists = window.DB.salaries.find(s => s.month === parseInt(month) && s.year === parseInt(year));
        if (exists) {
            throw new Error(`Salary for ${this.getMonthName(month)} ${year} already exists. Please edit the existing record.`);
        }
        
        const salary = {
            id: Utils.generateId(),
            month: parseInt(month),
            year: parseInt(year),
            amount: parseFloat(amount),
            createdAt: Utils.getCurrentTimestamp()
        };
        
        window.DB.salaries.push(salary);
        window.Storage.save();
        
        return salary;
    },
    
    /**
     * Update a salary record
     */
    updateSalary(id, month, year, amount) {
        if (!month || !year || !amount) {
            throw new Error('Month, year, and amount are required');
        }
        
        const salary = window.DB.salaries.find(s => s.id === id);
        if (!salary) {
            throw new Error('Salary record not found');
        }
        
        // Check if another salary for this month/year exists
        const duplicate = window.DB.salaries.find(s => s.id !== id && s.month === parseInt(month) && s.year === parseInt(year));
        if (duplicate) {
            throw new Error(`Salary for ${this.getMonthName(month)} ${year} already exists.`);
        }
        
        salary.month = parseInt(month);
        salary.year = parseInt(year);
        salary.amount = parseFloat(amount);
        
        window.Storage.save();
        return salary;
    },
    
    /**
     * Delete a salary record
     */
    deleteSalary(id) {
        window.DB.salaries = window.DB.salaries.filter(s => s.id !== id);
        window.Storage.save();
    },
    
    /**
     * Get salary by id
     */
    getSalaryById(id) {
        return window.DB.salaries.find(s => s.id === id);
    },
    
    /**
     * Get all salaries
     */
    getAllSalaries() {
        return window.DB.salaries || [];
    },
    
    /**
     * Get month name
     */
    getMonthName(monthNum) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return monthNames[parseInt(monthNum) - 1] || '';
    },
    
    /**
     * Save income data
     */
    save(data) {
        const existingData = this.getData();
        window.DB.income = {
            ...existingData,
            ctc: parseFloat(data.ctc) || 0,
            bonusPercent: parseFloat(data.bonusPercent) || 0,
            esppPercentCycle1: parseFloat(data.esppPercentCycle1) || 0,
            esppPercentCycle2: parseFloat(data.esppPercentCycle2) || 0,
            pfPercent: parseFloat(data.pfPercent) || 12,
            hasInsurance: data.hasInsurance || false,
            insuranceTotal: parseFloat(data.insuranceTotal) || 0,
            insuranceMonths: data.insuranceMonths || [],
            leaveDays: parseFloat(data.leaveDays) || 0
        };
        window.Storage.save();
        this.render();
        
        // Update button visibility
        if (window.switchIncomeExpenseTab) {
            window.switchIncomeExpenseTab('income');
        }
    },
    
    /**
     * Get ESPP percent for a specific month
     * Cycle 1 (Dec-May): Dec, Jan, Feb, Mar, Apr, May (calendar months 12, 1, 2, 3, 4, 5)
     * Cycle 2 (Jun-Nov): Jun, Jul, Aug, Sep, Oct, Nov (calendar months 6, 7, 8, 9, 10, 11)
     */
    getESPPPercentForMonth(month, esppPercentCycle1, esppPercentCycle2) {
        // month is financial year month name or calendar month number
        const monthMap = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
        };
        
        const calendarMonth = typeof month === 'string' ? monthMap[month] : month;
        
        // Cycle 1: Dec-May (12, 1-5)
        if (calendarMonth === 12 || (calendarMonth >= 1 && calendarMonth <= 5)) {
            return esppPercentCycle1;
        }
        // Cycle 2: Jun-Nov (6-11)
        return esppPercentCycle2;
    },
    
    /**
     * Calculate Total Basic (40% of CTC)
     */
    calculateBasic(ctc) {
        return ctc * 0.40;
    },
    
    /**
     * Common helper functions for salary calculations
     * These avoid duplication across methods
     */
    
    /**
     * Get monthly basic salary
     */
    getMonthlyBasic(ctc) {
        return this.calculateBasic(ctc) / 12;
    },
    
    /**
     * Get monthly HRA (50% of monthly basic)
     */
    getMonthlyHRA(ctc) {
        return this.getMonthlyBasic(ctc) / 2;
    },
    
    /**
     * Get monthly employer PF contribution
     */
    getMonthlyEmployerPF(ctc, pfPercent = 12) {
        const basic = this.calculateBasic(ctc);
        return (basic * pfPercent) / 100 / 12;
    },
    
    /**
     * Get monthly employee PF contribution
     */
    getMonthlyEmployeePF(ctc, pfPercent = 12) {
        const basic = this.calculateBasic(ctc);
        return (basic * pfPercent) / 100 / 12;
    },
    
    /**
     * Get monthly gross earnings (CTC per month - Employer PF)
     * This is the actual gross salary shown in payslips
     */
    getMonthlyGrossEarnings(ctc, pfPercent = 12) {
        const ctcPerMonth = ctc / 12;
        const pfEmployer = this.getMonthlyEmployerPF(ctc, pfPercent);
        return ctcPerMonth - pfEmployer;
    },
    
    /**
     * Calculate Income Tax based on configured slabs
     */
    calculateIncomeTax(ctc) {
        const data = this.getData();
        const stdDeduction = data.stdDeduction;
        
        // Calculate employer PF contribution (not taxable up to 7.5L per year)
        const basic = this.calculateBasic(ctc);
        const pfPercent = data.pfPercent || 12;
        const employerPFAnnual = (basic * pfPercent) / 100;
        
        // Only amount above 7.5L is taxable (as per Indian tax law)
        const taxableEmployerPF = Math.max(0, employerPFAnnual - 750000);
        const exemptEmployerPF = Math.min(employerPFAnnual, 750000);
        
        // Calculate all deductions
        const hraExemption = data.hraExemption || 0;
        const section80C = data.section80C || 0;
        const section80D = data.section80D || 0;
        const otherDeductions = data.otherDeductions || 0;
        
        // All deductions reduce taxable income
        const totalDeductions = stdDeduction + hraExemption + section80C + section80D + otherDeductions;
        
        // Exclude exempt employer PF from taxable income, include only taxable portion
        const taxableIncome = Math.max(0, ctc - exemptEmployerPF - totalDeductions);
        
        // Get tax slabs (sorted by min amount)
        const taxSlabs = [...data.taxSlabs].sort((a, b) => a.min - b.min);
        
        // Calculate tax slab-wise
        const slabs = [];
        let tax = 0;
        
        taxSlabs.forEach((slab, index) => {
            if (taxableIncome > slab.min) {
                // Calculate taxable amount in this slab
                // Handle both Infinity and null as unlimited max
                const slabMax = (slab.max === Infinity || slab.max === null) ? taxableIncome : Math.min(taxableIncome, slab.max);
                const taxableInSlab = Math.max(0, slabMax - slab.min);
                const taxInSlab = taxableInSlab * (slab.rate / 100);
                tax += taxInSlab;
                
                slabs.push({ 
                    range: slab.label, 
                    tax: taxInSlab,
                    rate: slab.rate
                });
            } else {
                // Income doesn't reach this slab
                slabs.push({ 
                    range: slab.label, 
                    tax: 0,
                    rate: slab.rate
                });
            }
        });
        
        // Add surcharge based on configurable slabs
        let surcharge = 0;
        let surchargeRate = 0;
        const surchargeSlabs = data.surchargeSlabs || this.getDefaultSurchargeSlabs();
        
        // Sort surcharge slabs to ensure proper matching
        const sortedSurchargeSlabs = [...surchargeSlabs].sort((a, b) => a.min - b.min);
        
        for (const slab of sortedSurchargeSlabs) {
            // Handle both Infinity and null as unlimited max
            const isUnlimitedMax = (slab.max === Infinity || slab.max === null);
            if (ctc >= slab.min && (isUnlimitedMax || ctc < slab.max)) {
                surchargeRate = slab.rate;
                surcharge = tax * (slab.rate / 100);
                break;
            }
        }
        
        // Add cess (configurable % of tax + surcharge)
        const cess = (tax + surcharge) * (data.cessPercent / 100);
        
        const totalTax = tax + surcharge + cess;
        const taxPercent = ctc > 0 ? (totalTax / ctc) * 100 : 0;
        
        return {
            baseTax: tax,
            surcharge: surcharge,
            surchargeRate: surchargeRate,
            cess: cess,
            totalTax: totalTax,
            taxPercent: taxPercent,
            stdDeduction: stdDeduction,
            hraExemption: hraExemption,
            section80C: section80C,
            section80D: section80D,
            otherDeductions: otherDeductions,
            totalDeductions: totalDeductions,
            employerPFAnnual: employerPFAnnual,
            exemptEmployerPF: exemptEmployerPF,
            taxableEmployerPF: taxableEmployerPF,
            taxableIncome: taxableIncome,
            cessPercent: data.cessPercent,
            slabs: slabs
        };
    },
    
    /**
     * Calculate monthly payslip
     * For base calculation, we use average ESPP from both cycles
     */
    calculatePayslip(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent) {
        // Use common helper functions to avoid duplication
        const basicPay = this.getMonthlyBasic(ctc);
        const hra = this.getMonthlyHRA(ctc);
        const pfEmployer = this.getMonthlyEmployerPF(ctc, pfPercent);
        const pfEmployee = this.getMonthlyEmployeePF(ctc, pfPercent);
        const grossEarnings = this.getMonthlyGrossEarnings(ctc, pfPercent);
        const allowances = grossEarnings - basicPay - hra;
        
        // Use average ESPP for base calculation
        const avgEspp = (esppPercentCycle1 + esppPercentCycle2) / 2;
        const espp = (grossEarnings * avgEspp) / 100;
        
        const taxInfo = this.calculateIncomeTax(ctc);
        const incomeTax = taxInfo.totalTax / 12;
        const professionalTax = 200;
        
        const grossDeductions = incomeTax + professionalTax + espp + pfEmployee;
        const netPay = grossEarnings - grossDeductions;
        
        return {
            basicPay,
            hra,
            allowances,
            grossEarnings,
            pfEmployer,
            pfEmployee,
            espp,
            incomeTax,
            professionalTax,
            grossDeductions,
            netPay
        };
    },
    
    /**
     * Calculate bonus details
     * September (mid-year) uses Cycle 2, April (year-end) uses Cycle 1
     */
    calculateBonus(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent, midYearMultiplier = 1.0, yearEndMultiplier = 1.0) {
        const totalBonusBeforeTax = (ctc * bonusPercent) / 100;
        // Apply multipliers to the base split (25% mid-year, 75% year-end)
        const midYearBeforeTax = (totalBonusBeforeTax * 0.25) * midYearMultiplier;
        const yearEndBeforeTax = (totalBonusBeforeTax * 0.75) * yearEndMultiplier;
        
        const basic = this.calculateBasic(ctc);
        const taxInfo = this.calculateIncomeTax(ctc);
        const effectiveTaxRate = taxInfo.taxPercent / 100;
        
        // After tax calculations
        const midYearAfterTax = midYearBeforeTax * (1 - effectiveTaxRate);
        const yearEndAfterTax = yearEndBeforeTax * (1 - effectiveTaxRate);
        
        // Only ESPP is deducted from bonus, no PF on bonus
        // September uses Cycle 2, April uses Cycle 1
        const midYearEsppCut = (midYearBeforeTax * esppPercentCycle2) / 100;
        const midYearNet = midYearAfterTax - midYearEsppCut;
        
        const yearEndEsppCut = (yearEndBeforeTax * esppPercentCycle1) / 100;
        const yearEndNet = yearEndAfterTax - yearEndEsppCut;
        
        return {
            totalBonusBeforeTax,
            totalBonusAfterTax: midYearNet + yearEndNet,
            midYear: {
                beforeTax: midYearBeforeTax,
                afterTax: midYearAfterTax,
                esppCut: midYearEsppCut,
                net: midYearNet
            },
            yearEnd: {
                beforeTax: yearEndBeforeTax,
                afterTax: yearEndAfterTax,
                esppCut: yearEndEsppCut,
                net: yearEndNet
            }
        };
    },
    
    /**
     * Calculate leave encashment amount (gross amount before deductions)
     * Formula: ((Gross earnings × 12) / 365) × encashment days
     * Gross earnings = CTC per month - Employer PF
     * This is added to gross income, then tax and ESPP are applied normally
     */
    calculateLeaveEncashment(ctc, days) {
        const data = this.getData();
        const pfPercent = data.pfPercent || 12;
        
        // Use common helper function for monthly gross
        const monthlyGross = this.getMonthlyGrossEarnings(ctc, pfPercent);
        
        // Daily rate = (Monthly Gross × 12) / 365
        const dailyRate = (monthlyGross * 12) / 365;
        
        // Leave encashment = Daily rate × encashment days
        const grossLeaveAmount = dailyRate * days;
        
        return Math.round(grossLeaveAmount);
    },
    
    /**
     * Generate monthly payslips for financial year (April to March)
     */
    generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent) {
        const months = [
            'April', 'May', 'June', 'July', 'August', 'September',
            'October', 'November', 'December', 'January', 'February', 'March'
        ];
        
        const data = this.getData();
        const basePayslip = this.calculatePayslip(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        const bonus = this.calculateBonus(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent, data.bonusMidYearMultiplier || 1.0, data.bonusYearEndMultiplier || 1.0);
        
        // Calculate leave encashment for January
        const leaveDays = data.leaveDays || 0;
        const leaveEncashment = leaveDays > 0 ? this.calculateLeaveEncashment(ctc, leaveDays) : 0;
        
        // Calculate insurance premium per month
        const insuranceTotal = data.insuranceTotal || 0;
        const insuranceMonths = data.insuranceMonths || [];
        const insurancePerMonth = insuranceMonths.length > 0 ? insuranceTotal / insuranceMonths.length : 0;
        
        const payslips = months.map((month, index) => {
            // Calendar month mapping (1=Jan, 4=Apr, etc.)
            const calendarMonth = index < 9 ? index + 4 : index - 8;
            
            // Get the correct ESPP percent for this month
            const monthEsppPercent = this.getESPPPercentForMonth(month, esppPercentCycle1, esppPercentCycle2);
            
            // Recalculate payslip for this specific month with its ESPP rate
            const basic = this.calculateBasic(ctc);
            const basicPay = basic / 12;
            const hra = basicPay / 2;
            const ctcPerMonth = ctc / 12;
            const pfEmployer = (basic * pfPercent) / 100 / 12;
            const pfEmployee = (basic * pfPercent) / 100 / 12;
            const grossEarnings = ctcPerMonth - pfEmployer;
            const allowances = grossEarnings - basicPay - hra;
            const espp = (grossEarnings * monthEsppPercent) / 100;
            
            const taxInfo = this.calculateIncomeTax(ctc);
            const incomeTax = taxInfo.totalTax / 12;
            const professionalTax = 200;
            
            const grossDeductions = incomeTax + professionalTax + espp + pfEmployee;
            const netPay = grossEarnings - grossDeductions;
            
            let payslip = {
                basicPay,
                hra,
                allowances,
                grossEarnings,
                pfEmployer,
                pfEmployee,
                espp,
                incomeTax,
                professionalTax,
                grossDeductions,
                netPay
            };
            
            let bonusAmount = 0;
            let bonusEspp = 0;
            let grossLeaveAmount = 0;
            let insuranceDeduction = 0;
            
            // Add bonus in September (mid-year)
            if (month === 'September') {
                bonusAmount = bonus.midYear.net;
                bonusEspp = bonus.midYear.esppCut;
            }
            // Add bonus in April (year-end)
            else if (month === 'April') {
                bonusAmount = bonus.yearEnd.net;
                bonusEspp = bonus.yearEnd.esppCut;
            }
            
            // Add leave encashment in January (gross amount)
            if (month === 'January' && leaveEncashment > 0) {
                grossLeaveAmount = leaveEncashment;
            }
            
            // Add insurance deduction in selected months
            if (data.hasInsurance && insuranceMonths.includes(calendarMonth)) {
                insuranceDeduction = insurancePerMonth;
            }
            
            // Calculate tax and ESPP on leave encashment (January uses Cycle 1)
            let leaveEspp = 0;
            let leaveTax = 0;
            if (grossLeaveAmount > 0) {
                leaveEspp = (grossLeaveAmount * esppPercentCycle1) / 100;
                // Tax is applied at same monthly rate
                const monthlyTaxRate = (taxInfo.totalTax / ctc) || 0;
                leaveTax = grossLeaveAmount * monthlyTaxRate;
            }
            
            const netLeaveAmount = grossLeaveAmount - leaveEspp - leaveTax;
            
            return {
                month,
                ...payslip,
                grossEarnings: payslip.grossEarnings + grossLeaveAmount,
                espp: payslip.espp + bonusEspp + leaveEspp,
                incomeTax: payslip.incomeTax + leaveTax,
                grossDeductions: payslip.grossDeductions + leaveEspp + leaveTax,
                bonus: bonusAmount,
                leaveEncashment: grossLeaveAmount,
                insuranceDeduction: insuranceDeduction,
                totalNetPay: payslip.netPay + bonusAmount + netLeaveAmount - insuranceDeduction
            };
        });
        
        return payslips;
    },
    
    /**
     * Render income view
     */
    render() {
        const container = document.getElementById('income-content');
        if (!container) return;
        
        const data = this.getData();
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = data;
        
        // If no data, show form
        if (!ctc || ctc === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-gray-600 mb-4">Enter your salary details to calculate payslips, bonuses, and taxes</p>
                    <button onclick="Income.openForm()" class="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg transition-all">
                        Add Income Details
                    </button>
                </div>
            `;
            return;
        }
        
        // Calculate all values
        const basic = this.calculateBasic(ctc);
        const taxInfo = this.calculateIncomeTax(ctc);
        const payslip = this.calculatePayslip(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        const bonus = this.calculateBonus(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent, data.bonusMidYearMultiplier || 1.0, data.bonusYearEndMultiplier || 1.0);
        const yearlyPayslips = this.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        // Aggregate totals from all 12 months
        const aggregated = yearlyPayslips.reduce((acc, slip) => ({
            totalTax: acc.totalTax + slip.incomeTax,
            totalNetPay: acc.totalNetPay + slip.totalNetPay,
            totalESPP: acc.totalESPP + slip.espp,
            totalPFEmployee: acc.totalPFEmployee + slip.pfEmployee,
            totalPFEmployer: acc.totalPFEmployer + slip.pfEmployer
        }), { totalTax: 0, totalNetPay: 0, totalESPP: 0, totalPFEmployee: 0, totalPFEmployer: 0 });
        
        const totalEPF = aggregated.totalPFEmployee + aggregated.totalPFEmployer;
        
        // Build HTML for all tabs
        const salariesHTML = this.renderSalaryTab();
        const payslipsHTML = this.renderPayslipsTab(yearlyPayslips, bonus);
        const incomeTaxHTML = this.renderIncomeTaxTab(taxInfo, data);
        
        // Calculate actual salary total for the year
        const currentYear = new Date().getFullYear();
        const actualSalaryTotal = this.getYearSalaryTotal(currentYear);
        const salaryCount = window.DB.salaries.filter(s => s.year === currentYear).length;
        
        container.innerHTML = `
            <div class="space-y-4">
                <!-- Summary Card -->
                <div class="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl p-5 shadow-lg">
                    <!-- First Line: CTC and Income Credit -->
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <p class="text-xs opacity-90">Annual CTC</p>
                            <p class="text-2xl font-bold">₹${Utils.formatIndianNumber(ctc)}</p>
                        </div>
                        <div>
                            <p class="text-xs opacity-90">Income Credit (${currentYear})</p>
                            <p class="text-2xl font-bold">₹${Utils.formatIndianNumber(actualSalaryTotal > 0 ? actualSalaryTotal : Math.round(aggregated.totalNetPay))}</p>
                            <p class="text-[10px] opacity-75">${actualSalaryTotal > 0 ? `Actual (${salaryCount} months)` : 'Estimated'}</p>
                        </div>
                    </div>
                    <!-- Second Line: Tax, ESPP, EPF -->
                    <div class="grid grid-cols-3 gap-3 text-xs">
                        <div>
                            <p class="opacity-75">Total Tax</p>
                            <p class="font-semibold">₹${Utils.formatIndianNumber(aggregated.totalTax)}</p>
                        </div>
                        <div>
                            <p class="opacity-75">ESPP</p>
                            <p class="font-semibold">₹${Utils.formatIndianNumber(aggregated.totalESPP)}</p>
                        </div>
                        <div>
                            <p class="opacity-75">EPF</p>
                            <p class="font-semibold">₹${Utils.formatIndianNumber(totalEPF)}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Tabs for Salary, Pay Slips, and Income Tax -->
                <div class="bg-white rounded-xl border border-blue-200 overflow-hidden">
                    <!-- Tabs -->
                    <div class="border-b border-blue-200">
                        <div class="flex justify-evenly">
                            <button onclick="Income.switchIncomeTab('salary')" 
                                    id="income-tab-salary"
                                    class="flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-green-500 text-green-600">
                                <div>💵 Salary</div>
                                <div class="text-[10px] font-normal mt-0.5">${window.DB.salaries.length} record${window.DB.salaries.length !== 1 ? 's' : ''}</div>
                            </button>
                            <button onclick="Income.switchIncomeTab('payslips')" 
                                    id="income-tab-payslips"
                                    class="flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                <div>📄 Payslips</div>
                                <div class="text-[10px] font-normal mt-0.5">12 months</div>
                            </button>
                            <button onclick="Income.switchIncomeTab('tax')" 
                                    id="income-tab-tax"
                                    class="flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                <div>💰 Tax</div>
                                <div class="text-[10px] font-normal mt-0.5">${taxInfo.taxPercent.toFixed(1)}% CTC</div>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Tab Content: Salary -->
                    <div id="income-content-salary" class="p-4">
                        ${salariesHTML}
                    </div>
                    
                    <!-- Tab Content: Pay Slips -->
                    <div id="income-content-payslips" class="p-4 hidden">
                        ${payslipsHTML}
                    </div>
                    
                    <!-- Tab Content: Income Tax -->
                    <div id="income-content-tax" class="p-4 hidden">
                        ${incomeTaxHTML}
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Switch between Salary, Pay Slips, and Income Tax tabs
     */
    switchIncomeTab(tab) {
        const salaryBtn = document.getElementById('income-tab-salary');
        const payslipsBtn = document.getElementById('income-tab-payslips');
        const taxBtn = document.getElementById('income-tab-tax');
        const salaryContent = document.getElementById('income-content-salary');
        const payslipsContent = document.getElementById('income-content-payslips');
        const taxContent = document.getElementById('income-content-tax');
        
        // Reset all tabs to inactive state
        if (salaryBtn) salaryBtn.className = 'flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        if (payslipsBtn) payslipsBtn.className = 'flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        if (taxBtn) taxBtn.className = 'flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        if (salaryContent) salaryContent.classList.add('hidden');
        if (payslipsContent) payslipsContent.classList.add('hidden');
        if (taxContent) taxContent.classList.add('hidden');
        
        // Activate selected tab
        if (tab === 'salary') {
            if (salaryBtn) salaryBtn.className = 'flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-green-500 text-green-600';
            if (salaryContent) salaryContent.classList.remove('hidden');
        } else if (tab === 'payslips') {
            if (payslipsBtn) payslipsBtn.className = 'flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-blue-500 text-blue-600';
            if (payslipsContent) payslipsContent.classList.remove('hidden');
        } else if (tab === 'tax') {
            if (taxBtn) taxBtn.className = 'flex-1 px-2 py-2.5 text-xs font-semibold transition-colors border-b-2 border-orange-500 text-orange-600';
            if (taxContent) taxContent.classList.remove('hidden');
        }
    },
    
    /**
     * Get total salary for a specific year
     */
    getYearSalaryTotal(year) {
        return window.DB.salaries
            .filter(s => s.year === parseInt(year))
            .reduce((sum, s) => sum + parseFloat(s.amount), 0);
    },
    
    /**
     * Render Salary Tab Content
     */
    renderSalaryTab() {
        const salaries = this.getAllSalaries();
        
        if (salaries.length === 0) {
            return `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">💰</div>
                    <p class="text-gray-500 text-sm mb-4">No salary records yet</p>
                    <button onclick="Income.openSalaryModal()" 
                            class="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg transition-all transform hover:scale-105 font-semibold">
                        + Add Salary
                    </button>
                </div>
            `;
        }
        
        // Group by year
        const byYear = {};
        salaries.forEach(s => {
            if (!byYear[s.year]) {
                byYear[s.year] = [];
            }
            byYear[s.year].push(s);
        });
        
        // Sort years descending
        const years = Object.keys(byYear).sort((a, b) => b - a);
        const currentYear = new Date().getFullYear();
        
        let html = `
            <!-- Add Button -->
            <div class="mb-4">
                <button onclick="Income.openSalaryModal()" 
                        class="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                    </svg>
                    Add Salary
                </button>
            </div>
            
            <!-- Salary Records Grouped by Year -->
            <div class="space-y-3">
        `;
        
        years.forEach(year => {
            const yearSalaries = byYear[year].sort((a, b) => a.month - b.month);
            const yearTotal = yearSalaries.reduce((sum, s) => sum + s.amount, 0);
            const isCurrentYear = parseInt(year) === currentYear;
            
            html += `
                <details ${isCurrentYear ? 'open' : ''} class="salary-year-group bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 overflow-hidden">
                    <summary class="cursor-pointer p-4 hover:bg-green-100 transition-colors select-none list-none">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">📅</span>
                                <div>
                                    <h4 class="font-bold text-green-800">${year}</h4>
                                    <p class="text-xs text-green-600">${yearSalaries.length} month${yearSalaries.length !== 1 ? 's' : ''}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <p class="font-bold text-green-700 text-lg">₹${Utils.formatIndianNumber(Math.round(yearTotal))}</p>
                                    <p class="text-xs text-green-600">Total</p>
                                </div>
                                <svg class="w-5 h-5 text-green-700 transition-transform duration-200 chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </div>
                        </div>
                    </summary>
                    
                    <div class="p-4 pt-2 grid grid-cols-3 gap-3">
                        ${yearSalaries.map(salary => `
                            <div class="bg-white p-3 rounded-lg border border-green-200 hover:shadow-md transition-all">
                                <div class="flex justify-between items-start mb-2">
                                    <p class="font-semibold text-green-700 text-xs">${this.getMonthName(salary.month)}</p>
                                    <div class="flex gap-1">
                                        <button onclick="Income.openSalaryModal(${salary.id})" class="text-blue-600 hover:text-blue-800 p-0.5" title="Edit">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                            </svg>
                                        </button>
                                        <button onclick="Income.deleteSalaryWithConfirm(${salary.id})" class="text-red-600 hover:text-red-800 p-0.5" title="Delete">
                                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <p class="text-base font-bold text-gray-800">₹${Utils.formatIndianNumber(Math.round(salary.amount))}</p>
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        });
        
        html += `
            </div>
        `;
        
        return html;
    },
    
    /**
     * Render Pay Slips Tab Content
     */
    renderPayslipsTab(yearlyPayslips, bonus) {
        return `
            <div class="space-y-2">
                ${yearlyPayslips.map(monthlySlip => {
                    // Determine border and background color
                    let borderColor = 'border-blue-100';
                    let bgColor = 'bg-blue-50';
                    
                    if (monthlySlip.bonus > 0 || monthlySlip.leaveEncashment > 0) {
                        // Green for additional income
                        borderColor = 'border-green-300';
                        bgColor = 'bg-green-50';
                    } else if (monthlySlip.insuranceDeduction > 0) {
                        // Light red for insurance deduction
                        borderColor = 'border-red-200';
                        bgColor = 'bg-red-50';
                    }
                    
                    return `
                    <details class="border ${borderColor} ${bgColor} rounded-lg">
                        <summary class="p-3 cursor-pointer flex justify-between items-center hover:bg-blue-100 rounded-lg transition-all list-none">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 transition-transform details-arrow text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <span class="font-bold text-blue-900">${monthlySlip.month}</span>
                                ${(monthlySlip.bonus > 0 || monthlySlip.leaveEncashment > 0 || monthlySlip.insuranceDeduction > 0) ? `
                                <div class="flex flex-col gap-0.5">
                                    ${monthlySlip.bonus > 0 ? '<span class="text-[9px] bg-green-400 text-green-900 px-1.5 py-0.5 rounded-full font-semibold leading-none">🎁 Bonus</span>' : ''}
                                    ${monthlySlip.leaveEncashment > 0 ? '<span class="text-[9px] bg-green-400 text-green-900 px-1.5 py-0.5 rounded-full font-semibold leading-none">🏖️ Leave</span>' : ''}
                                    ${monthlySlip.insuranceDeduction > 0 ? '<span class="text-[9px] bg-red-300 text-red-900 px-1.5 py-0.5 rounded-full font-semibold leading-none">🏥 Insurance</span>' : ''}
                                </div>
                                ` : ''}
                            </div>
                            <span class="font-bold text-blue-900">₹${Utils.formatIndianNumber(monthlySlip.totalNetPay)}</span>
                        </summary>
                        <div class="p-3 pt-0 space-y-3">
                                    <!-- Earnings -->
                                    <div class="bg-green-50 p-3 rounded-lg">
                                        <p class="font-semibold text-green-800 mb-2 text-sm">Earnings</p>
                                        <div class="space-y-1.5 text-xs">
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">Basic Pay</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.basicPay)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">HRA</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.hra)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">Allowances</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.allowances)}</span>
                                            </div>
                                            ${monthlySlip.leaveEncashment > 0 ? `
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">Leave Encashment</span>
                                                <span class="font-semibold text-cyan-600">₹${Utils.formatIndianNumber(monthlySlip.leaveEncashment)}</span>
                                            </div>` : ''}
                                            <div class="flex justify-between pt-2 border-t border-green-200">
                                                <span class="font-bold text-green-800">Gross Earnings</span>
                                                <span class="font-bold text-green-800">₹${Utils.formatIndianNumber(monthlySlip.grossEarnings)}</span>
                                            </div>
                                            <div class="flex justify-between py-1 bg-green-100 px-2 rounded">
                                                <span class="text-gray-600">PF (Employer)</span>
                                                <span class="font-semibold text-green-700">₹${Utils.formatIndianNumber(monthlySlip.pfEmployer)}</span>
                                            </div>
                                            <div class="flex justify-between py-1 bg-green-100 px-2 rounded">
                                                <span class="font-semibold text-green-900">Total Income (CTC)</span>
                                                <span class="font-semibold text-green-900">₹${Utils.formatIndianNumber(monthlySlip.grossEarnings + monthlySlip.pfEmployer)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Deductions -->
                                    <div class="bg-red-50 p-3 rounded-lg">
                                        <p class="font-semibold text-red-800 mb-2 text-sm">Deductions</p>
                                        <div class="space-y-1.5 text-xs">
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">Income Tax</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.incomeTax)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">Professional Tax</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.professionalTax)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">PF (Employee)</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.pfEmployee)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">ESPP</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(monthlySlip.espp)}</span>
                                            </div>
                                            ${monthlySlip.insuranceDeduction > 0 ? `
                                            <div class="flex justify-between">
                                                <span class="text-gray-600">Health Insurance</span>
                                                <span class="font-semibold text-purple-600">₹${Utils.formatIndianNumber(monthlySlip.insuranceDeduction)}</span>
                                            </div>` : ''}
                                            <div class="flex justify-between pt-2 border-t border-red-200">
                                                <span class="font-bold text-red-800">Gross Deductions</span>
                                                <span class="font-bold text-red-800">₹${Utils.formatIndianNumber(monthlySlip.grossDeductions + (monthlySlip.insuranceDeduction || 0))}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                            <!-- Bonus (if applicable) -->
                            <div class="space-y-2">
                                ${monthlySlip.bonus > 0 ? `
                                <!-- Bonus with inline breakdown -->
                                <details class="bg-yellow-100 rounded-lg">
                                    <summary class="p-3 cursor-pointer hover:bg-yellow-200 transition-all" style="list-style: none;">
                                        <div class="flex justify-between items-center">
                                            <span class="font-bold text-yellow-900 text-sm">🎁 Bonus ${monthlySlip.month === 'September' ? '(Mid-Year - 25%)' : monthlySlip.month === 'April' ? '(Year-End - 75%)' : ''}</span>
                                            <span class="text-base font-bold text-yellow-900">₹${Utils.formatIndianNumber(monthlySlip.bonus)}</span>
                                        </div>
                                    </summary>
                                    <div class="px-3 pb-3 pt-1 space-y-1.5 text-xs border-t border-yellow-200 mt-2">
                                        ${monthlySlip.month === 'September' ? `
                                            <div class="flex justify-between">
                                                <span class="text-gray-700">Before Tax</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(bonus.midYear.beforeTax)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-700">After Tax</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(bonus.midYear.afterTax)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-700">ESPP Cut</span>
                                                <span class="font-semibold text-red-600">-₹${Utils.formatIndianNumber(bonus.midYear.esppCut)}</span>
                                            </div>
                                            <div class="flex justify-between pt-1.5 border-t border-yellow-300 mt-1.5">
                                                <span class="font-bold text-yellow-900">Net Bonus</span>
                                                <span class="font-bold text-yellow-900">₹${Utils.formatIndianNumber(bonus.midYear.net)}</span>
                                            </div>
                                        ` : ''}
                                        ${monthlySlip.month === 'April' ? `
                                            <div class="flex justify-between">
                                                <span class="text-gray-700">Before Tax</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(bonus.yearEnd.beforeTax)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-700">After Tax</span>
                                                <span class="font-semibold">₹${Utils.formatIndianNumber(bonus.yearEnd.afterTax)}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-700">ESPP Cut</span>
                                                <span class="font-semibold text-red-600">-₹${Utils.formatIndianNumber(bonus.yearEnd.esppCut)}</span>
                                            </div>
                                            <div class="flex justify-between pt-1.5 border-t border-yellow-300 mt-1.5">
                                                <span class="font-bold text-yellow-900">Net Bonus</span>
                                                <span class="font-bold text-yellow-900">₹${Utils.formatIndianNumber(bonus.yearEnd.net)}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </details>
                                ` : ''}
                                ${monthlySlip.bonus > 0 ? `
                                <!-- Total Net Pay (after bonus) -->
                                <div class="bg-green-100 p-3 rounded-lg">
                                    <div class="flex justify-between items-center">
                                        <span class="font-bold text-green-900 text-sm">Total Net Pay</span>
                                        <span class="text-lg font-bold text-green-900">₹${Utils.formatIndianNumber(monthlySlip.totalNetPay)}</span>
                                    </div>
                                </div>
                                ` : ''}
                        </div>
                    </details>
                `;
                }).join('')}
            </div>
        `;
    },
    
    /**
     * Render Income Tax Tab Content
     */
    renderIncomeTaxTab(taxInfo, data) {
        return `
            <div class="space-y-3 text-sm">
                        <!-- Tax Slabs Breakdown -->
                        <div class="bg-orange-50 p-3 rounded-lg">
                            <div class="flex justify-between items-center mb-2">
                                <p class="font-semibold text-orange-800 text-xs">Tax Slab Breakdown</p>
                                <button onclick="Income.openTaxSlabsModal()" class="text-xs px-2 py-1 bg-orange-200 hover:bg-orange-300 text-orange-900 rounded transition-all">
                                    ⚙️ Manage
                                </button>
                            </div>
                            <div class="space-y-1.5">
                                ${taxInfo.slabs.map(slab => `
                                    <div class="flex justify-between text-xs">
                                        <span class="text-gray-700">${slab.range} <span class="text-orange-600">(${slab.rate}%)</span></span>
                                        <span class="font-semibold ${slab.tax > 0 ? 'text-orange-800' : 'text-green-600'}">₹${Utils.formatIndianNumber(slab.tax)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- Deductions Breakdown -->
                        <div class="bg-green-50 p-3 rounded-lg">
                            <div class="flex justify-between items-center mb-2">
                                <p class="font-semibold text-green-800 text-xs">Deductions (Taxable Income)</p>
                                <button onclick="Income.manageDeductions()" class="text-xs px-2 py-1 bg-green-200 hover:bg-green-300 text-green-900 rounded transition-all">
                                    ⚙️ Manage
                                </button>
                            </div>
                            <div class="space-y-1 text-xs">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">CTC (Gross Income)</span>
                                    <span class="font-semibold">₹${Utils.formatIndianNumber(data.ctc)}</span>
                                </div>
                                ${taxInfo.exemptEmployerPF > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Employer PF (Exempt)</span>
                                    <span class="font-semibold text-green-700">-₹${Utils.formatIndianNumber(taxInfo.exemptEmployerPF)}</span>
                                </div>` : ''}
                                ${taxInfo.taxableEmployerPF > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Employer PF (Taxable)</span>
                                    <span class="font-semibold text-red-600">+₹${Utils.formatIndianNumber(taxInfo.taxableEmployerPF)}</span>
                                </div>` : ''}
                                ${taxInfo.stdDeduction > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Standard Deduction</span>
                                    <span class="font-semibold text-green-700">-₹${Utils.formatIndianNumber(taxInfo.stdDeduction)}</span>
                                </div>` : ''}
                                ${taxInfo.hraExemption > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">HRA Exemption</span>
                                    <span class="font-semibold text-green-700">-₹${Utils.formatIndianNumber(taxInfo.hraExemption)}</span>
                                </div>` : ''}
                                ${taxInfo.section80C > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Section 80C</span>
                                    <span class="font-semibold text-green-700">-₹${Utils.formatIndianNumber(taxInfo.section80C)}</span>
                                </div>` : ''}
                                ${taxInfo.section80D > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Section 80D</span>
                                    <span class="font-semibold text-green-700">-₹${Utils.formatIndianNumber(taxInfo.section80D)}</span>
                                </div>` : ''}
                                ${taxInfo.otherDeductions > 0 ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Other Deductions</span>
                                    <span class="font-semibold text-green-700">-₹${Utils.formatIndianNumber(taxInfo.otherDeductions)}</span>
                                </div>` : ''}
                                <div class="flex justify-between pt-2 border-t border-green-200 mt-2">
                                    <span class="font-bold text-green-900">Taxable Income</span>
                                    <span class="font-bold text-green-900">₹${Utils.formatIndianNumber(taxInfo.taxableIncome)}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex justify-between py-2 border-b">
                            <span class="text-gray-600">Base Tax</span>
                            <span class="font-semibold">₹${Utils.formatIndianNumber(taxInfo.baseTax)}</span>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b">
                            <span class="text-gray-600">Surcharge (${taxInfo.surchargeRate}%)</span>
                            <div class="flex items-center gap-2">
                                <span class="font-semibold">₹${Utils.formatIndianNumber(taxInfo.surcharge)}</span>
                                <button onclick="Income.manageSurchargeSlabs()" class="text-xs text-blue-600 hover:text-blue-800" title="Manage Slabs">⚙️</button>
                            </div>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b">
                            <span class="text-gray-600">Cess (${taxInfo.cessPercent}%)</span>
                            <div class="flex items-center gap-2">
                                <span class="font-semibold">₹${Utils.formatIndianNumber(taxInfo.cess)}</span>
                                <button onclick="Income.editCessPercent()" class="text-xs text-blue-600 hover:text-blue-800" title="Edit">✏️</button>
                            </div>
                        </div>
                        <div class="flex justify-between py-3 bg-orange-100 px-3 rounded-lg mt-2">
                            <span class="font-bold text-orange-900">Total Tax</span>
                            <span class="font-bold text-orange-900">₹${Utils.formatIndianNumber(taxInfo.totalTax)}</span>
                        </div>
                        <div class="flex justify-between py-2 bg-gray-50 px-3 rounded-lg">
                            <span class="font-semibold text-gray-700">Tax %</span>
                            <span class="font-semibold text-gray-900">${taxInfo.taxPercent.toFixed(2)}%</span>
                        </div>
                <div class="flex justify-between py-2">
                    <span class="font-bold text-gray-700">Monthly Tax</span>
                    <span class="font-bold">₹${Utils.formatIndianNumber(taxInfo.totalTax/12)}</span>
                </div>
            </div>
        `;
    },
    
    /**
     * Open income form
     */
    openForm() {
        const data = this.getData();
        const modal = document.getElementById('income-modal');
        if (!modal) return;
        
        // Helper to format number as Indian currency
        const formatValue = (num) => {
            if (!num) return '';
            return Utils.formatIndianNumber(num);
        };
        
        document.getElementById('income-ctc').value = formatValue(data.ctc);
        document.getElementById('income-bonus-percent').value = data.bonusPercent || '';
        document.getElementById('income-bonus-midyear').value = data.bonusMidYearMultiplier || 1.0;
        document.getElementById('income-bonus-yearend').value = data.bonusYearEndMultiplier || 1.0;
        document.getElementById('income-espp-cycle1').value = data.esppPercentCycle1 || '';
        document.getElementById('income-espp-cycle2').value = data.esppPercentCycle2 || '';
        document.getElementById('income-pf-percent').value = data.pfPercent || 12;
        document.getElementById('income-has-insurance').checked = data.hasInsurance || false;
        document.getElementById('income-insurance-total').value = formatValue(data.insuranceTotal);
        document.getElementById('income-insurance-months').value = data.insuranceMonths ? data.insuranceMonths.length : '';
        document.getElementById('income-leave-days').value = data.leaveDays || '';
        
        // Setup insurance fields
        this.toggleInsuranceFields();
        if (data.hasInsurance) {
            this.updateInsuranceMonths();
            // Pre-select saved months
            if (data.insuranceMonths) {
                data.insuranceMonths.forEach(month => {
                    const checkbox = document.querySelector(`input[name="insurance-month"][value="${month}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
        }
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close income form
     */
    closeForm() {
        const modal = document.getElementById('income-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Update basic pay preview
     */
    /**
     * Save income form
     */
    saveForm() {
        // Helper to get numeric value from potentially formatted input
        const getNumeric = (id) => {
            const value = document.getElementById(id).value;
            return value ? parseFloat(value.replace(/,/g, '')) : 0;
        };
        
        const data = {
            ctc: getNumeric('income-ctc'),
            bonusPercent: document.getElementById('income-bonus-percent').value,
            bonusMidYearMultiplier: parseFloat(document.getElementById('income-bonus-midyear').value) || 1.0,
            bonusYearEndMultiplier: parseFloat(document.getElementById('income-bonus-yearend').value) || 1.0,
            esppPercentCycle1: document.getElementById('income-espp-cycle1').value,
            esppPercentCycle2: document.getElementById('income-espp-cycle2').value,
            pfPercent: document.getElementById('income-pf-percent').value,
            hasInsurance: document.getElementById('income-has-insurance').checked,
            insuranceTotal: getNumeric('income-insurance-total'),
            insuranceMonths: this.getSelectedInsuranceMonths(),
            leaveDays: parseFloat(document.getElementById('income-leave-days').value) || 0
        };
        
        if (!data.ctc || data.ctc <= 0) {
            Utils.showError('Please enter a valid CTC');
            return;
        }
        
        // Validate insurance if enabled
        if (data.hasInsurance && (data.insuranceTotal <= 0 || data.insuranceMonths.length === 0)) {
            Utils.showError('Please enter insurance amount and select months');
            return;
        }
        
        this.save(data);
        this.closeForm();
        Utils.showSuccess('Income details saved!');
    },
    
    /**
     * Open tax slabs management modal
     */
    openTaxSlabsModal() {
        const modal = document.getElementById('tax-slabs-modal');
        if (!modal) return;
        
        this.renderTaxSlabsList();
        modal.classList.remove('hidden');
    },
    
    /**
     * Close tax slabs modal
     */
    closeTaxSlabsModal() {
        const modal = document.getElementById('tax-slabs-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Render tax slabs list in modal
     */
    renderTaxSlabsList() {
        const list = document.getElementById('tax-slabs-list');
        if (!list) return;
        
        const data = this.getData();
        const slabs = [...data.taxSlabs].sort((a, b) => a.min - b.min);
        
        list.innerHTML = slabs.map((slab, index) => `
            <div class="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                <div class="flex-1">
                    <p class="text-sm font-semibold text-gray-800">${slab.label}</p>
                    <p class="text-xs text-gray-600">₹${Utils.formatIndianNumber(slab.min)} - ${slab.max === Infinity ? 'Above' : '₹' + Utils.formatIndianNumber(slab.max)} @ ${slab.rate}%</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="Income.editTaxSlab(${index})" class="text-blue-600 hover:text-blue-800 p-1" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                    </button>
                    <button onclick="Income.deleteTaxSlab(${index})" class="text-red-600 hover:text-red-800 p-1" title="Delete">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    /**
     * Add new tax slab (using simple modal approach)
     */
    addTaxSlab() {
        // Open slab edit modal in add mode
        this.currentEditIndex = null;
        document.getElementById('slab-edit-label').value = '';
        document.getElementById('slab-edit-min').value = '';
        document.getElementById('slab-edit-max').value = '';
        document.getElementById('slab-edit-rate').value = '';
        document.getElementById('slab-edit-title').textContent = 'Add Tax Slab';
        document.getElementById('slab-edit-modal').classList.remove('hidden');
    },
    
    /**
     * Edit tax slab
     */
    editTaxSlab(index) {
        const data = this.getData();
        const slab = data.taxSlabs[index];
        
        // Open slab edit modal in edit mode
        this.currentEditIndex = index;
        document.getElementById('slab-edit-label').value = slab.label;
        document.getElementById('slab-edit-min').value = slab.min;
        document.getElementById('slab-edit-max').value = slab.max === Infinity ? '' : slab.max;
        document.getElementById('slab-edit-rate').value = slab.rate;
        document.getElementById('slab-edit-title').textContent = 'Edit Tax Slab';
        document.getElementById('slab-edit-modal').classList.remove('hidden');
    },
    
    /**
     * Save slab from modal
     */
    saveSlab() {
        const label = document.getElementById('slab-edit-label').value.trim();
        const min = parseFloat(document.getElementById('slab-edit-min').value);
        const maxInput = document.getElementById('slab-edit-max').value.trim();
        const max = maxInput === '' ? Infinity : parseFloat(maxInput);
        const rate = parseFloat(document.getElementById('slab-edit-rate').value);
        
        if (!label) {
            Utils.showError('Please enter a label');
            return;
        }
        if (isNaN(min)) {
            Utils.showError('Invalid minimum amount');
            return;
        }
        if (maxInput !== '' && isNaN(max)) {
            Utils.showError('Invalid maximum amount');
            return;
        }
        if (isNaN(rate)) {
            Utils.showError('Invalid tax rate');
            return;
        }
        
        const data = this.getData();
        const slabData = { min, max, rate, label };
        
        if (this.currentEditIndex === null) {
            // Add new
            data.taxSlabs.push(slabData);
            Utils.showSuccess('Tax slab added!');
        } else {
            // Edit existing
            data.taxSlabs[this.currentEditIndex] = slabData;
            Utils.showSuccess('Tax slab updated!');
        }
        
        window.Storage.save();
        this.renderTaxSlabsList();
        this.render();
        this.closeSlabEditModal();
    },
    
    /**
     * Close slab edit modal
     */
    closeSlabEditModal() {
        document.getElementById('slab-edit-modal').classList.add('hidden');
        this.currentEditIndex = null;
    },
    
    /**
     * Delete tax slab
     */
    deleteTaxSlab(index) {
        if (!confirm('Are you sure you want to delete this tax slab?')) return;
        
        const data = this.getData();
        data.taxSlabs.splice(index, 1);
        
        window.Storage.save();
        this.renderTaxSlabsList();
        this.render();
        Utils.showSuccess('Tax slab deleted!');
    },
    
    /**
     * Reset to default slabs
     */
    resetToDefaultSlabs() {
        if (!confirm('Reset to default tax slabs? This will remove all custom slabs.')) return;
        
        const data = this.getData();
        data.taxSlabs = this.getDefaultTaxSlabs();
        
        window.Storage.save();
        this.renderTaxSlabsList();
        this.render();
        Utils.showSuccess('Tax slabs reset to default!');
    },
    
    /**
     * Manage all deductions
     */
    manageDeductions() {
        const data = this.getData();
        document.getElementById('deductions-std').value = data.stdDeduction;
        document.getElementById('deductions-hra').value = data.hraExemption || 0;
        document.getElementById('deductions-80c').value = data.section80C || 0;
        document.getElementById('deductions-80d').value = data.section80D || 0;
        document.getElementById('deductions-other').value = data.otherDeductions || 0;
        document.getElementById('deductions-modal').classList.remove('hidden');
    },
    
    /**
     * Save all deductions
     */
    saveDeductions() {
        const stdDeduction = parseFloat(document.getElementById('deductions-std').value) || 0;
        const hraExemption = parseFloat(document.getElementById('deductions-hra').value) || 0;
        const section80C = parseFloat(document.getElementById('deductions-80c').value) || 0;
        const section80D = parseFloat(document.getElementById('deductions-80d').value) || 0;
        const otherDeductions = parseFloat(document.getElementById('deductions-other').value) || 0;
        
        if (stdDeduction < 0 || hraExemption < 0 || section80C < 0 || section80D < 0 || otherDeductions < 0) {
            Utils.showError('Deductions cannot be negative');
            return;
        }
        
        const data = this.getData();
        data.stdDeduction = stdDeduction;
        data.hraExemption = hraExemption;
        data.section80C = section80C;
        data.section80D = section80D;
        data.otherDeductions = otherDeductions;
        
        window.Storage.save();
        this.render();
        this.closeDeductionsModal();
        Utils.showSuccess('Deductions updated!');
    },
    
    /**
     * Close deductions modal
     */
    closeDeductionsModal() {
        document.getElementById('deductions-modal').classList.add('hidden');
    },
    
    /**
     * Edit Standard Deduction
     */
    editStdDeduction() {
        const data = this.getData();
        document.getElementById('std-deduction-input').value = data.stdDeduction;
        document.getElementById('std-deduction-modal').classList.remove('hidden');
    },
    
    /**
     * Save Standard Deduction
     */
    saveStdDeduction() {
        const value = parseFloat(document.getElementById('std-deduction-input').value);
        
        if (isNaN(value) || value < 0) {
            Utils.showError('Invalid amount');
            return;
        }
        
        const data = this.getData();
        data.stdDeduction = value;
        window.Storage.save();
        this.render();
        this.closeStdDeductionModal();
        Utils.showSuccess('Standard Deduction updated!');
    },
    
    /**
     * Close Std Deduction Modal
     */
    closeStdDeductionModal() {
        document.getElementById('std-deduction-modal').classList.add('hidden');
    },
    
    /**
     * Edit Cess Percent
     */
    editCessPercent() {
        const data = this.getData();
        document.getElementById('cess-percent-input').value = data.cessPercent;
        document.getElementById('cess-modal').classList.remove('hidden');
    },
    
    /**
     * Save Cess Percent
     */
    saveCessPercent() {
        const value = parseFloat(document.getElementById('cess-percent-input').value);
        
        if (isNaN(value) || value < 0 || value > 100) {
            Utils.showError('Invalid percentage (0-100)');
            return;
        }
        
        const data = this.getData();
        data.cessPercent = value;
        window.Storage.save();
        this.render();
        this.closeCessModal();
        Utils.showSuccess('Cess percentage updated!');
    },
    
    /**
     * Close Cess Modal
     */
    closeCessModal() {
        document.getElementById('cess-modal').classList.add('hidden');
    },
    
    /**
     * Manage Surcharge Slabs
     */
    manageSurchargeSlabs() {
        document.getElementById('surcharge-slabs-modal').classList.remove('hidden');
        this.renderSurchargeSlabsList();
    },
    
    /**
     * Close Surcharge Slabs Modal
     */
    closeSurchargeSlabsModal() {
        document.getElementById('surcharge-slabs-modal').classList.add('hidden');
    },
    
    /**
     * Render surcharge slabs list
     */
    renderSurchargeSlabsList() {
        const data = this.getData();
        const ctc = data.ctc;
        
        document.getElementById('surcharge-slabs-list').innerHTML = data.surchargeSlabs.map((slab, index) => {
            const isActive = ctc >= slab.min && ctc < slab.max;
            const bgClass = isActive ? 'bg-green-100 border-green-500' : 'bg-white';
            const activeLabel = isActive ? '<span class="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded">Active</span>' : '';
            
            return `
                <div class="flex items-center justify-between p-3 border ${bgClass} rounded-lg">
                    <div class="flex-1">
                        <div class="font-semibold text-sm flex items-center">
                            ${slab.label}
                            ${activeLabel}
                        </div>
                        <div class="text-xs text-gray-600">Rate: ${slab.rate}%</div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="Income.editSurchargeSlab(${index})" class="text-blue-600 hover:text-blue-800" title="Edit">✏️</button>
                        <button onclick="Income.deleteSurchargeSlab(${index})" class="text-red-600 hover:text-red-800" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    /**
     * Add surcharge slab
     */
    addSurchargeSlab() {
        this.currentSurchargeEditIndex = null;
        document.getElementById('surcharge-edit-label').value = '';
        document.getElementById('surcharge-edit-min').value = '';
        document.getElementById('surcharge-edit-max').value = '';
        document.getElementById('surcharge-edit-rate').value = '';
        document.getElementById('surcharge-edit-title').textContent = 'Add Surcharge Slab';
        document.getElementById('surcharge-edit-modal').classList.remove('hidden');
    },
    
    /**
     * Edit surcharge slab
     */
    editSurchargeSlab(index) {
        const data = this.getData();
        const slab = data.surchargeSlabs[index];
        
        this.currentSurchargeEditIndex = index;
        document.getElementById('surcharge-edit-label').value = slab.label;
        document.getElementById('surcharge-edit-min').value = slab.min;
        document.getElementById('surcharge-edit-max').value = slab.max === Infinity ? '' : slab.max;
        document.getElementById('surcharge-edit-rate').value = slab.rate;
        document.getElementById('surcharge-edit-title').textContent = 'Edit Surcharge Slab';
        document.getElementById('surcharge-edit-modal').classList.remove('hidden');
    },
    
    /**
     * Save surcharge slab
     */
    saveSurchargeSlab() {
        const label = document.getElementById('surcharge-edit-label').value.trim();
        const min = parseFloat(document.getElementById('surcharge-edit-min').value);
        const maxInput = document.getElementById('surcharge-edit-max').value.trim();
        const max = maxInput === '' ? Infinity : parseFloat(maxInput);
        const rate = parseFloat(document.getElementById('surcharge-edit-rate').value);
        
        if (!label) {
            Utils.showError('Please enter a label');
            return;
        }
        if (isNaN(min)) {
            Utils.showError('Invalid minimum amount');
            return;
        }
        if (maxInput !== '' && isNaN(max)) {
            Utils.showError('Invalid maximum amount');
            return;
        }
        if (isNaN(rate)) {
            Utils.showError('Invalid rate');
            return;
        }
        
        const data = this.getData();
        const slabData = { min, max, rate, label };
        
        if (this.currentSurchargeEditIndex === null) {
            data.surchargeSlabs.push(slabData);
            Utils.showSuccess('Surcharge slab added!');
        } else {
            data.surchargeSlabs[this.currentSurchargeEditIndex] = slabData;
            Utils.showSuccess('Surcharge slab updated!');
        }
        
        window.Storage.save();
        this.renderSurchargeSlabsList();
        this.render();
        this.closeSurchargeEditModal();
    },
    
    /**
     * Delete surcharge slab
     */
    deleteSurchargeSlab(index) {
        if (!confirm('Are you sure you want to delete this surcharge slab?')) return;
        
        const data = this.getData();
        data.surchargeSlabs.splice(index, 1);
        
        window.Storage.save();
        this.renderSurchargeSlabsList();
        this.render();
        Utils.showSuccess('Surcharge slab deleted!');
    },
    
    /**
     * Close surcharge edit modal
     */
    closeSurchargeEditModal() {
        document.getElementById('surcharge-edit-modal').classList.add('hidden');
        this.currentSurchargeEditIndex = null;
    },
    
    /**
     * Reset surcharge slabs to default
     */
    resetSurchargeSlabs() {
        if (!confirm('Reset to default surcharge slabs? This will remove all custom slabs.')) return;
        
        const data = this.getData();
        data.surchargeSlabs = this.getDefaultSurchargeSlabs();
        
        window.Storage.save();
        this.renderSurchargeSlabsList();
        this.render();
        Utils.showSuccess('Surcharge slabs reset to default!');
    },
    
    /**
     * Toggle insurance fields visibility
     */
    toggleInsuranceFields() {
        const checkbox = document.getElementById('income-has-insurance');
        const fields = document.getElementById('insurance-fields');
        if (checkbox && fields) {
            if (checkbox.checked) {
                fields.classList.remove('hidden');
            } else {
                fields.classList.add('hidden');
            }
        }
    },
    
    /**
     * Update insurance months checkboxes
     */
    updateInsuranceMonths() {
        const numMonths = parseInt(document.getElementById('income-insurance-months').value) || 0;
        const totalValue = document.getElementById('income-insurance-total').value || '';
        // Remove commas from formatted currency before parsing
        const total = parseFloat(totalValue.replace(/,/g, '')) || 0;
        const container = document.getElementById('insurance-months-checkboxes');
        const perMonthDiv = document.getElementById('insurance-per-month');
        
        if (!container) return;
        
        if (numMonths > 0 && numMonths <= 12) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const perMonth = total / numMonths;
            
            container.innerHTML = months.map((month, index) => `
                <label class="flex items-center gap-1 p-1 bg-purple-100 rounded cursor-pointer hover:bg-purple-200">
                    <input type="checkbox" name="insurance-month" value="${index + 1}" class="w-3 h-3">
                    <span class="text-xs">${month}</span>
                </label>
            `).join('');
            
            if (perMonthDiv && total > 0) {
                perMonthDiv.textContent = `₹${Utils.formatIndianNumber(perMonth)} per month`;
            }
        } else {
            container.innerHTML = '<p class="text-xs text-purple-600">Enter number of months first</p>';
            if (perMonthDiv) perMonthDiv.textContent = '';
        }
    },
    
    /**
     * Get selected insurance months
     */
    getSelectedInsuranceMonths() {
        const checkboxes = document.querySelectorAll('input[name="insurance-month"]:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.value));
    },
    
    /**
     * Open salary modal for add/edit
     */
    openSalaryModal(id = null) {
        const modal = document.getElementById('salary-modal');
        if (!modal) return;
        
        // Clear fields and set defaults
        const now = new Date();
        document.getElementById('salary-modal-id').value = '';
        document.getElementById('salary-modal-month').value = now.getMonth() + 1; // Current month (1-12)
        document.getElementById('salary-modal-year').value = now.getFullYear();
        document.getElementById('salary-modal-amount').value = '';
        document.getElementById('salary-modal-title').textContent = 'Add Salary';
        
        // If editing, populate with existing data
        if (id) {
            const salary = this.getSalaryById(id);
            if (salary) {
                document.getElementById('salary-modal-id').value = salary.id;
                document.getElementById('salary-modal-month').value = salary.month;
                document.getElementById('salary-modal-year').value = salary.year;
                document.getElementById('salary-modal-amount').value = salary.amount;
                document.getElementById('salary-modal-title').textContent = 'Edit Salary';
            }
        }
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close salary modal
     */
    closeSalaryModal() {
        document.getElementById('salary-modal').classList.add('hidden');
    },
    
    /**
     * Save salary from modal
     */
    saveSalaryModal() {
        const id = document.getElementById('salary-modal-id').value;
        const month = document.getElementById('salary-modal-month').value;
        const year = document.getElementById('salary-modal-year').value;
        const amount = document.getElementById('salary-modal-amount').value;
        
        try {
            if (id) {
                this.updateSalary(id, month, year, amount);
                Utils.showSuccess('Salary updated successfully!');
            } else {
                this.addSalary(month, year, amount);
                Utils.showSuccess('Salary added successfully!');
            }
            
            this.closeSalaryModal();
            this.render();
        } catch (error) {
            Utils.showError(error.message);
        }
    },
    
    /**
     * Delete salary with confirmation
     */
    deleteSalaryWithConfirm(id) {
        const salary = this.getSalaryById(id);
        if (!salary) return;
        
        const monthName = this.getMonthName(salary.month);
        
        if (confirm(`Delete salary for ${monthName} ${salary.year}?\n\nAmount: ₹${Utils.formatIndianNumber(salary.amount)}\n\nThis action cannot be undone.`)) {
            this.deleteSalary(id);
            Utils.showSuccess('Salary deleted');
            this.render();
        }
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    window.Income = Income;
}

