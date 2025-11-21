/**
 * Specialized Formatters
 * Module-specific formatting utilities
 */

const Formatters = {
    /**
     * Format monthly date with optional year
     * @param {Date|string} date - Date to format
     * @param {boolean} showYear - Show year (default true)
     * @returns {string} - Formatted date
     */
    formatMonthlyDate(date, showYear = true) {
        const d = typeof date === 'string' ? new Date(date) : date;
        const month = Utils.getMonthName(d.getMonth() + 1, true);
        const year = d.getFullYear();
        return showYear ? `${month} ${year}` : month;
    },

    /**
     * Format investment amount based on type
     * @param {Object} investment - Investment object
     * @param {number} goldRate - Gold rate per gram
     * @param {number} exchangeRate - USD to INR exchange rate
     * @returns {number} - Calculated amount in INR
     */
    formatInvestmentAmount(investment, goldRate = 7000, exchangeRate = 83) {
        const type = investment.type;
        
        if (type === 'SHARES') {
            const priceInINR = investment.currency === 'USD' 
                ? investment.price * exchangeRate 
                : investment.price;
            return priceInINR * (investment.quantity || 0);
        } else if (type === 'GOLD') {
            return (investment.price || goldRate) * (investment.quantity || 0);
        } else if (type === 'EPF' || type === 'FD') {
            return investment.amount || 0;
        }
        
        return 0;
    },

    /**
     * Format loan EMI with remaining details
     * @param {Object} loan - Loan object
     * @returns {Object} - Formatted loan details
     */
    formatLoanDetails(loan) {
        const firstEmiDate = new Date(loan.firstEmiDate);
        const now = new Date();
        
        // Calculate months elapsed
        const monthsElapsed = (now.getFullYear() - firstEmiDate.getFullYear()) * 12 
            + (now.getMonth() - firstEmiDate.getMonth());
        
        const paidMonths = Math.max(0, Math.min(monthsElapsed, loan.tenure));
        const remainingMonths = loan.tenure - paidMonths;
        const paidAmount = paidMonths * loan.emi;
        const remainingAmount = loan.principalAmount - paidAmount;
        const progress = (paidMonths / loan.tenure) * 100;
        
        return {
            paidMonths,
            remainingMonths,
            paidAmount,
            remainingAmount,
            progress: Math.min(progress, 100)
        };
    },

    /**
     * Format expense category display
     * @param {Object} expense - Expense object
     * @returns {string} - Formatted category
     */
    formatExpenseCategory(expense) {
        const category = expense.category || 'Uncategorized';
        return Utils.capitalize(category);
    },

    /**
     * Format recurring frequency
     * @param {string} frequency - Frequency value (monthly, yearly, etc.)
     * @returns {string} - Formatted frequency
     */
    formatRecurringFrequency(frequency) {
        const frequencies = {
            'monthly': 'Monthly',
            'yearly': 'Yearly',
            'quarterly': 'Quarterly',
            'weekly': 'Weekly'
        };
        return frequencies[frequency] || Utils.capitalize(frequency);
    },

    /**
     * Format card last 4 digits
     * @param {string} cardNumber - Full or partial card number
     * @returns {string} - Formatted as "****1234"
     */
    formatCardNumber(cardNumber) {
        if (!cardNumber) return '****';
        const last4 = cardNumber.slice(-4);
        return `****${last4}`;
    },

    /**
     * Format income tax regime
     * @param {string} regime - Regime type
     * @returns {string} - Formatted regime name
     */
    formatTaxRegime(regime) {
        const regimes = {
            'old': 'Old Tax Regime',
            'new': 'New Tax Regime'
        };
        return regimes[regime] || regime;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Formatters = Formatters;
}

