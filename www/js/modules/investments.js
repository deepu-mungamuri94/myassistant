/**
 * Investments Module
 * Handles investment portfolio management
 */

const Investments = {
    /**
     * Add a new investment
     */
    add(name, amount, term, type = 'general', quantity = null, notes = '', stockPrice = null, inputCurrency = 'INR', usdToInrRate = null) {
        if (!name || !amount || !term) {
            throw new Error('Please fill in all required fields');
        }
        
        if (!['long', 'short'].includes(term.toLowerCase())) {
            throw new Error('Term must be either "Long" or "Short"');
        }
        
        const investment = {
            id: Utils.generateId(),
            name,
            type, // 'stock', 'mutual_fund', 'fd', 'epf', 'gold', 'general'
            amount: parseFloat(amount), // Always in INR
            term: term.toLowerCase(),
            quantity: quantity ? parseFloat(quantity) : null,
            // For stocks entered manually
            inputStockPrice: stockPrice ? parseFloat(stockPrice) : null, // Original price entered
            inputCurrency: inputCurrency || 'INR', // Currency of manually entered price
            usdToInrRate: usdToInrRate ? parseFloat(usdToInrRate) : null, // Conversion rate used
            // For fetched stock prices
            currentPrice: null, // Will be fetched from AI
            currency: null, // Currency from AI fetch
            exchange: null,
            symbol: null,
            lastPriceUpdate: null, // Timestamp of last AI fetch
            tickerSymbol: null, // Will be resolved once and stored for fast price fetching
            notes,
            createdAt: Utils.getCurrentTimestamp(),
            lastUpdated: Utils.getCurrentTimestamp()
        };
        
        window.DB.investments.push(investment);
        window.Storage.save();
        
        // Stock prices will be fetched when user clicks refresh button
        return investment;
    },

    /**
     * Update an existing investment
     */
    update(id, name, amount, term, type = 'general', quantity = null, notes = '', stockPrice = null, inputCurrency = 'INR', usdToInrRate = null) {
        if (!name || !amount || !term) {
            throw new Error('Please fill in all required fields');
        }
        
        if (!['long', 'short'].includes(term.toLowerCase())) {
            throw new Error('Term must be either "Long" or "Short"');
        }
        
        const investment = this.getById(id);
        if (!investment) {
            throw new Error('Investment not found');
        }
        
        // Update fields
        investment.name = name;
        investment.type = type;
        investment.amount = parseFloat(amount);
        investment.term = term.toLowerCase();
        investment.quantity = quantity ? parseFloat(quantity) : null;
        investment.inputStockPrice = stockPrice ? parseFloat(stockPrice) : null;
        investment.inputCurrency = inputCurrency || 'INR';
        investment.usdToInrRate = usdToInrRate ? parseFloat(usdToInrRate) : null;
        investment.notes = notes;
        investment.lastUpdated = Utils.getCurrentTimestamp();
        
        window.Storage.save();
        return investment;
    },

    /**
     * Resolve missing ticker symbols using AI (single API call for all stocks)
     */
    async resolveMissingTickers() {
        const stocks = window.DB.investments.filter(inv => inv.type === 'stock');
        const stocksNeedingTickers = stocks.filter(s => !s.tickerSymbol);
        
        if (stocksNeedingTickers.length === 0) {
            console.log('✅ All stocks have ticker symbols');
            return;
        }
        
        try {
            if (!window.AIProvider || !window.AIProvider.isConfigured()) {
                console.warn('⚠️ AI not configured, skipping ticker resolution');
                return;
            }
            
            console.log(`🔍 Resolving tickers for ${stocksNeedingTickers.length} stocks using AI...`);
            
            const stockList = stocksNeedingTickers.map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
            
            const systemPrompt = `You are a stock market expert. Your task is to identify the correct ticker symbols for stock names.

CRITICAL INSTRUCTIONS:
1. For each stock name provided, return its ticker symbol
2. For Indian stocks: use .NS (NSE) or .BO (BSE) suffix (prefer NSE)
3. For US stocks: use the standard ticker (e.g., AAPL, MSFT, CRM)
4. Return ONLY a JSON array with this EXACT structure:
[
  {"name": "Stock Name from list", "ticker": "TICKER_SYMBOL"},
  ...
]
5. If unsure, make your best guess based on the name
6. NO explanations, NO markdown code blocks, ONLY the raw JSON array`;

            const userQuery = `Identify ticker symbols for these ${stocksNeedingTickers.length} stocks:

${stockList}

Return tickers for ALL stocks in a JSON array.`;

            const response = await window.AIProvider.call(userQuery, { system_instruction: systemPrompt });
            
            // Parse AI response
            let tickersData;
            try {
                const jsonMatch = response.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    tickersData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON array found in response');
                }
            } catch (parseError) {
                console.error('Failed to parse tickers data:', parseError);
                return;
            }
            
            // Update stocks with ticker symbols
            let resolvedCount = 0;
            tickersData.forEach(data => {
                const stock = stocksNeedingTickers.find(s => 
                    s.name.toLowerCase().includes(data.name.toLowerCase()) ||
                    data.name.toLowerCase().includes(s.name.toLowerCase())
                );
                
                if (stock && data.ticker) {
                    stock.tickerSymbol = data.ticker;
                    resolvedCount++;
                    console.log(`✅ Resolved: ${stock.name} → ${data.ticker}`);
                }
            });
            
            if (resolvedCount > 0) {
                window.Storage.save();
                console.log(`✅ Resolved ${resolvedCount} ticker symbols`);
            }
            
        } catch (error) {
            console.error('Failed to resolve tickers:', error);
        }
    },

    /**
     * Refresh stock prices for all stocks (uses stored tickers for speed)
     */
    async refreshAllStockPrices() {
        const stocks = window.DB.investments.filter(inv => inv.type === 'stock');
        
        if (stocks.length === 0) {
            if (window.Toast) {
                window.Toast.info('No stocks to update');
            }
            return;
        }
        
        try {
            // Show loading overlay to prevent multiple calls
            if (window.Loading) {
                window.Loading.show(`Fetching prices for ${stocks.length} stock${stocks.length > 1 ? 's' : ''}...`);
            }

            // Check if StockAPI is loaded
            if (!window.StockAPI) {
                throw new Error('Stock API not loaded. Please refresh the page.');
            }

            // First, resolve any missing ticker symbols using AI
            await this.resolveMissingTickers();

            // Use stored ticker symbols for faster, more reliable fetching
            const pricesData = await window.StockAPI.fetchAllPricesWithTickers(stocks);
            
            console.log(`📊 Received ${pricesData.length} price results for ${stocks.length} stocks`);
            
            // Update all investments with fetched prices
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < pricesData.length; i++) {
                const priceData = pricesData[i];
                console.log(`\n🔄 Processing result ${i + 1}/${pricesData.length}:`, priceData.name, priceData.error ? 'ERROR' : `$${priceData.price || priceData.price === 0 ? priceData.price : 'N/A'}`);
                
                if (priceData.error) {
                    console.warn(`❌ Stock not found: ${priceData.name}`, priceData.error);
                    errorCount++;
                    continue;
                }
                
                // Find matching stock by name (case-insensitive partial match)
                const stock = stocks.find(s => 
                    s.name.toLowerCase().includes(priceData.name.toLowerCase()) ||
                    priceData.name.toLowerCase().includes(s.name.toLowerCase())
                );
                
                console.log(`🔍 Matching "${priceData.name}" with stocks:`, stocks.map(s => s.name).join(', '));
                console.log(`✓ Found match:`, stock ? stock.name : 'NONE');
                
                if (stock && priceData.price !== undefined && priceData.price !== null) {
                    // Store ticker symbol for future use (if not already stored)
                    if (priceData.symbol && !stock.tickerSymbol) {
                        stock.tickerSymbol = priceData.symbol;
                    }
                    
                    // Update the input price (this is the source of truth)
                    stock.inputStockPrice = parseFloat(priceData.price);
                    stock.inputCurrency = priceData.currency;
                    
                    // Mark as just updated (for blinking animation)
                    stock.justUpdated = true;
                    
                    // Recalculate amount with proper currency conversion
                    if (priceData.currency === 'USD') {
                        // Get exchange rate from global DB setting
                        const exchangeRate = window.DB.exchangeRate?.rate || 83;
                        
                        if (!window.DB.exchangeRate || !window.DB.exchangeRate.rate) {
                            console.warn(`⚠️ USD to INR rate not set. Using default ₹${exchangeRate}. Go to Investments → Exchange Rate to set your rate.`);
                        }
                        
                        // USD stock: convert to INR and calculate amount
                        stock.usdToInrRate = exchangeRate;
                        const priceInINR = parseFloat(priceData.price) * stock.usdToInrRate;
                        stock.amount = priceInINR * (stock.quantity || 1);
                        console.log(`✅ Updated ${stock.name}: $${priceData.price} × ₹${stock.usdToInrRate} = ₹${priceInINR.toFixed(2)} × ${stock.quantity} = ₹${stock.amount.toFixed(2)}`);
                    } else {
                        // INR stock: direct calculation
                        stock.amount = parseFloat(priceData.price) * (stock.quantity || 1);
                        console.log(`✅ Updated ${stock.name}: ₹${priceData.price} × ${stock.quantity} = ₹${stock.amount.toFixed(2)}`);
                    }
                    
                    stock.lastUpdated = Utils.getCurrentTimestamp();
                    successCount++;
                    console.log(`✅ Success! Updated ${stock.name}`);
                } else {
                    errorCount++;
                    console.warn(`❌ Could not match or invalid price: ${priceData.name}`, { stock: stock?.name, price: priceData.price });
                }
            }
            
            // Save all updates
            window.Storage.save();
            
            // Refresh UI
            this.render();
            
            // Clear justUpdated flag after animation
            setTimeout(() => {
                stocks.forEach(stock => {
                    if (stock.justUpdated) {
                        delete stock.justUpdated;
                    }
                });
                window.Storage.save();
            }, 2000);
            
            // Hide loading overlay
            if (window.Loading) {
                window.Loading.hide();
            }
            
            // Show result
            if (window.Toast) {
                if (successCount > 0) {
                    window.Toast.success(`✅ Updated ${successCount} stock price${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
                } else {
                    window.Toast.error('Failed to update stock prices');
                }
            }
        } catch (error) {
            console.error('Failed to fetch stock prices:', error);
            if (window.Loading) window.Loading.hide();
            
            if (window.Toast) {
                window.Toast.error('Failed to fetch stock prices: ' + error.message);
            }
        }
    },

    /**
     * Calculate investment value
     * Always use 'amount' as the source of truth (already calculated with proper conversions)
     */
    calculateValue(investment) {
        return parseFloat(investment.amount) || 0;
    },

    /**
     * Delete an investment
     */
    delete(id) {
        window.DB.investments = window.DB.investments.filter(i => i.id !== id);
        window.Storage.save();
    },

    /**
     * Get all investments
     */
    getAll() {
        return window.DB.investments;
    },

    /**
     * Get investment by ID
     */
    getById(id) {
        // Handle both string and number IDs
        return window.DB.investments.find(i => i.id == id || String(i.id) === String(id));
    },

    /**
     * Get investments by term
     */
    getByTerm(term) {
        return window.DB.investments.filter(i => i.term === term.toLowerCase());
    },

    /**
     * Get investments by type
     */
    getByType(type) {
        return window.DB.investments.filter(i => i.type === type);
    },

    /**
     * Calculate total portfolio value
     */
    getTotalValue() {
        return window.DB.investments.reduce((sum, inv) => {
            return sum + this.calculateValue(inv);
        }, 0);
    },

    /**
     * Get investment types
     */
    getTypes() {
        return [
            { value: 'stock', label: 'Stock' },
            { value: 'mutual_fund', label: 'Mutual Fund' },
            { value: 'fd', label: 'Fixed Deposit' },
            { value: 'gold', label: 'Gold' },
            { value: 'real_estate', label: 'Real Estate' },
            { value: 'crypto', label: 'Cryptocurrency' },
            { value: 'general', label: 'General' }
        ];
    },

    /**
     * Render investments list
     */
    render() {
        const list = document.getElementById('investments-list');
        
        if (!list) return;
        
        if (window.DB.investments.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No investments yet. Add your first one above!</p>';
            return;
        }
        
        // Get filter and search values
        const filterEl = document.getElementById('investments-filter');
        const searchEl = document.getElementById('investments-search');
        const filterType = filterEl ? filterEl.value : 'all';
        const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
        
        // Filter investments
        let filtered = window.DB.investments;
        
        if (filterType !== 'all') {
            filtered = filtered.filter(inv => inv.type === filterType);
        }
        
        if (searchTerm) {
            filtered = filtered.filter(inv => 
                inv.name.toLowerCase().includes(searchTerm) ||
                (inv.notes && inv.notes.toLowerCase().includes(searchTerm)) ||
                (inv.type && inv.type.toLowerCase().includes(searchTerm)) ||
                (inv.symbol && inv.symbol.toLowerCase().includes(searchTerm))
            );
        }
        
        if (filtered.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No investments found matching your criteria.</p>';
            return;
        }
        
        // Calculate totals for filtered list
        const total = filtered.reduce((sum, inv) => sum + this.calculateValue(inv), 0);
        const longTerm = filtered.filter(i => i.term === 'long');
        const shortTerm = filtered.filter(i => i.term === 'short');
        
        // Check if there are any stocks
        const hasStocks = filtered.some(inv => inv.type === 'stock');
        
        // Calculate sums for each term
        const longTermSum = longTerm.reduce((sum, inv) => sum + this.calculateValue(inv), 0);
        const shortTermSum = shortTerm.reduce((sum, inv) => sum + this.calculateValue(inv), 0);
        
        // Build grouped investments HTML
        const shortTermHTML = this.renderGroupedInvestments(shortTerm);
        const longTermHTML = this.renderGroupedInvestments(longTerm);
        
        list.innerHTML = `
            <div class="bg-gradient-to-r from-yellow-100 via-orange-50 to-yellow-100 rounded-xl border-2 border-yellow-400 mb-4 overflow-hidden">
                <div class="p-5">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-bold text-yellow-900 text-base">💰 Portfolio Total</h3>
                        <p class="text-base font-bold text-yellow-800">${Utils.formatCurrency(total)}</p>
                    </div>
                    ${hasStocks ? `
                        <div class="flex justify-center gap-3 pt-3 border-t border-yellow-300">
                            <button onclick="Investments.refreshAllStockPrices()" 
                                    class="flex-1 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-lg transition-all duration-200 text-xs font-semibold flex items-center justify-center gap-2"
                                    title="Refresh all stock prices">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                </svg>
                                <span>Refresh Stocks</span>
                            </button>
                            <button onclick="openExchangeRateModal()" 
                                    id="update-rate-btn"
                                    class="flex-1 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition-all duration-200 text-xs font-semibold flex items-center justify-center gap-2"
                                    title="Update USD to INR exchange rate">
                                <span>💱</span>
                                <span>₹${(window.DB.exchangeRate && window.DB.exchangeRate.rate) ? window.DB.exchangeRate.rate.toFixed(2) : '83'}/USD</span>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Tabs for Short Term / Long Term -->
            ${(shortTerm.length > 0 || longTerm.length > 0) ? `
                <div class="bg-white rounded-xl border-2 border-blue-200 overflow-hidden">
                    <!-- Tabs -->
                    <div class="border-b border-blue-200">
                        <div class="flex justify-evenly">
                            ${shortTerm.length > 0 ? `
                                <button onclick="Investments.switchInvestmentTab('short')" 
                                        id="investments-tab-short"
                                        class="flex-1 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 border-blue-500 text-blue-600"
                                        title="Investments held for less than 3 years">
                                    <div class="flex items-center justify-center gap-1.5">
                                        <span>Short Term (${shortTerm.length})</span>
                                        <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold">i</span>
                                    </div>
                                    <div class="text-xs font-bold mt-1">${Utils.formatCurrency(shortTermSum)}</div>
                                </button>
                            ` : ''}
                            ${longTerm.length > 0 ? `
                                <button onclick="Investments.switchInvestmentTab('long')" 
                                        id="investments-tab-long"
                                        class="flex-1 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700"
                                        title="Investments held for more than 3 years">
                                    <div class="flex items-center justify-center gap-1.5">
                                        <span>Long Term (${longTerm.length})</span>
                                        <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-500 text-white text-[10px] font-bold">i</span>
                                    </div>
                                    <div class="text-xs font-bold mt-1">${Utils.formatCurrency(longTermSum)}</div>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Tab Content: Short Term -->
                    ${shortTerm.length > 0 ? `
                        <div id="investments-content-short" class="p-3">
                            ${shortTermHTML}
                        </div>
                    ` : ''}
                    
                    <!-- Tab Content: Long Term -->
                    ${longTerm.length > 0 ? `
                        <div id="investments-content-long" class="p-3 hidden">
                            ${longTermHTML}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        `;
    },
    
    /**
     * Switch between Short Term and Long Term tabs
     */
    switchInvestmentTab(tab) {
        // Update tab buttons
        const shortBtn = document.getElementById('investments-tab-short');
        const longBtn = document.getElementById('investments-tab-long');
        const shortContent = document.getElementById('investments-content-short');
        const longContent = document.getElementById('investments-content-long');
        
        if (tab === 'short') {
            if (shortBtn) {
                shortBtn.className = 'flex-1 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 border-blue-500 text-blue-600';
            }
            if (longBtn) {
                longBtn.className = 'flex-1 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
            if (shortContent) shortContent.classList.remove('hidden');
            if (longContent) longContent.classList.add('hidden');
        } else if (tab === 'long') {
            if (shortBtn) {
                shortBtn.className = 'flex-1 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
            if (longBtn) {
                longBtn.className = 'flex-1 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 border-green-500 text-green-600';
            }
            if (shortContent) shortContent.classList.add('hidden');
            if (longContent) longContent.classList.remove('hidden');
        }
    },
    
    /**
     * Render investments grouped by type
     */
    renderGroupedInvestments(investments) {
        if (!investments || investments.length === 0) {
            return '<p class="text-gray-500 text-center py-4">No investments in this category.</p>';
        }
        
        // Group investments by type
        const grouped = {};
        investments.forEach(inv => {
            const type = inv.type || 'general';
            if (!grouped[type]) {
                grouped[type] = [];
            }
            grouped[type].push(inv);
        });
        
        // Type names and color schemes map
        const typeConfig = {
            'stock': {
                name: '📈 Stocks',
                borderColor: 'border-blue-300',
                bgGradient: 'from-blue-100 to-blue-50',
                hoverGradient: 'hover:from-blue-200 hover:to-blue-100',
                textColor: 'text-blue-900',
                bgColor: 'bg-blue-50'
            },
            'mutual_fund': {
                name: '📊 Mutual Funds',
                borderColor: 'border-purple-300',
                bgGradient: 'from-purple-100 to-purple-50',
                hoverGradient: 'hover:from-purple-200 hover:to-purple-100',
                textColor: 'text-purple-900',
                bgColor: 'bg-purple-50'
            },
            'fd': {
                name: '🏦 Fixed Deposits',
                borderColor: 'border-green-300',
                bgGradient: 'from-green-100 to-green-50',
                hoverGradient: 'hover:from-green-200 hover:to-green-100',
                textColor: 'text-green-900',
                bgColor: 'bg-green-50'
            },
            'epf': {
                name: '💼 EPF',
                borderColor: 'border-indigo-300',
                bgGradient: 'from-indigo-100 to-indigo-50',
                hoverGradient: 'hover:from-indigo-200 hover:to-indigo-100',
                textColor: 'text-indigo-900',
                bgColor: 'bg-indigo-50'
            },
            'gold': {
                name: '🪙 Gold',
                borderColor: 'border-yellow-300',
                bgGradient: 'from-yellow-100 to-yellow-50',
                hoverGradient: 'hover:from-yellow-200 hover:to-yellow-100',
                textColor: 'text-yellow-900',
                bgColor: 'bg-yellow-50'
            },
            'general': {
                name: '💰 General',
                borderColor: 'border-gray-300',
                bgGradient: 'from-gray-100 to-gray-50',
                hoverGradient: 'hover:from-gray-200 hover:to-gray-100',
                textColor: 'text-gray-900',
                bgColor: 'bg-gray-50'
            }
        };
        
        // Render each group as collapsible (collapsed by default)
        return Object.entries(grouped).map(([type, items]) => {
            const config = typeConfig[type] || typeConfig['general'];
            const total = items.reduce((sum, inv) => sum + this.calculateValue(inv), 0);
            
            return `
                <details class="investment-type-group mb-3 border-2 ${config.borderColor} rounded-lg overflow-hidden">
                    <summary class="bg-gradient-to-r ${config.bgGradient} px-3 py-3 cursor-pointer ${config.hoverGradient} transition-all list-none">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 transition-transform details-arrow ${config.textColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <span class="font-semibold ${config.textColor} text-sm">${config.name}</span>
                                <span class="text-xs ${config.textColor} opacity-60">(${items.length})</span>
                            </div>
                            <span class="font-bold ${config.textColor}">${Utils.formatCurrency(total)}</span>
                        </div>
                    </summary>
                    <div class="space-y-2 ${config.bgColor} p-2">
                        ${this.renderInvestmentCards(items)}
                    </div>
                </details>
            `;
        }).join('');
    },
    
    /**
     * Render investment cards
     */
    renderInvestmentCards(investments) {
        return investments.map(inv => {
            const value = this.calculateValue(inv);
            const isStock = inv.type === 'stock';
            const displayCurrency = inv.inputCurrency || 'INR';
            const currencySymbol = displayCurrency === 'USD' ? '$' : '₹';
            
            return `
                <div class="p-3 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-all ${inv.justUpdated ? 'price-blink' : ''}">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-gray-800 text-sm">${Utils.escapeHtml(inv.name)}</h4>
                                <span class="text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded capitalize">${inv.type.replace('_', ' ')}</span>
                            </div>
                            
                            ${isStock ? `
                                <!-- Stock details -->
                                <div class="mt-2 space-y-1">
                                    <div class="flex items-center gap-2">
                                        <p class="text-xs text-gray-600">Price: ${currencySymbol}${parseFloat(inv.inputStockPrice || 0).toLocaleString()}</p>
                                        <button onclick="Investments.refreshSingleStock(${inv.id})" class="text-green-500 hover:text-green-700" title="Fetch live price">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                            </svg>
                                        </button>
                                        <button onclick="openEditStockPriceModal(${inv.id})" class="text-blue-500 hover:text-blue-700" title="Edit price manually">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                            </svg>
                                        </button>
                                    </div>
                                    ${inv.quantity ? `<p class="text-xs text-gray-600">Quantity: ${inv.quantity}</p>` : ''}
                                </div>
                            ` : ''}
                            
                            ${inv.notes ? `<p class="text-xs text-gray-500 mt-2">${Utils.escapeHtml(inv.notes)}</p>` : ''}
                        </div>
                        
                        <!-- Actions + Amount -->
                        <div class="flex flex-col items-end ml-2">
                            <div class="flex gap-2 mb-2">
                                <button onclick="openInvestmentEditModal(${inv.id})" class="text-green-600 hover:text-green-800" title="Edit">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                    </svg>
                                </button>
                                <button onclick="Investments.deleteWithConfirm(${inv.id})" class="text-red-500 hover:text-red-700" title="Delete">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                    </svg>
                                </button>
                            </div>
                            <p class="text-base font-bold text-yellow-700">${Utils.formatCurrency(value)}</p>
                            ${isStock && displayCurrency === 'USD' && inv.usdToInrRate ? `
                                <p class="text-xs text-gray-500 mt-0.5">($${((inv.inputStockPrice || 0) * (inv.quantity || 1)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</p>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Edit stock price manually (called from modal)
     */
    async editStockPrice(id, newPrice, currency, quantity) {
        const inv = this.getById(id);
        if (!inv || inv.type !== 'stock') {
            throw new Error('Stock not found');
        }
        
        // Update stock details
        inv.inputStockPrice = newPrice;
        inv.inputCurrency = currency;
        inv.quantity = quantity;
        
        // Recalculate amount with proper currency conversion
        if (currency === 'USD') {
            // Get exchange rate from global DB setting
            const exchangeRate = window.DB.exchangeRate?.rate || 83;
            
            if (!window.DB.exchangeRate || !window.DB.exchangeRate.rate) {
                console.warn(`⚠️ USD to INR rate not set. Using default ₹${exchangeRate}. Go to Investments → Exchange Rate to set your rate.`);
            }
            
            // USD stock: convert to INR and calculate amount
            inv.usdToInrRate = exchangeRate;
            const priceInINR = newPrice * exchangeRate;
            inv.amount = priceInINR * quantity;
            console.log(`✅ Updated ${inv.name}: $${newPrice} × ₹${exchangeRate} = ₹${priceInINR.toFixed(2)} × ${quantity} = ₹${inv.amount.toFixed(2)}`);
        } else {
            // INR stock: direct calculation
            inv.amount = newPrice * quantity;
            console.log(`✅ Updated ${inv.name}: ₹${newPrice} × ${quantity} = ₹${inv.amount.toFixed(2)}`);
        }
        
        inv.lastUpdated = Utils.getCurrentTimestamp();
        window.Storage.save();
        this.render();
    },
    
    /**
     * Refresh price for a single stock
     */
    async refreshSingleStock(id) {
        const stock = this.getById(id);
        if (!stock || stock.type !== 'stock') return;
        
        try {
            if (window.Loading) {
                window.Loading.show(`Fetching price for ${stock.name}...`);
            }
            
            // Check if StockAPI is loaded
            if (!window.StockAPI) {
                throw new Error('Stock API not loaded. Please refresh the page.');
            }
            
            // Resolve ticker if missing
            if (!stock.tickerSymbol) {
                await this.resolveMissingTickers();
            }
            
            // Fetch price for this single stock
            console.log(`\n📊 Fetching price for: ${stock.name} ${stock.tickerSymbol ? `(${stock.tickerSymbol})` : ''}`);
            const priceData = stock.tickerSymbol 
                ? await window.StockAPI.fetchByTicker(stock.tickerSymbol, stock.name)
                : await window.StockAPI.fetchStockPrice(stock.name);
            
            if (priceData.error) {
                console.warn(`Stock not found: ${stock.name}`, priceData.error);
                if (window.Toast) {
                    window.Toast.error(`Failed to fetch price for ${stock.name}`);
                }
                if (window.Loading) window.Loading.hide();
                return;
            }
            
            // Update the stock with new price
            stock.inputStockPrice = parseFloat(priceData.price);
            stock.inputCurrency = priceData.currency;
            
            // Mark as just updated (for blinking animation)
            stock.justUpdated = true;
            
            // Recalculate amount with proper currency conversion
            if (priceData.currency === 'USD') {
                const exchangeRate = window.DB.exchangeRate?.rate || 83;
                
                if (!window.DB.exchangeRate || !window.DB.exchangeRate.rate) {
                    console.warn(`⚠️ USD to INR rate not set. Using default ₹${exchangeRate}. Go to Investments → Update Rate to set your rate.`);
                }
                
                stock.usdToInrRate = exchangeRate;
                const priceInINR = parseFloat(priceData.price) * stock.usdToInrRate;
                stock.amount = priceInINR * (stock.quantity || 1);
                console.log(`✅ Updated ${stock.name}: $${priceData.price} × ₹${stock.usdToInrRate} = ₹${priceInINR.toFixed(2)} × ${stock.quantity} = ₹${stock.amount.toFixed(2)}`);
            } else {
                stock.amount = parseFloat(priceData.price) * (stock.quantity || 1);
                console.log(`✅ Updated ${stock.name}: ₹${priceData.price} × ${stock.quantity} = ₹${stock.amount.toFixed(2)}`);
            }
            
            stock.lastUpdated = Utils.getCurrentTimestamp();
            
            // Save and refresh UI
            window.Storage.save();
            this.render();
            
            // Clear justUpdated flag after animation
            setTimeout(() => {
                delete stock.justUpdated;
                window.Storage.save();
            }, 2000);
            
            if (window.Loading) {
                window.Loading.hide();
            }
            
            if (window.Toast) {
                window.Toast.success(`✅ ${stock.name} price updated!`);
            }
            
        } catch (error) {
            console.error('Failed to fetch stock price:', error);
            if (window.Loading) window.Loading.hide();
            
            if (window.Toast) {
                window.Toast.error('Failed to fetch stock price: ' + error.message);
            }
        }
    },
    
    /**
     * Recalculate all USD stocks based on new exchange rate
     */
    recalculateUSDStocks(newRate) {
        const usdStocks = window.DB.investments.filter(inv => 
            inv.type === 'stock' && inv.inputCurrency === 'USD'
        );
        
        if (usdStocks.length === 0) return 0;
        
        usdStocks.forEach(inv => {
            inv.usdToInrRate = newRate;
            const priceInINR = inv.inputStockPrice * newRate;
            inv.amount = priceInINR * (inv.quantity || 1);
        });
        
        window.Storage.save();
        return usdStocks.length;
    },

    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this investment. Are you sure?',
            'Delete Investment'
        );
        if (!confirmed) return;
        
        this.delete(id);
        this.render();
        if (window.Toast) {
            window.Toast.success('Investment deleted');
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Investments = Investments;
}
