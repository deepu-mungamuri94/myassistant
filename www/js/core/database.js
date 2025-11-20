/**
 * Database Module
 * Central data store for the application
 */

const DB = {
    credentials: [],
    cards: [],
    expenses: [],
    investments: [], // Existing investments (cumulative portfolio)
    monthlyInvestments: [], // Monthly investment tracking
    recurringExpenses: [], // Custom recurring expenses (LIC, insurance, etc.)
    loans: [], // Loan tracking
    income: null, // Income and payslip data
    dismissedRecurringExpenses: [], // Track dismissed auto-recurring expenses
    chatHistory: [],
    exchangeRate: {
        rate: 83, // Default USD to INR rate
        lastUpdated: null
    },
    settings: {
        aiProvider: 'gemini',
        geminiApiKey: '',
        groqApiKey: '',
        chatGptApiKey: '',
        perplexityApiKey: '',
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

