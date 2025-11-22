/**
 * Perplexity AI Integration
 * Handles communication with Perplexity API
 */

const Perplexity = {
    API_ENDPOINT: 'https://api.perplexity.ai/chat/completions',

    /**
     * Call Perplexity API
     */
    async call(prompt, context = null) {
        const apiKey = window.DB.settings.perplexityApiKey;
        const model = window.DB.settings.perplexityModel || 'llama-3.1-sonar-large-128k-online';
        
        if (!apiKey) {
            throw new Error('Please configure your Perplexity API key in Settings');
        }
        
        // Get smart system instructions
        let systemMessage = window.AIProvider ? window.AIProvider.getSystemInstruction(context) : 'You are a helpful financial assistant.';
        let userMessage = prompt;
        
        if (context) {
            // Append context data to system message
            systemMessage += '\n\nContext Data:\n' + JSON.stringify(context, null, 2);
            userMessage = `User Query: ${prompt}\n\nProvide helpful insights based on the context data provided in the system message.`;
        }
        
        const response = await fetch(this.API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: systemMessage
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
                search_domain_filter: ['hdfc.com', 'icicibank.com', 'sbi.co.in', 'axisbank.com', 'americanexpress.com'],
                return_citations: true,
                return_images: false
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            const errorMsg = error.error?.message || 'API request failed';
            throw new Error(`Perplexity (${model}): ${errorMsg}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Perplexity = Perplexity;
}

