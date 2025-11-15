/**
 * OpenAI ChatGPT Integration
 * Handles communication with ChatGPT API
 */

const ChatGPT = {
    API_ENDPOINT: 'https://api.openai.com/v1/chat/completions',

    /**
     * Call ChatGPT API
     */
    async call(prompt, context = null) {
        const apiKey = window.DB.settings.chatGptApiKey;
        
        if (!apiKey) {
            throw new Error('Please configure your ChatGPT API key in Settings');
        }
        
        let fullPrompt = prompt;
        if (context) {
            fullPrompt = `Context:\n${JSON.stringify(context, null, 2)}\n\nUser Query: ${prompt}\n\nProvide helpful insights based on the context.`;
        }
        
        const response = await fetch(this.API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a financial advisor specializing in credit card recommendations. When given card names, search online for their current benefits, rewards, cashback rates, and promotional offers from official bank websites. Provide specific, actionable recommendations with sources. Never ask for or reference sensitive information like card numbers, CVV, or expiry dates.'
                    },
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'ChatGPT request failed');
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ChatGPT = ChatGPT;
}

