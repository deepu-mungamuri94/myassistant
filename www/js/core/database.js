/**
 * Database Module
 * Central data store for the application
 */

const DB = {
    credentials: [],
    cards: [], // Card fields: id, name, cardNumber, expiry, cvv, cardType, creditLimit, outstanding, statementDate, billDate, isPlaceholder, benefits, benefitsFetchedAt, emis, createdAt
    expenses: [],
    portfolioInvestments: [], // Portfolio investments (id, name, type, goal, quantity, price, currency, amount, tenure, endDate, interestRate, description)
    monthlyInvestments: [], // Monthly investment tracking (id, name, type, goal, quantity, price, currency, amount, date, description)
    sharePrices: [], // Share price tracking (name, price, currency, active, lastUpdated)
    recurringExpenses: [], // Custom recurring expenses (LIC, insurance, etc.)
    loans: [], // Loan tracking
    moneyLent: [], // Money lent to others tracking
    income: null, // Income and payslip data
    salaries: [], // Actual salary tracking (month, year, amount) - factual bank credits
    dismissedRecurringExpenses: [], // Track dismissed auto-recurring expenses
    chatHistory: [],
    exchangeRate: 89, // Default USD to INR rate
    goldRatePerGram: 11400, // Gold rate in INR per gram (default)
    
    // Credit Card Bills from SMS
    cardBills: [], // Bill records: { id, cardId, cardLast4, amount, originalAmount, dueDate, minDue, isPaid, paidAmount, paidType, paidAt, smsId, smsBody, parsedAt }
    processedSmsIds: [], // Track already processed SMS IDs to avoid duplicates
    
    // Card Groups - for cards sharing credit limit/billing
    // { id, name, sharedLimit, primaryCardId, shareBill (bool), cardIds[] }
    cardGroups: [],
    
    // Bank group order for card display (first word of card name)
    bankGroupOrder: [],

    settings: {
        aiProvider: 'gemini',
        geminiApiKey: '',
        groqApiKey: '',
        chatGptApiKey: '',
        perplexityApiKey: '',
        // Model IDs for each provider (can be updated by user)
        geminiModel: 'gemini-2.0-flash-lite',
        groqModel: 'llama-3.3-70b-versatile',
        chatGptModel: 'gpt-4o-mini',
        perplexityModel: 'llama-3.1-sonar-large-128k-online',
        // Priority order for AI fallback (Groq is FIXED at #1 for chat, rest is configurable)
        priorityOrder: ['groq', 'gemini', 'chatgpt', 'perplexity'],
        // Pay schedule: 'first_week' or 'last_week' - determines which month's income to compare expenses against
        paySchedule: 'first_week'
    },
    // Backward compatibility: Store groqApiKey at root level
    groqApiKey: '',
    security: {
        pinHash: null, // SHA-256 hash of PIN
        biometricEnabled: false, // Whether biometric is enabled
        isSetup: false, // Whether security is set up
        masterPassword: '' // Master password for export/import encryption
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.DB = DB;
}

