/**
 * Database Module
 * Central data store for the application
 */

const DB = {
    credentials: [],
    cards: [],
    expenses: [],
    portfolioInvestments: [], // Portfolio investments (id, name, type, goal, quantity, price, currency, amount, tenure, endDate, interestRate, description)
    monthlyInvestments: [], // Monthly investment tracking (id, name, type, goal, quantity, price, currency, amount, date, description)
    sharePrices: [], // Share price tracking (name, price, currency, active, lastUpdated)
    recurringExpenses: [], // Custom recurring expenses (LIC, insurance, etc.)
    loans: [], // Loan tracking
    income: null, // Income and payslip data
    dismissedRecurringExpenses: [], // Track dismissed auto-recurring expenses
    chatHistory: [],
    exchangeRate: 89, // Default USD to INR rate
    goldRatePerGram: 11400, // Gold rate in INR per gram (default)

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
        priorityOrder: ['groq', 'gemini', 'chatgpt', 'perplexity']
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

