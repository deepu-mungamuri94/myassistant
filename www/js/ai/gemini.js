/**
 * Google Gemini AI Integration
 * Handles communication with Gemini API
 */

const GeminiAI = {
    API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',

    /**
     * Call Gemini AI API
     */
    async call(prompt, context = null) {
        const apiKey = window.DB.settings.geminiApiKey;
        
        if (!apiKey) {
            throw new Error('Please configure your Gemini API key in Settings');
        }
        
        let fullPrompt = prompt;
        let systemInstruction = this.getSystemInstruction(context);
        
        // Check if context has system_instruction (for CardAdvisor-style prompts)
        if (context && context.system_instruction) {
            systemInstruction = context.system_instruction;
            context = null; // Don't include in prompt
        } else if (context) {
            fullPrompt = this.formatPromptWithContext(prompt, context);
        }
        
        const payload = {
            contents: [{
                parts: [{ text: fullPrompt }]
            }],
            systemInstruction: {
                parts: [{
                    text: systemInstruction
                }]
            }
        };
        
        // Add Google Search tool for comprehensive data fetching
        if (systemInstruction.includes('Search') || systemInstruction.includes('official')) {
            payload.tools = [{ "google_search": {} }];
        }
        
        const response = await fetch(`${this.API_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'AI request failed');
        }
        
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    },
    
    /**
     * Get system instruction based on context mode
     */
    getSystemInstruction(context) {
        if (!context || !context.mode) {
            return 'You are a helpful financial assistant.';
        }
        
        switch(context.mode) {
            case 'credit_cards':
                return `You are a credit card advisor. Use ONLY the stored benefit information provided. DO NOT search online.
Analyze the stored benefits data to recommend the best card for user queries.
Focus on: reward rates, category-specific benefits, cashback, milestone bonuses.
Never ask for or reference sensitive information like card numbers or CVV.`;
                
            case 'expenses':
                return `You are an expense analysis expert. Analyze the expense data provided to answer user queries.
You can: calculate totals, group by categories/months/years, identify spending patterns, compare periods.
Provide insights with specific numbers, dates, and trends.
Use Indian Rupee (₹) for all amounts.`;
                
            case 'investments':
                return `You are an investment portfolio analyst. Analyze the investment data provided to answer user queries.
You can: calculate total portfolio value, analyze asset allocation, track performance, identify gaps.
Handle stocks, long-term, short-term investments, and provident funds.
Consider USD to INR conversion rates provided.
Use Indian Rupee (₹) for all amounts.`;
                
            default:
                return 'You are a helpful financial assistant.';
        }
    },
    
    /**
     * Format prompt with context based on mode
     */
    formatPromptWithContext(prompt, context) {
        const mode = context.mode;
        delete context.mode; // Remove mode from data
        
        let formattedContext = '';
        
        if (mode === 'credit_cards') {
            formattedContext = `MY CREDIT CARDS:\n${JSON.stringify(context.available_cards, null, 2)}`;
        } else if (mode === 'expenses') {
            formattedContext = `EXPENSE DATA (${context.expenses.length} transactions, Total: ₹${context.total.toFixed(2)}):\n${JSON.stringify(context.expenses, null, 2)}`;
        } else if (mode === 'investments') {
            formattedContext = `INVESTMENT PORTFOLIO (${context.investments.length} items, Total: ₹${context.total.toFixed(2)}, Exchange Rate: ₹${context.exchangeRate}):\n${JSON.stringify(context.investments, null, 2)}`;
        }
        
        return `${formattedContext}\n\nUSER QUERY: ${prompt}`;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.GeminiAI = GeminiAI;
}

