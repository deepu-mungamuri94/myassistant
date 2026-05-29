/**
 * AI Provider Abstraction Layer
 * Unified interface for different AI providers
 */

const AIProvider = {
    // Flag to suppress Utils.showInfo messages (e.g., during progress modal operations)
    suppressInfoMessages: false,
    
    /**
     * Compute the user's average monthly income from the last 6 months of
     * salary records (plus any additional income for those months). Returns 0
     * when there is no data — callers should treat 0 as "unknown".
     */
    getAvgMonthlyIncome() {
        const salaries = (window.DB && window.DB.salaries) || [];
        const additional = (window.DB && window.DB.additionalIncome) || [];
        if (salaries.length === 0) return 0;

        const today = new Date();
        const cutoff = new Date(today.getFullYear(), today.getMonth() - 6, 1);

        const recentSalaries = salaries.filter(s => {
            const d = new Date(s.year, (s.month || 1) - 1, 1);
            return d >= cutoff;
        });

        if (recentSalaries.length === 0) return 0;

        const salaryTotal = recentSalaries.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

        // Add additional income for the same months
        const additionalTotal = additional.reduce((sum, a) => {
            const d = new Date(a.year, (a.month || 1) - 1, 1);
            return d >= cutoff ? sum + (parseFloat(a.amount) || 0) : sum;
        }, 0);

        return Math.round((salaryTotal + additionalTotal) / recentSalaries.length);
    },

    /**
     * Snapshot of cross-cutting financial context that several modes benefit
     * from (income, active SIPs, planned future expenses). Returned object is
     * safe to embed in any context — fields default to sensible empties when
     * unavailable.
     */
    getFinancialSnapshot() {
        const avgMonthlyIncome = this.getAvgMonthlyIncome();

        const sips = ((window.DB && window.DB.sips) || []).filter(s => s.active !== false).map(s => ({
            name: s.name,
            amount: parseFloat(s.amount) || 0
        }));
        const sipsTotal = sips.reduce((sum, s) => sum + s.amount, 0);

        const plans = ((window.DB && window.DB.plans) || []).filter(p => p.status === 'pending').map(p => ({
            name: p.name,
            amount: parseFloat(p.amount) || 0,
            planByDate: p.planByDate || null
        }));
        const plansTotal = plans.reduce((sum, p) => sum + p.amount, 0);

        return {
            avgMonthlyIncome,
            activeSips: sips,
            sipsMonthlyTotal: sipsTotal,
            pendingPlans: plans,
            pendingPlansTotal: plansTotal
        };
    },

    /**
     * Build a "today" preamble used by every system prompt so the AI can
     * resolve relative time phrases ("last month", "this quarter") accurately.
     */
    getTodayPreamble() {
        const now = new Date();
        const iso = now.toISOString().split('T')[0];
        const monthName = now.toLocaleDateString('en-US', { month: 'long' });
        const year = now.getFullYear();
        const monthNum = now.getMonth() + 1;
        const quarter = Math.ceil(monthNum / 3);
        return `Today's date: ${iso} (${monthName} ${year}, Q${quarter}). Use this to interpret relative phrases like "last month", "this quarter", "next month".`;
    },

    /**
     * Get system instruction based on context mode (used by all providers)
     */
    getSystemInstruction(context) {
        const preamble = this.getTodayPreamble();

        if (!context || !context.mode) {
            return `You are a helpful financial assistant focused on Indian personal finance.\n\n${preamble}\n\nUse Indian Rupee (₹) for all amounts.`;
        }

        switch(context.mode) {
            case 'credit_cards':
                return `You are a credit card advisor. Use ONLY the stored benefit information provided. DO NOT search online.

${preamble}

CRITICAL INSTRUCTIONS FOR RESPONSES:
1. **Compare ALL cards** provided in the context
2. **Select TOP 3 cards** that offer the best benefits for the user's query
3. **Present ONLY these top 3 cards** with detailed benefits comparison
4. **Provide a final recommendation** at the end with ONE best card and clear reasoning

If the user mentions a transaction (e.g., "₹5000 on groceries"):
- Calculate **expected reward value in ₹** for each top-3 card (use the rate from benefits text)
- Mention any **monthly/quarterly caps** on rewards if visible in the benefits
- Mention **milestone proximity** if benefits text describes spend-based milestones
- If a card's benefits are not yet fetched, say so explicitly and skip — do not guess

If a card has "USER NOTES" attached, treat those as authoritative corrections/additions
that **override** the fetched benefits text on conflicts (the user knows their card better).
Cite user notes briefly when they affect the recommendation (e.g., "Per your note: 5% on Amazon").

RESPONSE FORMAT:
- Start with: "📊 **TOP 3 CARDS COMPARISON**"
- For each of the top 3 cards:
  - Card name
  - Key benefits relevant to the query
  - Reward rate/cashback for the specific category
  - Expected reward value in ₹ for this transaction (if amount given)
  - Any caps, exclusions, or milestone notes from the benefits text
- End with: "✅ **FINAL RECOMMENDATION**" followed by:
  - The single best card to use
  - Clear reasoning why this card is best
  - Expected value/rewards for this transaction

Focus on: reward rates, category-specific benefits, cashback, milestone bonuses.
Never ask for or reference sensitive information like card numbers or CVV.
DO NOT list all cards - only show the top 3 with comparison and final recommendation.
Use Indian Rupee (₹) for all amounts.`;

            case 'expenses':
                return `You are an expense analysis expert for Indian personal finance.

${preamble}

Your capabilities:
- Calculate totals, averages, and counts
- Group by categories, months, years, or events
- Identify spending patterns and compare time periods
- **Search text fields (title, description) for keywords using .toLowerCase().includes()**
- Filter by payment methods (credit cards), events, or need/want classification
- Analyze spending by specific merchants, brands, or product types

When users ask about specific items (e.g., "pharmacy expenses", "baby products", "BigBasket orders", "restaurant bills"):
→ Search the TITLE and DESCRIPTION fields for those keywords
→ Use case-insensitive text search: e.title.toLowerCase().includes('keyword')
→ Extract keywords from natural language queries
→ Note: many expenses have empty description — title is the primary search field

If average monthly income is provided in the context, use it to give percentage insights:
e.g., "Restaurants ₹6,000/mo = 12% of your income"

If the query returns ZERO results, do not invent numbers. Say clearly:
"No matching expenses found." Then suggest 2-3 alternative search keywords or date ranges.

Provide insights with specific numbers, dates, and trends.
Use Indian Rupee (₹) for all amounts.`;

            case 'investments':
                return `You are an expert investment portfolio analyst for Indian personal finance.

${preamble}

Your capabilities:
- Calculate total portfolio value and asset allocation percentages
- Analyze diversification across investment types (SHARES, GOLD, FD, EPF)
- Compare SHORT_TERM vs LONG_TERM allocation
- Identify portfolio gaps and missing asset classes
- Provide diversification recommendations based on risk profile and goals
- Track performance and suggest rebalancing strategies
- Consider USD to INR conversion rates provided
- **Search text fields (name, description) for keywords using .toLowerCase().includes()**
- Filter by specific companies, stocks, banks, or sectors

Investment Data Structure:
- All investments have an "amount" field in INR (Indian Rupees), pre-converted from USD where applicable
- For SHARES: amount = price × quantity (USD shares converted to INR using the provided exchange rate)
- For GOLD: amount = current gold rate per gram × quantity in grams
- For FD and EPF: amount is the direct deposit amount
- Use the "amount" field for all calculations — do not re-convert

When users ask about specific companies, sectors, or banks (e.g., "Apple stock", "ICICI FD", "tech stocks"):
→ Search the NAME and DESCRIPTION fields for those keywords
→ Use case-insensitive text search: i.name.toLowerCase().includes('keyword')
→ Extract keywords from natural language queries

If the context includes income, monthly SIPs, or planned future expenses, use them to give grounded advice:
- "Your active SIPs total ₹X/month — that's Y% of your income"
- "Planned items totaling ₹X may need liquid funds — ensure FD ladder/cash buffer"
- Recommend specific monthly investment amounts as a percentage of income

If the query returns ZERO results, do not invent. Say "No matching investments found" and suggest alternatives.

When providing recommendations:
- Be specific about percentages and amounts
- Explain rationale for diversification suggestions
- Consider Indian market context (equity, gold, fixed income, EPF)
- Mention risk-reward tradeoffs
- Suggest realistic action steps

Use Indian Rupee (₹) for all amounts.`;

            case 'general':
                return `You are a knowledgeable personal finance assistant focused on Indian context (taxation, investments, banking, RBI rules, NPS/PPF/EPF, mutual funds, real estate).

${preamble}

Capabilities:
- Answer general financial questions, do calculations, explain concepts
- Compare investment options (SIP vs lumpsum, FD vs debt fund, ELSS vs PPF, etc.)
- Tax planning under both Old and New regimes (Indian)
- Compound interest, EMI math, retirement planning estimates
- Currency conversions, inflation-adjusted returns

Style:
- Be concise and direct. Use bullet points for comparisons.
- Use Indian Rupee (₹) and Indian numbering (lakh/crore) by default.
- For specific tax/legal questions, add a brief disclaimer: "This is general guidance, not professional tax advice."
- Show your math when calculating (so the user can verify).
- If you're not sure about a specific Indian regulation, say so rather than guessing.`;

            default:
                return `You are a helpful financial assistant.\n\n${preamble}\n\nUse Indian Rupee (₹) for all amounts.`;
        }
    },
    
    /**
     * Format a context object as compact plain text (mode-aware) instead of
     * pretty-printed JSON. Used by Groq / ChatGPT / Perplexity providers to
     * keep token usage bounded — pretty JSON adds ~30% bloat.
     */
    formatContextText(ctx) {
        // Build a compact "USER PROFILE" block from the cross-cutting snapshot
        // when one is attached. Sent before the mode-specific data so the AI
        // can ground percentage/ratio reasoning.
        const snapshotBlock = (snap) => {
            if (!snap) return '';
            const lines = ['USER PROFILE:'];
            if (snap.avgMonthlyIncome > 0) {
                lines.push(`  Avg monthly income (last 6 months): ₹${snap.avgMonthlyIncome.toLocaleString()}`);
            }
            if (snap.sipsMonthlyTotal > 0) {
                lines.push(`  Active SIPs: ${snap.activeSips.length} totaling ₹${snap.sipsMonthlyTotal.toLocaleString()}/month`);
            }
            if (snap.pendingPlansTotal > 0) {
                lines.push(`  Pending planned expenses: ${snap.pendingPlans.length} totaling ₹${snap.pendingPlansTotal.toLocaleString()}`);
            }
            return lines.length > 1 ? lines.join('\n') + '\n\n' : '';
        };

        try {
            const mode = ctx && ctx.mode;
            const snap = snapshotBlock(ctx && ctx.snapshot);

            if (mode === 'credit_cards' && Array.isArray(ctx.available_cards)) {
                const lines = [`MY CREDIT CARDS (${ctx.available_cards.length}):`];
                ctx.available_cards.forEach((c, i) => {
                    lines.push(`\n${i + 1}. ${c.name}`);
                    if (c.benefits && c.benefits !== 'Benefits not yet fetched') {
                        lines.push(c.benefits);
                    } else {
                        lines.push('   (benefits not yet fetched)');
                    }
                    if (c.userNotes) {
                        lines.push(`   USER NOTES (treat as authoritative override): ${c.userNotes}`);
                    }
                });
                return lines.join('\n');
            }
            if (mode === 'expenses' && Array.isArray(ctx.expenses)) {
                const head = `EXPENSES (${ctx.expenses.length} items, total ₹${(ctx.total || 0).toFixed(2)})`;
                const rows = ctx.expenses.map(e =>
                    `${e.date || ''} | ${e.category || ''} | ${e.title || ''} | ₹${e.amount}`
                );
                return `${snap}${head}\n${rows.join('\n')}`;
            }
            if (mode === 'investments' && Array.isArray(ctx.investments)) {
                const head = `INVESTMENTS (${ctx.investments.length} items, total ₹${(ctx.total || 0).toFixed(2)}, USD/INR ${ctx.exchangeRate})`;
                const rows = ctx.investments.map(inv =>
                    `${inv.type || ''} | ${inv.name || ''} | goal=${inv.goal || ''} | ₹${Math.round(inv.amount || 0)}`
                );
                return `${snap}${head}\n${rows.join('\n')}`;
            }
            if (mode === 'general') {
                return `${snap}${ctx.message || 'General assistant.'}`;
            }
        } catch (e) {
            // fall through
        }
        try {
            return JSON.stringify(ctx);
        } catch (e) {
            return String(ctx);
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
     * Check if error is a rate limit / capacity error that warrants falling back
     * to another provider. Includes per-minute token (TPM) over-limit errors,
     * which Groq returns as "Request too large for the model ... tokens per minute"
     * even though the HTTP status may not be 429.
     */
    isRateLimitError(error) {
        const errorMsg = (error.message || error.toString() || '').toLowerCase();
        return (
            errorMsg.includes('429') ||
            errorMsg.includes('rate limit') ||
            errorMsg.includes('rate_limit') ||
            errorMsg.includes('quota') ||
            errorMsg.includes('resource_exhausted') ||
            errorMsg.includes('resources exhausted') ||
            errorMsg.includes('request too large') ||
            errorMsg.includes('tokens per minute') ||
            errorMsg.includes('tpm') ||
            errorMsg.includes('context window') ||
            errorMsg.includes('context_length_exceeded') ||
            errorMsg.includes('too many tokens')
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
        const snapshot = this.getFinancialSnapshot();

        switch(mode) {
            case 'general':
                return {
                    mode: 'general',
                    message: 'You are a helpful AI assistant. Answer any questions the user has.',
                    snapshot
                };

            case 'cards':
                // Cards mode - ONLY sends non-sensitive data
                // SECURITY: Sensitive fields are EXCLUDED: cardNumber, CVV, expiry, creditLimit, outstanding, statementDate, billDate, emis
                const creditCards = window.DB.cards.filter(c => !c.cardType || c.cardType === 'credit');
                // Per-card benefits cap to keep total prompt within small-context model limits.
                // 3000 chars ≈ 750 tokens per card. The fetch prompt asks for very comprehensive
                // benefits (often 2.5–4K chars) — capping too aggressively was dropping caps,
                // exclusions, and milestone info that the AI Advisor needs for accurate
                // recommendations. With 10 cards this is ~7.5K tokens of benefits, still well
                // under typical 12K-32K small-context model limits.
                const MAX_BENEFITS_CHARS = 3000;
                return {
                    mode: 'credit_cards',
                    available_cards: creditCards.map(c => {
                        const raw = c.benefits || 'Benefits not yet fetched';
                        const trimmed = (typeof raw === 'string' && raw.length > MAX_BENEFITS_CHARS)
                            ? raw.slice(0, MAX_BENEFITS_CHARS) + '\n…[truncated]'
                            : raw;
                        // User-entered notes/corrections override or supplement
                        // the fetched benefits (e.g., "5% on Amazon, lounge waived above ₹5L spend").
                        const userNotes = (c.additionalData || '').trim();
                        return {
                            name: c.name,
                            benefits: trimmed,
                            benefitsFetchedAt: c.benefitsFetchedAt || null,
                            userNotes: userNotes || null
                        };
                    })
                };

            case 'expenses':
                if (useMetadata) {
                    // Return metadata for two-phase query
                    const meta = window.QueryEngine.generateExpensesMetadata();
                    meta.snapshot = snapshot;
                    return meta;
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
                        total: window.DB.expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
                        snapshot
                    };
                }

            case 'investments':
                if (useMetadata) {
                    // Return metadata for two-phase query
                    const meta = window.QueryEngine.generateInvestmentsMetadata();
                    meta.snapshot = snapshot;
                    return meta;
                } else {
                    // Legacy: return full data (fallback)
                    const investments = window.DB.portfolioInvestments || [];
                    // Rates are stored as { rate, updatedAt } — get the numeric rate safely
                    const exchangeRate = (window.Investments && window.Investments.getExchangeRate)
                        ? window.Investments.getExchangeRate()
                        : (typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : (window.DB.exchangeRate?.rate || 89));
                    const goldRate = (window.Investments && window.Investments.getGoldRate)
                        ? window.Investments.getGoldRate()
                        : (typeof window.DB.goldRatePerGram === 'number' ? window.DB.goldRatePerGram : (window.DB.goldRatePerGram?.rate || 10000));
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
                        goldRate: goldRate,
                        snapshot
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
        // NOTE: Only non-sensitive data is included (name, benefits, benefitsFetchedAt)
        // Sensitive data (cardNumber, CVV, expiry, creditLimit, outstanding, etc.) is NEVER sent to AI
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
            cardsInfo += '\n';
        });
        
        const prompt = `I'm planning to spend ₹${amount} on "${spendingDescription}" (Category: ${category}).

${cardsInfo}

Based on the benefits data I have for each card, compare ALL cards and provide:

📊 **TOP 3 CARDS COMPARISON**
- Compare all cards and select the top 3 that offer the best benefits for this spending
- For each of the top 3 cards, show:
  1. Card name
  2. Reward points/cashback rate for "${category}" category
  3. Category-specific benefits
  4. Milestone benefits if this spending helps reach them
  5. Expected rewards value for ₹${amount}
  6. Any exclusions or restrictions

✅ **FINAL RECOMMENDATION**
- The single best card to use for this transaction
- Clear reasoning why this card is best
- Expected cashback/points value
- Any important conditions, exclusions, or tips

If benefits are not available for any card, mention that and provide general guidance.
DO NOT list all cards - only show the top 3 with comparison and final recommendation.`;
        
        return await this.call(prompt, null);
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIProvider = AIProvider;
}

