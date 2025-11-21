/**
 * Calculation Utilities
 * Common financial and mathematical calculations
 */

const Calculations = {
    /**
     * Calculate EMI (Equated Monthly Installment)
     * @param {number} principal - Principal amount
     * @param {number} ratePercent - Annual interest rate (in percentage)
     * @param {number} tenureMonths - Tenure in months
     * @returns {number} - Monthly EMI
     */
    calculateEMI(principal, ratePercent, tenureMonths) {
        if (ratePercent === 0) {
            return principal / tenureMonths;
        }
        
        const monthlyRate = ratePercent / (12 * 100);
        const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) / 
                    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
        
        return Math.round(emi * 100) / 100;
    },

    /**
     * Calculate total interest on loan
     * @param {number} emi - Monthly EMI
     * @param {number} tenureMonths - Tenure in months
     * @param {number} principal - Principal amount
     * @returns {number} - Total interest
     */
    calculateTotalInterest(emi, tenureMonths, principal) {
        return (emi * tenureMonths) - principal;
    },

    /**
     * Calculate loan amortization schedule
     * @param {number} principal - Principal amount
     * @param {number} ratePercent - Annual interest rate
     * @param {number} tenureMonths - Tenure in months
     * @returns {Array} - Amortization schedule
     */
    calculateAmortization(principal, ratePercent, tenureMonths) {
        const monthlyRate = ratePercent / (12 * 100);
        const emi = this.calculateEMI(principal, ratePercent, tenureMonths);
        const schedule = [];
        let balance = principal;

        for (let month = 1; month <= tenureMonths; month++) {
            const interest = balance * monthlyRate;
            const principalPaid = emi - interest;
            balance -= principalPaid;

            schedule.push({
                month,
                emi: Math.round(emi * 100) / 100,
                principal: Math.round(principalPaid * 100) / 100,
                interest: Math.round(interest * 100) / 100,
                balance: Math.max(0, Math.round(balance * 100) / 100)
            });
        }

        return schedule;
    },

    /**
     * Calculate compound interest
     * @param {number} principal - Principal amount
     * @param {number} ratePercent - Annual interest rate
     * @param {number} years - Time in years
     * @param {number} compoundingFrequency - Times compounded per year (default 1)
     * @returns {number} - Final amount
     */
    calculateCompoundInterest(principal, ratePercent, years, compoundingFrequency = 1) {
        const rate = ratePercent / 100;
        return principal * Math.pow(1 + (rate / compoundingFrequency), compoundingFrequency * years);
    },

    /**
     * Calculate simple interest
     * @param {number} principal - Principal amount
     * @param {number} ratePercent - Annual interest rate
     * @param {number} years - Time in years
     * @returns {number} - Interest amount
     */
    calculateSimpleInterest(principal, ratePercent, years) {
        return (principal * ratePercent * years) / 100;
    },

    /**
     * Calculate percentage change
     * @param {number} oldValue - Old value
     * @param {number} newValue - New value
     * @returns {number} - Percentage change
     */
    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0) return newValue === 0 ? 0 : 100;
        return ((newValue - oldValue) / oldValue) * 100;
    },

    /**
     * Calculate average
     * @param {Array<number>} numbers - Array of numbers
     * @returns {number} - Average value
     */
    calculateAverage(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        const sum = numbers.reduce((acc, num) => acc + num, 0);
        return sum / numbers.length;
    },

    /**
     * Calculate sum
     * @param {Array<number>} numbers - Array of numbers
     * @returns {number} - Sum
     */
    calculateSum(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        return numbers.reduce((acc, num) => acc + num, 0);
    },

    /**
     * Calculate median
     * @param {Array<number>} numbers - Array of numbers
     * @returns {number} - Median value
     */
    calculateMedian(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    },

    /**
     * Calculate income tax (Old Regime)
     * @param {number} taxableIncome - Taxable income
     * @param {Array} slabs - Tax slabs [{min, max, rate}]
     * @returns {number} - Tax amount
     */
    calculateIncomeTax(taxableIncome, slabs) {
        let tax = 0;
        let remainingIncome = taxableIncome;

        for (const slab of slabs) {
            if (remainingIncome <= 0) break;
            
            const slabAmount = slab.max === Infinity 
                ? remainingIncome 
                : Math.min(remainingIncome, slab.max - slab.min);
            
            tax += (slabAmount * slab.rate) / 100;
            remainingIncome -= slabAmount;
        }

        return tax;
    },

    /**
     * Calculate surcharge on tax
     * @param {number} incomeTax - Income tax amount
     * @param {number} income - Total income
     * @param {Array} surchargeSlabs - Surcharge slabs
     * @returns {number} - Surcharge amount
     */
    calculateSurcharge(incomeTax, income, surchargeSlabs) {
        for (const slab of surchargeSlabs) {
            if (income >= slab.min && (slab.max === Infinity || income <= slab.max)) {
                return (incomeTax * slab.rate) / 100;
            }
        }
        return 0;
    },

    /**
     * Calculate cess on tax
     * @param {number} taxWithSurcharge - Tax + Surcharge
     * @param {number} cessPercent - Cess percentage (default 4%)
     * @returns {number} - Cess amount
     */
    calculateCess(taxWithSurcharge, cessPercent = 4) {
        return (taxWithSurcharge * cessPercent) / 100;
    },

    /**
     * Calculate investment returns (CAGR - Compound Annual Growth Rate)
     * @param {number} initialValue - Initial investment
     * @param {number} finalValue - Final value
     * @param {number} years - Investment period in years
     * @returns {number} - CAGR percentage
     */
    calculateCAGR(initialValue, finalValue, years) {
        if (initialValue === 0 || years === 0) return 0;
        return (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
    },

    /**
     * Calculate SIP (Systematic Investment Plan) returns
     * @param {number} monthlyInvestment - Monthly investment amount
     * @param {number} ratePercent - Expected annual return rate
     * @param {number} months - Investment period in months
     * @returns {Object} - {totalInvested, totalReturns, maturityAmount}
     */
    calculateSIP(monthlyInvestment, ratePercent, months) {
        const monthlyRate = ratePercent / (12 * 100);
        const totalInvested = monthlyInvestment * months;
        
        // Future value of SIP
        const maturityAmount = monthlyInvestment * 
            ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * 
            (1 + monthlyRate);
        
        const totalReturns = maturityAmount - totalInvested;

        return {
            totalInvested: Math.round(totalInvested),
            totalReturns: Math.round(totalReturns),
            maturityAmount: Math.round(maturityAmount)
        };
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Calculations = Calculations;
}

