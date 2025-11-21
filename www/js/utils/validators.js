/**
 * Validation Utilities
 * Input validation and data verification
 */

const Validators = {
    /**
     * Validate required field
     * @param {*} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    required(value, fieldName = 'This field') {
        const isEmpty = value === null || value === undefined || value === '' || 
                       (typeof value === 'string' && value.trim() === '');
        return {
            valid: !isEmpty,
            error: isEmpty ? `${fieldName} is required` : null
        };
    },

    /**
     * Validate amount (must be positive number)
     * @param {*} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    amount(value, fieldName = 'Amount') {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, error: `${fieldName} must be a number` };
        }
        if (num < 0) {
            return { valid: false, error: `${fieldName} must be positive` };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate positive integer
     * @param {*} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    positiveInteger(value, fieldName = 'Value') {
        const num = parseInt(value);
        if (isNaN(num)) {
            return { valid: false, error: `${fieldName} must be a number` };
        }
        if (num <= 0 || num !== parseFloat(value)) {
            return { valid: false, error: `${fieldName} must be a positive integer` };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate percentage (0-100)
     * @param {*} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    percentage(value, fieldName = 'Percentage') {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, error: `${fieldName} must be a number` };
        }
        if (num < 0 || num > 100) {
            return { valid: false, error: `${fieldName} must be between 0 and 100` };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate date
     * @param {string} value - Date string to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    date(value, fieldName = 'Date') {
        if (!value) {
            return { valid: false, error: `${fieldName} is required` };
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            return { valid: false, error: `${fieldName} is invalid` };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate date range (start must be before end)
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Object} - {valid: boolean, error: string}
     */
    dateRange(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { valid: false, error: 'Invalid date format' };
        }
        if (start > end) {
            return { valid: false, error: 'Start date must be before end date' };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate string length
     * @param {string} value - String to validate
     * @param {number} maxLength - Maximum length
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    maxLength(value, maxLength, fieldName = 'Field') {
        if (!value) return { valid: true, error: null };
        
        if (value.length > maxLength) {
            return { 
                valid: false, 
                error: `${fieldName} must be ${maxLength} characters or less` 
            };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate minimum length
     * @param {string} value - String to validate
     * @param {number} minLength - Minimum length
     * @param {string} fieldName - Field name for error message
     * @returns {Object} - {valid: boolean, error: string}
     */
    minLength(value, minLength, fieldName = 'Field') {
        if (!value || value.length < minLength) {
            return { 
                valid: false, 
                error: `${fieldName} must be at least ${minLength} characters` 
            };
        }
        return { valid: true, error: null };
    },

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {Object} - {valid: boolean, error: string}
     */
    email(email) {
        if (!email) {
            return { valid: false, error: 'Email is required' };
        }
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const valid = regex.test(email);
        return {
            valid,
            error: valid ? null : 'Invalid email format'
        };
    },

    /**
     * Validate phone number (Indian format)
     * @param {string} phone - Phone number to validate
     * @returns {Object} - {valid: boolean, error: string}
     */
    phone(phone) {
        if (!phone) {
            return { valid: false, error: 'Phone number is required' };
        }
        const regex = /^[6-9]\d{9}$/;
        const valid = regex.test(phone.replace(/\s+/g, ''));
        return {
            valid,
            error: valid ? null : 'Invalid phone number format'
        };
    },

    /**
     * Validate form fields
     * @param {Object} formData - Form data object
     * @param {Object} rules - Validation rules
     * @returns {Object} - {valid: boolean, errors: Object}
     * 
     * Example rules:
     * {
     *   amount: ['required', 'amount'],
     *   name: ['required', {maxLength: 50}],
     *   email: ['email']
     * }
     */
    validateForm(formData, rules) {
        const errors = {};
        let isValid = true;

        for (const [field, fieldRules] of Object.entries(rules)) {
            const value = formData[field];

            for (const rule of fieldRules) {
                let result;

                if (typeof rule === 'string') {
                    // Simple rule like 'required', 'email', 'amount'
                    if (this[rule]) {
                        result = this[rule](value, field);
                    }
                } else if (typeof rule === 'object') {
                    // Rule with params like {maxLength: 50}
                    const ruleName = Object.keys(rule)[0];
                    const ruleParam = rule[ruleName];
                    if (this[ruleName]) {
                        result = this[ruleName](value, ruleParam, field);
                    }
                }

                if (result && !result.valid) {
                    errors[field] = result.error;
                    isValid = false;
                    break; // Stop at first error for this field
                }
            }
        }

        return { valid: isValid, errors };
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Validators = Validators;
}

