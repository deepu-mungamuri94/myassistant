/**
 * Database Module
 * Central data store for the application
 */

const DB = {
    credentials: [],
    cards: [],
    expenses: [],
    investments: [],
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
        // Priority order for AI fallback (1st = primary, 2nd = fallback 1, etc.)
        priorityOrder: ['gemini', 'groq', 'chatgpt', 'perplexity']
    },
    // Backward compatibility: Store groqApiKey at root level
    groqApiKey: '',
    security: {
        pinHash: null, // SHA-256 hash of PIN
        biometricEnabled: false, // Whether biometric is enabled
        isSetup: false // Whether security is set up
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.DB = DB;
}

