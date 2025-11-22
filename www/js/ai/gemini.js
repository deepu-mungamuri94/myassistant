/**
 * Google Gemini AI Integration
 * Handles communication with Gemini API
 */

const GeminiAI = {
    /**
     * Call Gemini AI API
     */
    async call(prompt, context = null) {
        const apiKey = window.DB.settings.geminiApiKey;
        const model = window.DB.settings.geminiModel || 'gemini-2.0-flash-lite';
        
        if (!apiKey) {
            throw new Error('Please configure your Gemini API key in Settings');
        }
        
        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        
        let fullPrompt = prompt;
        let systemInstruction = window.AIProvider.getSystemInstruction(context);
        
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
        
        const response = await fetch(`${API_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json();
            const errorMsg = error.error?.message || 'AI request failed';
            throw new Error(`Gemini (${model}): ${errorMsg}`);
        }
        
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
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

