/**
 * Stock Price API Integration
 * Multi-source approach: Yahoo Finance, Finnhub, Alpha Vantage
 * Uses Capacitor HTTP plugin to bypass CORS
 */

const StockAPI = {
    // API Keys (optional, but recommended for better reliability)
    // Get free keys from:
    // Finnhub: https://finnhub.io/register (60 requests/minute)
    // Alpha Vantage: https://www.alphavantage.co/support/#api-key (500 requests/day)
    FINNHUB_API_KEY: 'sandbox', // Free sandbox for testing
    ALPHA_VANTAGE_API_KEY: 'demo', // Demo key (limited)
    /**
     * HTTP fetch wrapper with timeout
     */
    async httpGet(url, timeoutMs = 8000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            // Try Capacitor HTTP plugin first (bypasses CORS)
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Http) {
                const response = await window.Capacitor.Plugins.Http.get({ 
                    url,
                    readTimeout: timeoutMs,
                    connectTimeout: timeoutMs
                });
                clearTimeout(timeoutId);
                return response.data;
            }
        } catch (e) {
            console.log('Capacitor HTTP not available, trying direct fetch');
        }
        
        // Try direct fetch with timeout
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            // If CORS error in browser, use CORS proxy as last resort (development only)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('⚠️ Browser CORS detected, using proxy (development only)');
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(`Proxy failed: ${response.status}`);
                }
                return await response.json();
            }
            throw fetchError;
        }
    },
    
    /**
     * Fetch stock price with PARALLEL API calls (race condition - fastest wins!)
     */
    async fetchStockPrice(stockName) {
        console.log(`📊 Fetching price for: ${stockName} (trying all APIs in parallel...)`);
        
        // Create all API requests in parallel
        const apiPromises = [];
        
        // 1. Yahoo Finance (with common ticker mapping)
        apiPromises.push(
            (async () => {
                try {
                    const commonTicker = this.getCommonTicker(stockName);
                    if (commonTicker) {
                        const ticker = await this.tryDirectTicker(commonTicker);
                        if (ticker) {
                            const price = await this.getPrice(ticker);
                            return {
                                name: stockName,
                                symbol: ticker.symbol,
                                price: price.regularMarketPrice,
                                currency: ticker.currency,
                                exchange: ticker.exchange,
                                source: 'Yahoo Finance',
                                lastUpdated: Utils.formatLocalDateTime(new Date())
                            };
                        }
                    }
                    
                    const ticker = await this.searchTicker(stockName);
                    if (ticker) {
                        const price = await this.getPrice(ticker);
                        return {
                            name: stockName,
                            symbol: ticker.symbol,
                            price: price.regularMarketPrice,
                            currency: ticker.currency,
                            exchange: ticker.exchange,
                            source: 'Yahoo Finance',
                            lastUpdated: Utils.formatLocalDateTime(new Date())
                        };
                    }
                    throw new Error('No data');
                } catch (e) {
                    console.log(`❌ Yahoo: ${e.message}`);
                    throw e;
                }
            })()
        );
        
        // 2. Finnhub (mainly US stocks)
        apiPromises.push(
            this.fetchFromFinnhub(stockName).catch(e => {
                console.log(`❌ Finnhub: ${e.message}`);
                throw e;
            })
        );
        
        // 3. Alpha Vantage (global stocks)
        apiPromises.push(
            this.fetchFromAlphaVantage(stockName).catch(e => {
                console.log(`❌ Alpha Vantage: ${e.message}`);
                throw e;
            })
        );
        
        // Race condition - return the first successful result
        try {
            const result = await Promise.race(
                apiPromises.map(p => 
                    p.then(data => {
                        if (data && !data.error && data.price) {
                            return data;
                        }
                        throw new Error('Invalid data');
                    })
                )
            );
            
            console.log(`✅ Got price from ${result.source || result.exchange}: ${result.price}`);
            return result;
            
        } catch (raceError) {
            // If race fails, wait for all to complete and return first successful one
            console.warn('⚠️ Race failed, waiting for any API to succeed...');
            
            const results = await Promise.allSettled(apiPromises);
            const successful = results.find(r => 
                r.status === 'fulfilled' && 
                r.value && 
                !r.value.error && 
                r.value.price
            );
            
            if (successful) {
                console.log(`✅ Got price from ${successful.value.source || successful.value.exchange}: ${successful.value.price}`);
                return successful.value;
            }
            
            console.error(`❌ All APIs failed for ${stockName}`);
            return { 
                error: 'All APIs failed. Please try again later or check stock symbol.', 
                name: stockName 
            };
        }
    },
    
    /**
     * Fetch from Finnhub API (US stocks mainly)
     */
    async fetchFromFinnhub(stockName) {
        try {
            // Get ticker symbol
            const ticker = this.getCommonTicker(stockName) || stockName;
            const cleanTicker = ticker.replace('.NS', '').replace('.BO', '');
            
            const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(cleanTicker)}&token=${this.FINNHUB_API_KEY}`;
            const data = await this.httpGet(url);
            
            if (!data.c || data.c === 0) {
                return { error: 'No price data', name: stockName };
            }
            
            return {
                name: stockName,
                symbol: cleanTicker,
                price: data.c, // Current price
                currency: 'USD',
                exchange: 'Finnhub',
                lastUpdated: Utils.formatLocalDateTime(new Date())
            };
        } catch (error) {
            console.error('Finnhub fetch failed:', error);
            throw error;
        }
    },
    
    /**
     * Fetch from Alpha Vantage API (Global stocks)
     */
    async fetchFromAlphaVantage(stockName) {
        try {
            // Get ticker symbol
            const ticker = this.getCommonTicker(stockName) || stockName;
            const cleanTicker = ticker.replace('.NS', '').replace('.BO', '');
            
            const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(cleanTicker)}&apikey=${this.ALPHA_VANTAGE_API_KEY}`;
            const data = await this.httpGet(url);
            
            if (!data['Global Quote'] || !data['Global Quote']['05. price']) {
                return { error: 'No price data', name: stockName };
            }
            
            const quote = data['Global Quote'];
            
            return {
                name: stockName,
                symbol: quote['01. symbol'],
                price: parseFloat(quote['05. price']),
                currency: 'USD',
                exchange: 'Alpha Vantage',
                lastUpdated: Utils.formatLocalDateTime(new Date())
            };
        } catch (error) {
            console.error('Alpha Vantage fetch failed:', error);
            throw error;
        }
    },
    
    /**
     * Search for ticker symbol with fallback strategies
     */
    async searchTicker(stockName) {
        try {
            // Strategy 1: Try direct search
            const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(stockName)}&quotesCount=5&newsCount=0`;
            
            const data = await this.httpGet(searchUrl);
            console.log(`🔍 Search results for "${stockName}":`, data);
            
            if (data.quotes && data.quotes.length > 0) {
                // Filter for stocks only (ignore ETFs, mutual funds, etc.)
                const stockQuotes = data.quotes.filter(q => 
                    q.quoteType === 'EQUITY' || 
                    q.typeDisp === 'Equity' ||
                    !q.quoteType // If no type, assume it's a stock
                );
                
                if (stockQuotes.length > 0) {
                    const quote = stockQuotes[0];
                    console.log(`✅ Found ticker: ${quote.symbol} (${quote.longname || quote.shortname})`);
                    
                    return {
                        symbol: quote.symbol,
                        name: quote.longname || quote.shortname || stockName,
                        exchange: quote.exchange,
                        currency: this.getCurrency(quote.exchange)
                    };
                }
            }
            
            // Strategy 2: If name search failed, try assuming it's already a ticker symbol
            console.log(`⚠️ No results for "${stockName}", trying as direct ticker...`);
            return await this.tryDirectTicker(stockName);
            
        } catch (error) {
            console.error('Ticker search failed:', error);
            
            // Strategy 3: Last resort - try as direct ticker
            try {
                return await this.tryDirectTicker(stockName);
            } catch (e) {
                return null;
            }
        }
    },
    
    /**
     * Try fetching price directly using the name as ticker symbol
     */
    async tryDirectTicker(tickerSymbol) {
        try {
            // Try common suffixes for Indian stocks
            const variations = [
                tickerSymbol,
                `${tickerSymbol}.NS`,  // NSE
                `${tickerSymbol}.BO`   // BSE
            ];
            
            for (const symbol of variations) {
                try {
                    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
                    const data = await this.httpGet(quoteUrl);
                    
                    if (data.chart && data.chart.result && data.chart.result.length > 0) {
                        const result = data.chart.result[0];
                        const meta = result.meta;
                        
                        console.log(`✅ Direct ticker "${symbol}" found!`);
                        
                        return {
                            symbol: symbol,
                            name: meta.longName || meta.shortName || symbol,
                            exchange: meta.exchangeName || (symbol.includes('.NS') ? 'NSE' : symbol.includes('.BO') ? 'BSE' : 'Unknown'),
                            currency: this.getCurrency(meta.exchangeName || '')
                        };
                    }
                } catch (e) {
                    // Try next variation
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Direct ticker lookup failed:', error);
            return null;
        }
    },
    
    /**
     * Get real-time price
     */
    async getPrice(ticker) {
        try {
            const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.symbol)}?interval=1d&range=1d`;
            
            const data = await this.httpGet(quoteUrl);
            
            // Validate response
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                console.error('Invalid price data:', data);
                throw new Error('No price data in response');
            }
            
            const result = data.chart.result[0];
            const meta = result.meta;
            
            // Check if market price is available
            if (!meta.regularMarketPrice && !meta.previousClose) {
                console.error('No market price found:', meta);
                throw new Error('Market price not available');
            }
            
            return {
                regularMarketPrice: meta.regularMarketPrice || meta.previousClose,
                previousClose: meta.previousClose,
                currency: meta.currency
            };
        } catch (error) {
            console.error(`❌ Price fetch failed for ${ticker.symbol}:`, error.message);
            throw error;
        }
    },
    
    /**
     * Get currency based on exchange
     */
    getCurrency(exchange) {
        const indianExchanges = ['NSE', 'BSE', 'NSI', 'BOM'];
        return indianExchanges.includes(exchange) ? 'INR' : 'USD';
    },
    
    /**
     * Fetch all stock prices using stored ticker symbols (much faster!)
     */
    async fetchAllPricesWithTickers(stocks) {
        const results = [];
        
        for (const stock of stocks) {
            console.log(`\n📊 Fetching price for: ${stock.name} ${stock.tickerSymbol ? `(${stock.tickerSymbol})` : ''}`);
            
            let result;
            if (stock.tickerSymbol) {
                // Use stored ticker - direct and fast!
                result = await this.fetchByTicker(stock.tickerSymbol, stock.name);
            } else {
                // Fallback to search (slower)
                result = await this.fetchStockPrice(stock.name);
            }
            
            results.push(result);
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        console.log(`\n✅ Fetched ${results.filter(r => !r.error).length}/${stocks.length} stock prices`);
        return results;
    },
    
    /**
     * Fetch price directly by ticker symbol (fastest method)
     */
    async fetchByTicker(ticker, stockName) {
        console.log(`🎯 Direct ticker fetch: ${ticker}`);
        
        // Try Yahoo Finance first (most reliable for known tickers)
        try {
            const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
            const data = await this.httpGet(quoteUrl);
            
            if (data.chart && data.chart.result && data.chart.result.length > 0) {
                const result = data.chart.result[0];
                const meta = result.meta;
                
                const price = meta.regularMarketPrice || meta.previousClose;
                if (price) {
                    return {
                        name: stockName,
                        symbol: ticker,
                        price: price,
                        currency: this.getCurrency(meta.exchangeName || ticker),
                        exchange: meta.exchangeName || (ticker.includes('.NS') ? 'NSE' : ticker.includes('.BO') ? 'BSE' : 'Unknown'),
                        lastUpdated: Utils.formatLocalDateTime(new Date())
                    };
                }
            }
        } catch (yahooError) {
            console.warn(`Yahoo failed for ${ticker}, trying alternatives...`);
        }
        
        // Fallback: Try Finnhub
        try {
            const cleanTicker = ticker.replace('.NS', '').replace('.BO', '');
            const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(cleanTicker)}&token=${this.FINNHUB_API_KEY}`;
            const data = await this.httpGet(url);
            
            if (data.c && data.c > 0) {
                return {
                    name: stockName,
                    symbol: ticker,
                    price: data.c,
                    currency: 'USD',
                    exchange: 'Finnhub',
                    lastUpdated: Utils.formatLocalDateTime(new Date())
                };
            }
        } catch (e) {
            console.warn(`Finnhub failed for ${ticker}`);
        }
        
        return { error: 'Failed to fetch price', name: stockName };
    },
    
    /**
     * Fetch all stock prices (batch) - legacy method
     */
    async fetchAllPrices(stocks) {
        const results = [];
        
        for (const stock of stocks) {
            console.log(`\n📊 Fetching price for: ${stock.name}`);
            const result = await this.fetchStockPrice(stock.name);
            results.push(result);
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`\n✅ Fetched ${results.filter(r => !r.error).length}/${stocks.length} stock prices`);
        return results;
    },
    
    /**
     * Common stock ticker mappings (for quick lookup)
     */
    getCommonTicker(stockName) {
        const mappings = {
            'salesforce': 'CRM',
            'apple': 'AAPL',
            'google': 'GOOGL',
            'microsoft': 'MSFT',
            'amazon': 'AMZN',
            'tesla': 'TSLA',
            'meta': 'META',
            'facebook': 'META',
            'netflix': 'NFLX',
            'nvidia': 'NVDA',
            'reliance': 'RELIANCE.NS',
            'tcs': 'TCS.NS',
            'infosys': 'INFY.NS',
            'wipro': 'WIPRO.NS',
            'hdfc bank': 'HDFCBANK.NS',
            'icici bank': 'ICICIBANK.NS',
            'sbi': 'SBIN.NS'
        };
        
        const key = stockName.toLowerCase().trim();
        return mappings[key] || null;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.StockAPI = StockAPI;
}

