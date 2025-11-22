/**
 * AI Provider Abstraction Layer
 * Unified interface for different AI providers
 */

const AIProvider = {
    // Flag to suppress Utils.showInfo messages (e.g., during progress modal operations)
    suppressInfoMessages: false,
    
    /**
     * Get system instruction based on context mode (used by all providers)
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
                return `You are an expert investment portfolio analyst and financial advisor. Analyze the investment data provided to answer user queries.

Your capabilities:
- Calculate total portfolio value and asset allocation percentages
- Analyze diversification across investment types (SHARES, GOLD, FD, EPF)
- Compare SHORT_TERM vs LONG_TERM allocation
- Identify portfolio gaps and missing asset classes
- Provide diversification recommendations based on risk profile and goals
- Track performance and suggest rebalancing strategies
- Consider USD to INR conversion rates provided

Investment Data Structure:
- All investments have an "amount" field in INR (Indian Rupees)
- For SHARES: amount = price × quantity (USD shares are converted to INR using exchange rate)
- For GOLD: amount = current gold rate per gram × quantity in grams
- For FD and EPF: amount is the direct deposit amount
- Use the "amount" field for all calculations and analysis

When providing recommendations:
- Be specific about percentages and amounts
- Explain rationale for diversification suggestions
- Consider Indian market context (equity, gold, fixed income, EPF)
- Mention risk-reward tradeoffs
- Suggest realistic action steps

Use Indian Rupee (₹) for all amounts.`;
                
            default:
                return 'You are a helpful financial assistant.';
        }
    },
    
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
                    if (window.Utils) {
                        window.Utils.showSuccess(`✅ Response via ${currentProvider.toUpperCase()}`);
                    }
                } else {
                    console.log(`✅ SUCCESS with primary provider: ${currentProvider.toUpperCase()} (Priority #1)`);
                    if (window.Utils && !this.suppressInfoMessages) {
                        window.Utils.showInfo(`🤖 Using ${currentProvider.toUpperCase()}`);
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
                        
                        if (window.Utils && !this.suppressInfoMessages) {
                            window.Utils.showInfo(`⚠️ ${currentProvider} rate limit - trying ${nextProvider}...`);
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
                if (window.Utils && !this.suppressInfoMessages) {
                    window.Utils.showInfo(`🔍 Fetching via ${provider.toUpperCase()} (web search)`);
                }
                
                return result;
                
            } catch (error) {
                console.error(`❌ Web Search with ${provider.toUpperCase()} failed:`, error.message);
                lastError = error;
                
                // If rate limit and not last attempt, try next provider
                if (this.isRateLimitError(error) && i < searchOrder.length - 1) {
                    const nextProvider = searchOrder[i + 1];
                    console.log(`🔀 Falling back to ${nextProvider.toUpperCase()}...`);
                    
                    if (window.Utils && !this.suppressInfoMessages) {
                        window.Utils.showInfo(`⚠️ ${provider} rate limit - trying ${nextProvider}...`);
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
     * @param {boolean} useMetadata - If true, return metadata instead of full data (for expenses/investments)
     */
    prepareContext(mode = 'general', useMetadata = false) {
        switch(mode) {
            case 'general':
                return {
                    mode: 'general',
                    message: 'You are a helpful AI assistant. Answer any questions the user has.'
                };
                
            case 'cards':
                // Cards mode always sends full data (it's already minimal)
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
                if (useMetadata) {
                    // Return metadata for two-phase query
                    return window.QueryEngine.generateExpensesMetadata();
                } else {
                    // Legacy: return full data
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
                }
                
            case 'investments':
                if (useMetadata) {
                    // Return metadata for two-phase query
                    return window.QueryEngine.generateInvestmentsMetadata();
                } else {
                    // Legacy: return full data (fallback)
                    const investments = window.DB.portfolioInvestments || [];
                    const exchangeRate = window.DB.exchangeRate?.rate || window.DB.exchangeRate || 83;
                    const goldRate = window.DB.goldRatePerGram || 7000;
                    const sharePrices = window.DB.sharePrices || [];
                    
                    // Calculate amount for each investment
                    const calculateAmount = (inv) => {
                        if (inv.type === 'SHARES') {
                            const sharePrice = sharePrices.find(sp => sp.name === inv.name && sp.active);
                            const price = sharePrice ? sharePrice.price : (inv.price || 0);
                            const currency = sharePrice ? sharePrice.currency : (inv.currency || 'INR');
                            const amount = price * (inv.quantity || 0);
                            return currency === 'USD' ? amount * exchangeRate : amount;
                        } else if (inv.type === 'GOLD') {
                            return goldRate * (inv.quantity || 0);
                        } else if (inv.type === 'EPF' || inv.type === 'FD') {
                            return parseFloat(inv.amount) || 0;
                        }
                        return 0;
                    };
                    
                    return {
                        mode: 'investments',
                        investments: investments.map(inv => {
                            const calculatedAmount = calculateAmount(inv);
                            return {
                                name: inv.name,
                                type: inv.type,
                                goal: inv.goal,
                                amount: calculatedAmount,
                                price: inv.price,
                                currency: inv.currency,
                                quantity: inv.quantity,
                                createdAt: inv.createdAt,
                                lastUpdated: inv.lastUpdated
                            };
                        }),
                        total: investments.reduce((sum, inv) => sum + calculateAmount(inv), 0),
                        exchangeRate: exchangeRate,
                        goldRate: goldRate
                    };
                }
                
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

