/**
 * AI Provider Abstraction Layer
 * Unified interface for different AI providers
 */

const AIProvider = {
    /**
     * Get all available providers (with API keys configured)
     */
    getAvailableProviders() {
        const available = [];
        
        if (window.DB.settings.geminiApiKey) {
            available.push('gemini');
        }
        if (window.DB.groqApiKey) {
            available.push('groq');
        }
        if (window.DB.settings.chatGptApiKey) {
            available.push('chatgpt');
        }
        if (window.DB.settings.perplexityApiKey) {
            available.push('perplexity');
        }
        
        return available;
    },
    
    /**
     * Get providers that support web search
     * Only Gemini and Perplexity have built-in web search capabilities
     */
    getWebSearchProviders() {
        const webSearchCapable = [];
        
        if (window.DB.settings.geminiApiKey) {
            webSearchCapable.push('gemini');
        }
        if (window.DB.settings.perplexityApiKey) {
            webSearchCapable.push('perplexity');
        }
        
        return webSearchCapable;
    },

    /**
     * Call a specific provider
     */
    async callProvider(provider, prompt, context) {
        switch(provider) {
            case 'gemini':
                return await window.GeminiAI.call(prompt, context);
            case 'groq':
                return await window.GroqAI.call(prompt, context);
            case 'chatgpt':
                return await window.ChatGPT.call(prompt, context);
            case 'perplexity':
                return await window.Perplexity.call(prompt, context);
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
    },

    /**
     * Check if error is a rate limit error
     */
    isRateLimitError(error) {
        const errorMsg = error.message || error.toString();
        return (
            errorMsg.includes('429') ||
            errorMsg.includes('rate limit') ||
            errorMsg.includes('quota') ||
            errorMsg.includes('RESOURCE_EXHAUSTED') ||
            errorMsg.includes('Resources exhausted')
        );
    },

    /**
     * Call AI with automatic fallback on rate limits (3-level retry)
     * Uses user-defined priority order from settings
     */
    async call(prompt, context = null) {
        const availableProviders = this.getAvailableProviders();
        
        if (availableProviders.length === 0) {
            throw new Error('No AI provider configured. Please add API keys in Settings.');
        }
        
        // Get user-defined priority order, filter to only include configured providers
        const priorityOrder = window.DB.settings.priorityOrder || ['gemini', 'groq', 'chatgpt', 'perplexity'];
        const providerOrder = priorityOrder.filter(p => availableProviders.includes(p));
        
        // Limit to 3 attempts
        const maxAttempts = Math.min(3, providerOrder.length);
        
        console.log(`🤖 AI Call - Available providers: ${availableProviders.join(', ')}`);
        console.log(`📋 Priority order (max ${maxAttempts} attempts): ${providerOrder.slice(0, maxAttempts).join(' → ')}`);
        
        let lastError = null;
        
        for (let i = 0; i < maxAttempts; i++) {
            const currentProvider = providerOrder[i];
            
            // Double-check: Skip if provider doesn't have API key (safety check)
            if (!availableProviders.includes(currentProvider)) {
                console.warn(`⚠️ Skipping ${currentProvider.toUpperCase()} - no API key configured`);
                continue;
            }
            
            try {
                console.log(`🔄 Attempt ${i + 1}/${maxAttempts}: Using ${currentProvider.toUpperCase()} (Priority #${i + 1})`);
                
                const result = await this.callProvider(currentProvider, prompt, context);
                
                // Success!
                if (i > 0) {
                    // Fallback was used
                    console.log(`✅ SUCCESS with fallback provider: ${currentProvider.toUpperCase()} (Priority #${i + 1})`);
                    if (window.Toast) {
                        window.Toast.show(`✅ Response via ${currentProvider.toUpperCase()}`, 'success');
                    }
                } else {
                    console.log(`✅ SUCCESS with primary provider: ${currentProvider.toUpperCase()} (Priority #1)`);
                    if (window.Toast) {
                        window.Toast.show(`🤖 Using ${currentProvider.toUpperCase()}`, 'info');
                    }
                }
                
                return result;
                
            } catch (error) {
                console.error(`❌ ${currentProvider.toUpperCase()} failed:`, error.message);
                lastError = error;
                
                // Check if it's a rate limit error
                if (this.isRateLimitError(error)) {
                    console.warn(`⚠️ Rate limit detected for ${currentProvider.toUpperCase()}`);
                    
                    // If not the last attempt, try next provider
                    if (i < maxAttempts - 1) {
                        const nextProvider = providerOrder[i + 1];
                        console.log(`🔀 Falling back to ${nextProvider.toUpperCase()} (Priority #${i + 2})...`);
                        
                        if (window.Toast) {
                            window.Toast.show(`⚠️ ${currentProvider} rate limit - trying ${nextProvider}...`, 'warning');
                        }
                        
                        // Continue to next iteration
                        continue;
                    }
                } else {
                    // Non-rate-limit error, don't retry
                    console.error(`💥 Non-rate-limit error, stopping retries`);
                    throw error;
                }
            }
        }
        
        // All attempts failed
        console.error('💥 All AI providers exhausted');
        throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
    },
    
    /**
     * Call AI specifically for web search tasks (card benefits, etc.)
     * Only uses providers with web search capabilities: Gemini (preferred) or Perplexity
     * 
     * @param {string} prompt - The search query
     * @param {object} context - Additional context (system instructions, etc.)
     * @returns {Promise<string>} - AI response
     */
    async callWithWebSearch(prompt, context = null) {
        const webSearchProviders = this.getWebSearchProviders();
        
        if (webSearchProviders.length === 0) {
            throw new Error('No web search capable AI provider configured. Please add Gemini or Perplexity API key in Settings.');
        }
        
        // Prefer Gemini (best for web search), then Perplexity
        const searchOrder = ['gemini', 'perplexity'].filter(p => webSearchProviders.includes(p));
        
        console.log(`🔍 Web Search - Using providers: ${searchOrder.join(' → ')}`);
        
        let lastError = null;
        
        for (let i = 0; i < searchOrder.length; i++) {
            const provider = searchOrder[i];
            
            try {
                console.log(`🔄 Web Search Attempt ${i + 1}/${searchOrder.length}: Using ${provider.toUpperCase()}`);
                
                const result = await this.callProvider(provider, prompt, context);
                
                console.log(`✅ Web Search SUCCESS with ${provider.toUpperCase()}`);
                
                // Show which AI is being used for web search
                if (window.Toast) {
                    window.Toast.show(`🔍 Fetching via ${provider.toUpperCase()} (web search)`, 'info');
                }
                
                return result;
                
            } catch (error) {
                console.error(`❌ Web Search with ${provider.toUpperCase()} failed:`, error.message);
                lastError = error;
                
                // If rate limit and not last attempt, try next provider
                if (this.isRateLimitError(error) && i < searchOrder.length - 1) {
                    const nextProvider = searchOrder[i + 1];
                    console.log(`🔀 Falling back to ${nextProvider.toUpperCase()}...`);
                    
                    if (window.Toast) {
                        window.Toast.show(`⚠️ ${provider} rate limit - trying ${nextProvider}...`, 'warning');
                    }
                    continue;
                }
                
                // Non-rate-limit error or last attempt
                throw error;
            }
        }
        
        // All attempts failed
        throw new Error(`Web search failed with all providers. Last error: ${lastError?.message || 'Unknown error'}`);
    },

    /**
     * Check if AI is configured
     */
    isConfigured() {
        return this.getAvailableProviders().length > 0;
    },

    /**
     * Prepare context for AI based on selected mode
     * @param {string} mode - 'general', 'cards', 'expenses', or 'investments'
     */
    prepareContext(mode = 'general') {
        switch(mode) {
            case 'general':
                return {
                    mode: 'general',
                    message: 'You are a helpful AI assistant. Answer any questions the user has.'
                };
                
            case 'cards':
                // Only include credit cards (not debit cards) for AI advisor
                const creditCards = window.DB.cards.filter(c => !c.cardType || c.cardType === 'credit');
                return {
                    mode: 'credit_cards',
                    available_cards: creditCards.map(c => ({
                        name: c.name,
                        benefits: c.benefits || 'Benefits not yet fetched',
                        benefitsFetchedAt: c.benefitsFetchedAt || null
                    }))
                };
                
            case 'expenses':
                return {
                    mode: 'expenses',
                    expenses: window.DB.expenses.map(e => ({
                        title: e.title,
                        description: e.description,
                        amount: e.amount,
                        category: e.category,
                        date: e.date,
                        createdAt: e.createdAt
                    })),
                    total: window.DB.expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
                };
                
            case 'investments':
                return {
                    mode: 'investments',
                    investments: window.DB.investments.map(inv => ({
                        name: inv.name,
                        type: inv.type,
                        amount: inv.amount,
                        term: inv.term,
                        inputStockPrice: inv.inputStockPrice,
                        inputCurrency: inv.inputCurrency,
                        quantity: inv.quantity,
                        createdAt: inv.createdAt,
                        lastUpdated: inv.lastUpdated
                    })),
                    total: window.DB.investments.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0),
                    exchangeRate: window.DB.exchangeRate?.rate || 83
                };
                
            default:
                return { mode: 'unknown' };
        }
    },

    /**
     * Get spending breakdown by category
     */
    getSpendingByCategory() {
        const categoryTotals = {};
        window.DB.expenses.forEach(e => {
            if (!categoryTotals[e.category]) {
                categoryTotals[e.category] = 0;
            }
            categoryTotals[e.category] += parseFloat(e.amount) || 0;
        });
        return categoryTotals;
    },

    /**
     * Get credit card recommendation for a specific spending
     * Uses pre-fetched benefits stored in database
     */
    async recommendCard(spendingDescription, amount, category) {
        const context = this.prepareContext();
        
        // Build card details with stored benefits
        let cardsInfo = 'MY CREDIT CARDS WITH BENEFITS:\n\n';
        context.available_cards.forEach((card, idx) => {
            cardsInfo += `${idx + 1}. **${card.name}**\n`;
            if (card.benefits && card.benefits !== 'Benefits not yet fetched') {
                cardsInfo += `${card.benefits}\n`;
                if (card.benefitsFetchedAt) {
                    cardsInfo += `   (Data from: ${new Date(card.benefitsFetchedAt).toLocaleDateString()})\n`;
                }
            } else {
                cardsInfo += `   ⚠️ Benefits not yet loaded for this card.\n`;
            }
            if (card.notes && card.notes !== 'No specific notes') {
                cardsInfo += `   Personal notes: ${card.notes}\n`;
            }
            cardsInfo += '\n';
        });
        
        const prompt = `I'm planning to spend ₹${amount} on "${spendingDescription}" (Category: ${category}).

${cardsInfo}

Based on the benefits data I have for each card, which card should I use for this specific spending?

Analyze:
1. **Reward points/cashback rate** for the "${category}" category
2. **Category-specific benefits** 
3. **Milestone benefits** if this spending helps reach them
4. **Exclusions or restrictions** that might apply
5. **Best value** for this transaction

Provide:
- ✅ **Recommended Card** with clear reasoning
- 💰 **Expected Rewards**: Estimated cashback/points value
- 📊 **Comparison**: Brief comparison with other cards (if applicable)
- ⚠️ **Important Notes**: Any conditions, exclusions, or tips

If benefits are not available for any card, mention that and provide general guidance.`;
        
        return await this.call(prompt, null);
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIProvider = AIProvider;
}

