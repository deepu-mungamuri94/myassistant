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
        const model = window.DB.settings.chatGptModel || 'gpt-4o-mini';
        
        if (!apiKey) {
            throw new Error('Please configure your ChatGPT API key in Settings');
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
                ]
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            const errorMsg = error.error?.message || 'API request failed';
            throw new Error(`ChatGPT (${model}): ${errorMsg}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ChatGPT = ChatGPT;
}

