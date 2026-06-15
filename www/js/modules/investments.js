/**
 * Investments Module
 * Handles investment portfolio and monthly investment tracking
 */

const Investments = {
    expandedTypes: new Set(), // Track expanded type groups in portfolio
    expandedMonths: new Set(), // Track expanded months in monthly investments
    expandedYears: new Set(), // Track expanded years in monthly investments
    expandedMonthlyTypes: new Set(), // Track expanded type groups within monthly investments
    currentPortfolioTab: 'short', // 'short' or 'long'
    currentMonthlyTab: 'short', // 'short' or 'long' for monthly investments
    portfolioBodyVisible: false, // Track portfolio section visibility (default collapsed)
    dateFilter: 'thisMonth', // 'thisMonth', 'last6Months', 'thisYear', 'custom', 'allTime'
    customDateRange: { start: null, end: null },
    searchQuery: '',
    editingInvestment: null, // Store the investment being edited
    pendingInvestmentData: null, // Store pending investment data for override/add operations

    // Days after which a manually-set rate is considered stale
    RATE_STALE_DAYS: 7,

    // Tracks in-flight share price reloads (per share name) so duplicate clicks
    // don't spawn parallel Yahoo Finance calls for the same ticker.
    _sharePriceReloadsInFlight: new Set(),

    /**
     * Initialize the module
     */
    init() {
        // -------- Exchange rate (USD → INR) --------
        // Stored as { rate, updatedAt } so we can show staleness. Migrate from
        // legacy plain-number form on first load. Default is a realistic 2026
        // value (89) — user can correct via the Refresh / manual entry flow.
        const xr = window.DB.exchangeRate;
        if (xr === undefined || xr === null) {
            window.DB.exchangeRate = { rate: 89, updatedAt: null };
        } else if (typeof xr === 'number') {
            window.DB.exchangeRate = { rate: xr, updatedAt: null };
        } else if (typeof xr === 'object') {
            // Already object form — fill missing fields
            if (typeof xr.rate !== 'number' || xr.rate <= 0) xr.rate = 89;
            if (xr.updatedAt === undefined) xr.updatedAt = null;
        }

        // -------- Gold rate (₹/gram) --------
        // Stored as { rate, updatedAt, purity } where purity is '22K' or '24K'.
        // Indian personal finance default is 22K (jewellery / coins from local
        // jewellers); 24K is for bullion / ETF holders. Defaulting first-run
        // users to 22K matches typical consumer gold ownership in India.
        // Default rate ~9000 reflects realistic 2026 22K street price.
        const gr = window.DB.goldRatePerGram;
        if (gr === undefined || gr === null) {
            window.DB.goldRatePerGram = { rate: 9000, updatedAt: null, purity: '22K' };
        } else if (typeof gr === 'number') {
            // Legacy primitive form had no purity; assume 22K (common case)
            window.DB.goldRatePerGram = { rate: gr, updatedAt: null, purity: '22K' };
        } else if (typeof gr === 'object') {
            if (typeof gr.rate !== 'number' || gr.rate <= 0) gr.rate = 9000;
            if (gr.updatedAt === undefined) gr.updatedAt = null;
            if (!gr.purity) gr.purity = '22K';
        }

        if (!window.DB.portfolioInvestments) {
            window.DB.portfolioInvestments = [];
        }
        if (!window.DB.monthlyInvestments) {
            window.DB.monthlyInvestments = [];
        }
        if (!window.DB.sharePrices) {
            window.DB.sharePrices = [];
        }
        
        // Initialize current month as expanded by default
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
        this.expandedMonths.add(currentMonthKey);
        
        // Also expand all type groups within current month by default
        ['EPF', 'FD', 'GOLD', 'SHARES', 'MF'].forEach(type => {
            this.expandedMonthlyTypes.add(`${currentMonthKey}-${type}`);
        });
        
        window.Storage.save();

        // Setup click listener to hide name suggestions when clicking outside
        document.addEventListener('click', (e) => {
            const suggestionsDiv = document.getElementById('investment-name-suggestions');
            const nameInput = document.getElementById('investment-name');
            if (suggestionsDiv && nameInput && 
                !suggestionsDiv.contains(e.target) && 
                e.target !== nameInput) {
                this.hideNameSuggestions();
            }
        });
    },

    /**
     * Get exchange rate as a plain number. Handles legacy plain-number form
     * AND the new {rate, updatedAt} form so older callers keep working.
     */
    getExchangeRate() {
        const xr = window.DB.exchangeRate;
        if (xr && typeof xr === 'object') return parseFloat(xr.rate) || 89;
        return typeof xr === 'number' ? xr : 89;
    },

    /**
     * Get gold rate as a plain number. Handles legacy plain-number form
     * AND the new {rate, updatedAt, purity} form.
     */
    getGoldRate() {
        const gr = window.DB.goldRatePerGram;
        if (gr && typeof gr === 'object') return parseFloat(gr.rate) || 9000;
        return typeof gr === 'number' ? gr : 9000;
    },

    /**
     * Compute freshness for any rate stored as {updatedAt: ISO string} or as a
     * legacy primitive (in which case it's "Not fetched"). Returns the same
     * shape used elsewhere in the app so the UI can render a consistent pill.
     */
    getRateFreshness(rateObj) {
        const updatedAt = rateObj && typeof rateObj === 'object' ? rateObj.updatedAt : null;
        if (!updatedAt) {
            return { hasData: false, ageDays: 0, isStale: true, label: 'Never updated' };
        }
        const ageMs = Date.now() - new Date(updatedAt).getTime();
        const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
        const isStale = ageDays > this.RATE_STALE_DAYS;
        let label;
        if (ageDays === 0) {
            const hours = Math.floor(ageMs / (1000 * 60 * 60));
            label = hours < 1 ? 'Just now' : `${hours}h ago`;
        } else if (ageDays === 1) label = 'Yesterday';
        else if (ageDays < 30) label = `${ageDays}d ago`;
        else if (ageDays < 365) label = `${Math.floor(ageDays / 30)} mo ago`;
        else label = `${Math.floor(ageDays / 365)}y+ ago`;
        return { hasData: true, ageDays, isStale, label };
    },

    /**
     * Set the exchange rate and bump the timestamp atomically.
     */
    setExchangeRate(rate) {
        const r = parseFloat(rate);
        if (!r || r <= 0) throw new Error('Invalid exchange rate');
        if (!window.DB.exchangeRate || typeof window.DB.exchangeRate !== 'object') {
            window.DB.exchangeRate = { rate: r, updatedAt: new Date().toISOString() };
        } else {
            window.DB.exchangeRate.rate = r;
            window.DB.exchangeRate.updatedAt = new Date().toISOString();
        }
        window.Storage.save();
    },

    /**
     * Set the gold rate and bump the timestamp atomically.
     */
    setGoldRate(rate, purity) {
        const r = parseFloat(rate);
        if (!r || r <= 0) throw new Error('Invalid gold rate');
        if (!window.DB.goldRatePerGram || typeof window.DB.goldRatePerGram !== 'object') {
            window.DB.goldRatePerGram = {
                rate: Math.round(r * 100) / 100,
                updatedAt: new Date().toISOString(),
                purity: purity || '22K'
            };
        } else {
            window.DB.goldRatePerGram.rate = Math.round(r * 100) / 100;
            window.DB.goldRatePerGram.updatedAt = new Date().toISOString();
            if (purity) window.DB.goldRatePerGram.purity = purity;
        }
        window.Storage.save();
    },
    
    /**
     * Suggest income month based on investment date and pay schedule
     * If pay schedule is 'last_week' and investment day >= 25, suggest next month
     * @param {string} investmentDate - Investment date string (YYYY-MM-DD)
     * @returns {Object} { month: number (1-12), year: number }
     */
    suggestIncomeMonth(investmentDate) {
        const date = new Date(investmentDate);
        const paySchedule = window.DB.settings?.paySchedule || 'first_week';
        
        let incomeMonth = date.getMonth() + 1; // 1-12
        let incomeYear = date.getFullYear();
        
        // If pay schedule is 'last_week' and day >= 25, suggest next month
        if (paySchedule === 'last_week' && date.getDate() >= 25) {
            incomeMonth++;
            if (incomeMonth > 12) {
                incomeMonth = 1;
                incomeYear++;
            }
        }
        
        return { month: incomeMonth, year: incomeYear };
    },
    
    /**
     * Update income month suggestion when investment date changes
     */
    updateIncomeSuggestion() {
        const dateInput = document.getElementById('investment-date');
        const incomeMonthSelect = document.getElementById('investment-income-month');
        const incomeYearInput = document.getElementById('investment-income-year');
        const suggestionHint = document.getElementById('income-month-hint');
        
        if (!dateInput || !incomeMonthSelect || !incomeYearInput) return;
        
        const investmentDate = dateInput.value;
        if (!investmentDate) return;
        
        const suggestion = this.suggestIncomeMonth(investmentDate);
        incomeMonthSelect.value = suggestion.month;
        incomeYearInput.value = suggestion.year;
        
        // Update hint
        if (suggestionHint) {
            const paySchedule = window.DB.settings?.paySchedule || 'first_week';
            const date = new Date(investmentDate);
            if (paySchedule === 'last_week' && date.getDate() >= 25) {
                suggestionHint.textContent = '(Next month: salary already credited)';
                suggestionHint.classList.remove('hidden');
            } else {
                suggestionHint.classList.add('hidden');
            }
        }
    },

    /**
     * Render the investments page
     */
    render() {
        this.renderPortfolioSection();
        if (window.Sips) {
            window.Sips.init();
            window.Sips.render();
        }
        this.renderMonthlySection();
    },

    /**
     * Render the portfolio section
     */
    renderPortfolioSection() {
        const container = document.getElementById('investments-portfolio-section');
        if (!container) return;

        const portfolioData = window.DB.portfolioInvestments || [];
        const exchangeRate = this.getExchangeRate();
        const goldRate = this.getGoldRate();
        const sharePrices = window.DB.sharePrices || [];

        // Calculate total value in INR
        let totalValue = 0;
        portfolioData.forEach(inv => {
            totalValue += this.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);
        });

        // Separate by term
        const shortTerm = portfolioData.filter(inv => inv.goal === 'SHORT_TERM');
        const longTerm = portfolioData.filter(inv => inv.goal === 'LONG_TERM');

        // Calculate term totals
        let shortTermTotal = 0;
        shortTerm.forEach(inv => {
            shortTermTotal += this.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);
        });

        let longTermTotal = 0;
        longTerm.forEach(inv => {
            longTermTotal += this.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);
        });

        const currentGoldRate = goldRate ? `₹${Utils.formatIndianNumber(goldRate)}/gm` : 'Set Rate';
        const currentExchangeRate = exchangeRate ? `$1 = ₹${exchangeRate.toFixed(2)}` : 'Set Rate';

        // Compute freshness for each rate so we can show a small dot pill on the buttons
        const xrFreshness = this.getRateFreshness(window.DB.exchangeRate);
        const goldFreshness = this.getRateFreshness(window.DB.goldRatePerGram);
        // Share-price freshness = max age across active shares
        const activeShares = (window.DB.sharePrices || []).filter(s => s.active && s.lastUpdated);
        const oldestShareAgeDays = activeShares.length === 0
            ? null
            : Math.max(...activeShares.map(s => Math.floor((Date.now() - new Date(s.lastUpdated).getTime()) / (1000 * 60 * 60 * 24))));
        const stocksStale = oldestShareAgeDays === null || oldestShareAgeDays > this.RATE_STALE_DAYS;

        // Tiny absolute-positioned freshness dot — anchors to top-right of the
        // button without consuming inline space (so the label stays on one line).
        const dot = (stale, hasData) => {
            const color = !hasData ? 'bg-red-400' : (stale ? 'bg-amber-400' : 'bg-green-400');
            return `<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${color}"></span>`;
        };

        // Use persistent state for portfolio body visibility
        const isBodyVisible = this.portfolioBodyVisible;

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md overflow-hidden">
                <!-- Header (clickable to expand/collapse) -->
                <div class="bg-gradient-to-r from-yellow-600 to-orange-600 text-white p-4 ${isBodyVisible ? 'rounded-t-xl' : 'rounded-xl'} cursor-pointer" onclick="Investments.togglePortfolioBody()">
                    <div class="flex justify-between items-center mb-3">
                        <div class="flex items-center gap-2">
                            <svg class="w-5 h-5 transition-transform duration-200 ${isBodyVisible ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                            <h3 class="text-lg font-bold">Portfolio</h3>
                        </div>
                        <p class="text-2xl font-bold">₹${Utils.formatIndianNumber(Math.round(totalValue))}</p>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <button onclick="event.stopPropagation(); Investments.openSharePriceModal()"
                                title="${oldestShareAgeDays === null ? 'No share prices yet' : `Oldest share price: ${oldestShareAgeDays}d ago`}"
                                class="relative p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap">
                            ${dot(stocksStale, oldestShareAgeDays !== null)}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            Stocks
                        </button>
                        <button onclick="event.stopPropagation(); Investments.openExchangeRateModal()"
                                title="${xrFreshness.hasData ? `Updated ${xrFreshness.label}${xrFreshness.isStale ? ' — stale' : ''}` : 'Never updated'}"
                                class="relative p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap">
                            ${dot(xrFreshness.isStale, xrFreshness.hasData)}
                            <span class="text-base">💲</span>
                            ${currentExchangeRate}
                        </button>
                        <button onclick="event.stopPropagation(); Investments.openGoldRateModal()"
                                title="${goldFreshness.hasData ? `Updated ${goldFreshness.label}${goldFreshness.isStale ? ' — stale' : ''}` : 'Never updated'}"
                                class="relative p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap">
                            ${dot(goldFreshness.isStale, goldFreshness.hasData)}
                            <span class="text-base">🪙</span>
                            ${currentGoldRate}
                        </button>
                    </div>
                </div>

                <!-- Body (collapsible) -->
                <div id="portfolio-body" class="${isBodyVisible ? '' : 'hidden'}">
                    <!-- Tabs -->
                    <div class="flex border-b border-gray-200 bg-gray-50">
                        <button onclick="Investments.switchPortfolioTab('short')" 
                                class="flex-1 py-2 px-3 text-center text-sm font-medium transition-all ${this.currentPortfolioTab === 'short' ? 'text-yellow-700 border-b-2 border-yellow-600 bg-white' : 'text-gray-600 hover:text-gray-800'}">
                            Short Term<br><span class="text-xs">(₹${Utils.formatIndianNumber(Math.round(shortTermTotal))})</span>
                        </button>
                        <button onclick="Investments.switchPortfolioTab('long')" 
                                class="flex-1 py-2 px-3 text-center text-sm font-medium transition-all ${this.currentPortfolioTab === 'long' ? 'text-yellow-700 border-b-2 border-yellow-600 bg-white' : 'text-gray-600 hover:text-gray-800'}">
                            Long Term<br><span class="text-xs">(₹${Utils.formatIndianNumber(Math.round(longTermTotal))})</span>
                        </button>
                    </div>

                    <!-- Tab Content -->
                    <div class="p-4">
                        ${this.renderPortfolioTab(this.currentPortfolioTab === 'short' ? shortTerm : longTerm, exchangeRate, goldRate, sharePrices)}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render a portfolio tab (short or long term)
     */
    renderPortfolioTab(investments, exchangeRate, goldRate, sharePrices) {
        if (investments.length === 0) {
            return `<div class="text-center py-8 text-gray-500">No investments yet</div>`;
        }

        // Group by type
        const grouped = this.groupByType(investments);
        let html = '';

        // Render each type group
        ['EPF', 'FD', 'GOLD', 'SHARES', 'MF'].forEach(type => {
            if (grouped[type] && grouped[type].length > 0) {
                const typeTotal = grouped[type].reduce((sum, inv) => 
                    sum + this.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices), 0);
                
                const isExpanded = this.expandedTypes.has(`${this.currentPortfolioTab}-${type}`);
                const typeLabel = type === 'FD' ? 'Fixed Deposit'
                    : type === 'EPF' ? 'EPF'
                    : type === 'GOLD' ? 'Gold'
                    : type === 'MF' ? 'Mutual Funds'
                    : 'Shares';
                const typeIcon = type === 'SHARES' ? '📈'
                    : type === 'MF' ? '📊'
                    : type === 'GOLD' ? '🪙'
                    : type === 'EPF' ? '💼'
                    : '🏦';

                html += `
                    <div class="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                        <div class="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-150" 
                             onclick="Investments.toggleTypeGroup('${this.currentPortfolioTab}', '${type}')">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 transition-transform duration-200 text-gray-600 ${isExpanded ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <span class="text-lg">${typeIcon}</span>
                                <span class="font-semibold text-gray-800">${typeLabel}</span>
                                <span class="text-xs text-gray-600">(${grouped[type].length})</span>
                            </div>
                            <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(typeTotal))}</span>
                        </div>
                        ${isExpanded ? `
                            <div class="p-3 space-y-3 bg-white">
                                ${grouped[type].map(inv => this.renderPortfolioItem(inv, exchangeRate, goldRate, sharePrices)).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
        }
        });

        return html || `<div class="text-center py-8 text-gray-500">No investments in this category</div>`;
    },

    /**
     * Render a single portfolio item
     */
    renderPortfolioItem(inv, exchangeRate, goldRate, sharePrices) {
        const amount = this.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);
        const price = this.getDisplayPrice(inv, goldRate, sharePrices);
        let line2 = '', line3 = '', line4 = '';

        // Type badge colors
        const typeColors = {
            'SHARES': 'bg-blue-100 text-blue-800',
            'MF': 'bg-indigo-100 text-indigo-800',
            'GOLD': 'bg-yellow-100 text-yellow-800',
            'EPF': 'bg-green-100 text-green-800',
            'FD': 'bg-orange-100 text-orange-800'
        };
        const typeBadge = ``; // Removed since items are already grouped by type

        if (inv.type === 'SHARES') {
            const sharePrice = sharePrices.find(sp => sp.name === inv.name && sp.active);
            const currentPrice = sharePrice ? sharePrice.price : inv.price;
            const currencySymbol = (sharePrice?.currency || inv.currency) === 'USD' ? '$' : '₹';
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">Price:</span> ${currencySymbol}${Utils.formatIndianNumber(parseFloat(currentPrice).toFixed(2))}</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Qty:</span> ${inv.quantity}</span>`;
            if ((sharePrice?.currency || inv.currency) === 'USD') {
                const usdAmount = currentPrice * inv.quantity;
                line3 += `<span class="text-gray-600 text-xs">$${Utils.formatIndianNumber(usdAmount.toFixed(2))}</span>`;
            }
        } else if (inv.type === 'MF') {
            // MFs share the SHARES rendering shape but show NAV instead of Price,
            // include the sub-category, and skip USD logic (INR-only).
            const navRecord = sharePrices.find(sp => sp.name === inv.name && sp.active);
            const currentNav = navRecord ? navRecord.price : inv.price;
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">NAV:</span> ₹${Utils.formatIndianNumber(parseFloat(currentNav).toFixed(4))}</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Units:</span> ${inv.quantity}</span>`;
            if (inv.mfCategory) {
                line3 += `<span class="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold uppercase">${inv.mfCategory}</span>`;
            }
        } else if (inv.type === 'GOLD') {
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">Price:</span> ₹${Utils.formatIndianNumber(goldRate)}/gm</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Qty:</span> ${inv.quantity}gm</span>`;
        } else if (inv.type === 'FD') {
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">Tenure:</span> ${inv.tenure} months</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Interest:</span> ${inv.interestRate}%</span>`;
            line3 += `<span class="text-gray-600 text-xs"><span class="font-bold">End:</span> ${Utils.formatLocalDate(new Date(inv.endDate))}</span>`;
        } else if (inv.type === 'EPF') {
            line2 = inv.description ? `<span class="text-gray-600 text-xs">${inv.description}</span>` : '';
            line3 = `<span class="text-gray-600 text-xs"></span>`;
        }

        line4 = (inv.type === 'EPF' ? '' : (inv.description ? `<p class="text-gray-600 text-xs mt-1">${inv.description}</p>` : ''));

        // Edit available for every type now. FDs especially benefit since
        // users may need to flip the emergency-fund flag on existing entries.
        const editButton = `
            <button onclick="Investments.editInvestment(${inv.id}, false)" class="text-blue-600 hover:text-blue-800 p-0.5" title="Edit">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
            </button>
        `;

        return `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center">
                        <span class="font-semibold text-gray-800">${inv.name}</span>
                        ${typeBadge}
                    </div>
                    <div class="flex gap-1.5">
                        ${editButton}
                        <button onclick="Investments.confirmDelete(${inv.id}, false)" class="text-red-500 hover:text-red-700 p-0.5" title="Delete">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="flex justify-between items-center mb-1">
                    ${line2}
                    <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                </div>
                <div class="flex justify-between items-center">
                    ${line3}
                </div>
                ${line4}
            </div>
        `;
    },

    /**
     * Render monthly investments section
     */
    renderMonthlySection() {
        const container = document.getElementById('investments-monthly-section');
        if (!container) return;

        const monthlyData = window.DB.monthlyInvestments || [];
        const exchangeRate = this.getExchangeRate();
        const goldRate = this.getGoldRate();

        // Apply date filter FIRST to all data
        const dateFilteredData = this.applyDateFilterToInvestments(monthlyData);

        // Separate by term AFTER date filtering
        const shortTermData = dateFilteredData.filter(inv => inv.goal === 'SHORT_TERM');
        const longTermData = dateFilteredData.filter(inv => inv.goal === 'LONG_TERM');

        // Calculate term totals (now correctly filtered by date)
        const shortTermTotal = shortTermData.reduce((sum, inv) => sum + this.calculateMonthlyAmount(inv, goldRate), 0);
        const longTermTotal = longTermData.reduce((sum, inv) => sum + this.calculateMonthlyAmount(inv, goldRate), 0);

        // Apply search filter based on current tab
        const currentTabData = this.currentMonthlyTab === 'short' ? shortTermData : longTermData;
        let filtered = currentTabData;
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(inv => 
                inv.name.toLowerCase().includes(query) || 
                (inv.description && inv.description.toLowerCase().includes(query))
            );
        }
        
        // Group by year and month
        const grouped = this.groupByYearMonth(filtered);

        // Build HTML with tabs
        let html = `
            <div class="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl shadow-md overflow-hidden mb-4">
                <!-- Tabs -->
                <div class="flex border-b border-orange-200 bg-orange-100/50">
                    <button onclick="Investments.switchMonthlyTab('short')" 
                            class="flex-1 py-2 px-3 text-center text-sm font-medium transition-all ${this.currentMonthlyTab === 'short' ? 'text-orange-700 border-b-2 border-orange-600 bg-orange-50' : 'text-gray-600 hover:text-gray-800'}">
                        Short Term<br><span class="text-xs">(₹${Utils.formatIndianNumber(Math.round(shortTermTotal))})</span>
                    </button>
                    <button onclick="Investments.switchMonthlyTab('long')" 
                            class="flex-1 py-2 px-3 text-center text-sm font-medium transition-all ${this.currentMonthlyTab === 'long' ? 'text-orange-700 border-b-2 border-orange-600 bg-orange-50' : 'text-gray-600 hover:text-gray-800'}">
                        Long Term<br><span class="text-xs">(₹${Utils.formatIndianNumber(Math.round(longTermTotal))})</span>
                    </button>
                </div>
                
                <!-- Tab Content -->
                <div class="p-4">
        `;

        if (filtered.length === 0) {
            html += `<div class="text-center py-12 text-gray-500">No monthly investments found</div>`;
            html += `</div></div>`; // Close tab content and container
            container.innerHTML = html;
            return;
        }

        html += '<div class="space-y-4">';

        if (this.dateFilter === 'thisMonth') {
            // Show only current month
            const now = new Date();
            const currentMonthData = grouped[now.getFullYear()]?.[now.getMonth() + 1] || [];
            
            html += this.renderMonthGroup(now.getFullYear(), now.getMonth() + 1, currentMonthData, exchangeRate, goldRate, false);
                } else {
            // Show all years and months
            const years = Object.keys(grouped).sort((a, b) => b - a);
            years.forEach(year => {
                const months = Object.keys(grouped[year]).sort((a, b) => b - a);
                const isYearExpanded = this.expandedYears.has(year);
                const yearTotal = months.reduce((sum, month) => {
                    return sum + grouped[year][month].reduce((s, inv) => 
                        s + this.calculateMonthlyAmount(inv, goldRate), 0);
                }, 0);

                html += `
                    <div class="border border-gray-300 rounded-lg overflow-hidden">
                        <div class="bg-gradient-to-r from-yellow-600 to-orange-600 text-white p-3 flex justify-between items-center cursor-pointer"
                             onclick="Investments.toggleYearGroup('${year}')">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 transition-transform duration-200 ${isYearExpanded ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                                <span class="font-bold">${year}</span>
                            </div>
                            <span class="font-bold">₹${Utils.formatIndianNumber(Math.round(yearTotal))}</span>
                        </div>
                        ${isYearExpanded ? `
                            <div class="p-3 space-y-3">
                                ${months.map(month => this.renderMonthGroup(year, month, grouped[year][month], exchangeRate, goldRate, false)).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            }
            
        html += '</div>'; // Close space-y-4
        html += '</div>'; // Close tab content (p-4)
        html += '</div>'; // Close main container
        container.innerHTML = html;
    },

    /**
     * Render a month group
     */
    renderMonthGroup(year, month, investments, exchangeRate, goldRate, showYear = true) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[month - 1];
        const monthKey = `${year}-${month}`;
        const isExpanded = this.expandedMonths.has(monthKey);
        const monthTotal = investments.reduce((sum, inv) => sum + this.calculateMonthlyAmount(inv, goldRate), 0);

        // Group by type
        const grouped = this.groupByType(investments);
        let typeGroupsHtml = '';
        
        if (isExpanded) {
            ['EPF', 'FD', 'GOLD', 'SHARES', 'MF'].forEach(type => {
                if (grouped[type] && grouped[type].length > 0) {
                    const typeTotal = grouped[type].reduce((sum, inv) => 
                        sum + this.calculateMonthlyAmount(inv, goldRate), 0);
                    
                    const typeKey = `${monthKey}-${type}`;
                    const isTypeExpanded = this.expandedMonthlyTypes.has(typeKey);
                    const typeLabel = type === 'FD' ? 'Fixed Deposit'
                        : type === 'EPF' ? 'EPF'
                        : type === 'GOLD' ? 'Gold'
                        : type === 'MF' ? 'Mutual Funds'
                        : 'Shares';
                    const typeIcon = type === 'SHARES' ? '📈'
                        : type === 'MF' ? '📊'
                        : type === 'GOLD' ? '🪙'
                        : type === 'EPF' ? '💼'
                        : '🏦';

                    typeGroupsHtml += `
                        <div class="mb-2 border border-gray-200 rounded-lg overflow-hidden">
                            <div class="bg-gray-50 p-2.5 flex justify-between items-center cursor-pointer hover:bg-gray-100" 
                                 onclick="Investments.toggleMonthlyTypeGroup('${typeKey}')">
                                <div class="flex items-center gap-2">
                                    <svg class="w-3.5 h-3.5 transition-transform duration-200 text-gray-600 ${isTypeExpanded ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                    <span class="text-base">${typeIcon}</span>
                                    <span class="font-medium text-gray-800 text-sm">${typeLabel}</span>
                                    <span class="text-xs text-gray-600">(${grouped[type].length})</span>
                                </div>
                                <span class="font-bold text-yellow-700 text-sm">₹${Utils.formatIndianNumber(Math.round(typeTotal))}</span>
                            </div>
                            ${isTypeExpanded ? `
                                <div class="p-2.5 space-y-2.5 bg-white">
                                    ${grouped[type].map(inv => this.renderMonthlyItem(inv, goldRate)).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
            });
        }

        return `
            <div class="border border-gray-200 rounded-lg overflow-hidden">
                <div class="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-150"
                     onclick="Investments.toggleMonthGroup('${monthKey}')">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                        <span class="font-semibold text-gray-800">${monthName}${showYear ? ` ${year}` : ''}</span>
                        <span class="text-xs text-gray-600">(${investments.length})</span>
                    </div>
                    <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(monthTotal))}</span>
                </div>
                ${isExpanded ? `
                    <div class="p-3 space-y-3 bg-white">
                        ${typeGroupsHtml}
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render a single monthly investment item
     */
    renderMonthlyItem(inv, goldRate) {
        const amount = this.calculateMonthlyAmount(inv, goldRate);
        let line2 = '', line3 = '';

        // Type badge colors
        const typeColors = {
            'SHARES': 'bg-blue-100 text-blue-800',
            'MF': 'bg-indigo-100 text-indigo-800',
            'GOLD': 'bg-yellow-100 text-yellow-800',
            'EPF': 'bg-green-100 text-green-800',
            'FD': 'bg-orange-100 text-orange-800'
        };
        const typeBadge = ``; // Removed since items are already grouped by type

        if (inv.type === 'SHARES') {
            const currencySymbol = inv.currency === 'USD' ? '$' : '₹';
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">Price:</span> ${currencySymbol}${Utils.formatIndianNumber(inv.price)}</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Qty:</span> ${inv.quantity}</span>`;
            line3 += `<span class="text-gray-600 text-xs">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        } else if (inv.type === 'MF') {
            // Monthly MF entry: show NAV at time of purchase + sub-category chip.
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">NAV:</span> ₹${Utils.formatIndianNumber(parseFloat(inv.price).toFixed(4))}</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Units:</span> ${inv.quantity}</span>`;
            if (inv.mfCategory) {
                line3 += `<span class="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold uppercase">${inv.mfCategory}</span>`;
            }
            line3 += `<span class="text-gray-600 text-xs">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        } else if (inv.type === 'GOLD') {
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">Price:</span> ₹${Utils.formatIndianNumber(inv.price)}/gm</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Qty:</span> ${inv.quantity}gm</span>`;
            line3 += `<span class="text-gray-600 text-xs">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        } else if (inv.type === 'FD') {
            line2 = `<span class="text-gray-600 text-xs"></span>`;
            line3 = `<span class="text-gray-600 text-xs"></span>`;
            line3 += `<span class="text-gray-600 text-xs">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        } else if (inv.type === 'EPF') {
            line2 = inv.description ? `<span class="text-gray-600 text-xs">${inv.description}</span>` : '';
            line3 = `<span class="text-gray-600 text-xs">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        }

        const line4 = (inv.type === 'EPF' ? '' : (inv.description ? `<p class="text-gray-600 text-xs mt-1">${inv.description}</p>` : ''));

        // No edit button for monthly investments (they're independent from portfolio)
        const editButton = '';

        return `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center">
                        <span class="font-semibold text-gray-800">${inv.name}</span>
                        ${typeBadge}
                    </div>
                    <div class="flex gap-1.5">
                        ${editButton}
                        <button onclick="Investments.confirmDelete(${inv.id}, true)" class="text-red-500 hover:text-red-700 p-0.5" title="Delete">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="flex justify-between items-center mb-1">
                    ${line2}
                    <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                </div>
                <div class="flex justify-between items-center">
                    ${line3}
                </div>
                ${line4}
            </div>
        `;
    },

    /**
     * Group investments by type
     */
    groupByType(investments) {
        const grouped = {};
        investments.forEach(inv => {
            if (!grouped[inv.type]) {
                grouped[inv.type] = [];
            }
            grouped[inv.type].push(inv);
        });
        return grouped;
    },

    /**
     * Group investments by year and month
     * Uses budget month (incomeMonth/incomeYear) if available, falls back to investment date
     */
    groupByYearMonth(investments) {
        const grouped = {};
        investments.forEach(inv => {
            // Use budget month if available, otherwise fall back to investment date
            let year, month;
            if (inv.incomeMonth && inv.incomeYear) {
                year = inv.incomeYear;
                month = inv.incomeMonth;
            } else {
                const date = new Date(inv.date);
                year = date.getFullYear();
                month = date.getMonth() + 1;
            }
                        
            if (!grouped[year]) {
                grouped[year] = {};
            }
            if (!grouped[year][month]) {
                grouped[year][month] = [];
            }
            grouped[year][month].push(inv);
        });
        return grouped;
    },

    /**
     * Calculate portfolio investment amount in INR
     */
    calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices) {
        if (inv.type === 'SHARES') {
            // Check if we have a share price in storage
            const sharePrice = sharePrices.find(sp => sp.name === inv.name && sp.active);
            const price = sharePrice ? sharePrice.price : inv.price;
            const currency = sharePrice ? sharePrice.currency : inv.currency;

            const amount = price * inv.quantity;
            return currency === 'USD' ? amount * exchangeRate : amount;
        } else if (inv.type === 'MF') {
            // MF: units × NAV in INR. Reuses sharePrices store so latest-NAV
            // refreshes (same code path as SHARES) "just work" for MFs too.
            const navRecord = sharePrices.find(sp => sp.name === inv.name && sp.active);
            const price = navRecord ? navRecord.price : inv.price;
            return price * inv.quantity;
        } else if (inv.type === 'GOLD') {
            return goldRate * inv.quantity;
        } else if (inv.type === 'EPF' || inv.type === 'FD') {
            return inv.amount;
        }
        return 0;
    },

    /**
     * Calculate monthly investment amount
     */
    calculateMonthlyAmount(inv, goldRate) {
        if (inv.type === 'SHARES') {
            return inv.price * inv.quantity * (inv.currency === 'USD' ? this.getExchangeRate() : 1);
        } else if (inv.type === 'MF') {
            // INR-only; historical NAV stored on the record.
            return inv.price * inv.quantity;
        } else if (inv.type === 'GOLD') {
            return inv.price * inv.quantity;
        } else if (inv.type === 'EPF' || inv.type === 'FD') {
            return inv.amount;
        }
        return 0;
    },

    /**
     * Get display price for investment
     */
    getDisplayPrice(inv, goldRate, sharePrices) {
        if (inv.type === 'SHARES' || inv.type === 'MF') {
            const sharePrice = sharePrices.find(sp => sp.name === inv.name && sp.active);
            return sharePrice ? sharePrice.price : inv.price;
        } else if (inv.type === 'GOLD') {
            return goldRate;
        }
        return inv.price || inv.amount;
    },

    /**
     * Get latest share price from storage
     */
    getLatestSharePrice(shareName) {
        const sharePrices = window.DB.sharePrices || [];
        return sharePrices.find(sp => sp.name === shareName && sp.active);
    },

    /**
     * Update portfolio entries with new share price
     */
    updatePortfolioSharePrice(shareName, newPrice, currency) {
        const portfolioInvestments = window.DB.portfolioInvestments || [];

        // Update SHARES and MF entries with the same name. MFs share this
        // store because they have the same name → unit-price relationship.
        // (Currency is ignored for MFs since they're INR-only.)
        portfolioInvestments.forEach(inv => {
            if ((inv.type === 'SHARES' || inv.type === 'MF') && inv.name === shareName) {
                inv.price = newPrice;
                if (inv.type === 'SHARES') {
                    inv.currency = currency;
                }
            }
        });
    },

    /**
     * Update portfolio entries with new gold price
     */
    updatePortfolioGoldPrice(newGoldRate) {
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        
        // Update all portfolio entries with GOLD
        portfolioInvestments.forEach(inv => {
            if (inv.type === 'GOLD') {
                inv.price = newGoldRate;
            }
        });
    },

    /**
     * Get budget month/year for an investment
     * Uses incomeMonth/incomeYear if available, falls back to investment date
     */
    getInvestmentBudgetMonth(inv) {
        if (inv.incomeMonth && inv.incomeYear) {
            return { month: inv.incomeMonth, year: inv.incomeYear };
        }
        const date = new Date(inv.date);
        return { month: date.getMonth() + 1, year: date.getFullYear() };
    },

    /**
     * Apply date filter to investments
     * Uses budget month (incomeMonth/incomeYear) if available, falls back to investment date
     */
    applyDateFilterToInvestments(investments) {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        switch (this.dateFilter) {
            case 'thisMonth':
                return investments.filter(inv => {
                    const { month, year } = this.getInvestmentBudgetMonth(inv);
                    return month === currentMonth && year === currentYear;
                });
            
            case 'last6Months':
                // Calculate the range of 6 months back
                let startMonth = currentMonth - 5;
                let startYear = currentYear;
                if (startMonth <= 0) {
                    startMonth += 12;
                    startYear--;
                }
                return investments.filter(inv => {
                    const { month, year } = this.getInvestmentBudgetMonth(inv);
                    const invMonthValue = year * 12 + month;
                    const startMonthValue = startYear * 12 + startMonth;
                    const currentMonthValue = currentYear * 12 + currentMonth;
                    return invMonthValue >= startMonthValue && invMonthValue <= currentMonthValue;
                });
            
            case 'thisYear':
                return investments.filter(inv => {
                    const { year } = this.getInvestmentBudgetMonth(inv);
                    return year === currentYear;
                });
            
            case 'custom':
                if (this.customDateRange.start && this.customDateRange.end) {
                    const [startYear, startMonth] = this.customDateRange.start.split('-').map(Number);
                    const [endYear, endMonth] = this.customDateRange.end.split('-').map(Number);
                    const startMonthValue = startYear * 12 + startMonth;
                    const endMonthValue = endYear * 12 + endMonth;
                    return investments.filter(inv => {
                        const { month, year } = this.getInvestmentBudgetMonth(inv);
                        const invMonthValue = year * 12 + month;
                        return invMonthValue >= startMonthValue && invMonthValue <= endMonthValue;
                    });
                }
                return investments;
            
            case 'allTime':
            default:
                return investments;
        }
    },

    /**
     * Toggle portfolio body visibility
     */
    togglePortfolioBody() {
        this.portfolioBodyVisible = !this.portfolioBodyVisible;
        const body = document.getElementById('portfolio-body');
        const header = body?.closest('.bg-white')?.querySelector('.bg-gradient-to-r');
        const chevron = header?.querySelector('svg');
        
        if (body) {
            if (this.portfolioBodyVisible) {
                body.classList.remove('hidden');
                header?.classList.remove('rounded-xl');
                header?.classList.add('rounded-t-xl');
                chevron?.classList.remove('-rotate-90');
            } else {
                body.classList.add('hidden');
                header?.classList.remove('rounded-t-xl');
                header?.classList.add('rounded-xl');
                chevron?.classList.add('-rotate-90');
            }
        }
    },

    /**
     * Switch portfolio tab
     */
    switchPortfolioTab(tab) {
        this.currentPortfolioTab = tab;
        this.render();
    },

    /**
     * Switch monthly investments tab
     */
    switchMonthlyTab(tab) {
        this.currentMonthlyTab = tab;
        this.render();
    },

    /**
     * Toggle type group expansion
     */
    toggleTypeGroup(term, type) {
        const key = `${term}-${type}`;
        if (this.expandedTypes.has(key)) {
            this.expandedTypes.delete(key);
        } else {
            this.expandedTypes.add(key);
        }
        this.render();
    },

    /**
     * Toggle monthly type group expansion
     */
    toggleMonthlyTypeGroup(typeKey) {
        if (this.expandedMonthlyTypes.has(typeKey)) {
            this.expandedMonthlyTypes.delete(typeKey);
        } else {
            this.expandedMonthlyTypes.add(typeKey);
        }
        this.renderMonthlySection();
    },

    /**
     * Toggle month group expansion
     */
    toggleMonthGroup(monthKey) {
        if (this.expandedMonths.has(monthKey)) {
            this.expandedMonths.delete(monthKey);
        } else {
            this.expandedMonths.add(monthKey);
        }
        this.renderMonthlySection();
    },

    /**
     * Toggle year group expansion
     */
    toggleYearGroup(year) {
        if (this.expandedYears.has(year)) {
            this.expandedYears.delete(year);
        } else {
            this.expandedYears.add(year);
        }
        this.renderMonthlySection();
    },

    /**
     * Handle search input
     */
    handleSearch(query) {
        this.searchQuery = query;
        this.renderMonthlySection();
    },

    /**
     * Open investment modal (Add new)
     */
    openInvestmentModal() {
        this.editingInvestment = null;
        document.getElementById('investment-modal-title').textContent = 'Add Investment';
        document.getElementById('investment-id').value = '';
        document.getElementById('investment-editing').value = 'false';
        document.getElementById('investment-type').value = '';
        document.getElementById('investment-type').disabled = false;
        document.getElementById('investment-dynamic-fields').innerHTML = '';
        document.getElementById('investment-save-btn').disabled = true;
        document.getElementById('investment-save-btn').classList.add('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
        document.getElementById('investment-save-btn').classList.remove('bg-gradient-to-r', 'from-green-600', 'to-emerald-600', 'text-white', 'hover:shadow-lg', 'transform', 'hover:scale-105');
        
        // Set default goal to Long Term and enable both radio buttons
        document.querySelectorAll('input[name="investment-goal"]').forEach(radio => {
            radio.disabled = false;
        });
        document.querySelector('input[name="investment-goal"][value="LONG_TERM"]').checked = true;
        
        document.getElementById('investment-modal').classList.remove('hidden');
    },

    /**
     * Close investment modal
     */
    closeInvestmentModal() {
        document.getElementById('investment-modal').classList.add('hidden');
        this.hideNameSuggestions();
        this.clearAllFieldErrors();
        this.editingInvestment = null;
    },

    /**
     * Show success animation
     */
    showSuccess() {
        const modal = document.getElementById('investment-success-modal');
        modal.classList.remove('hidden');
        
        // Auto-close after 1 second
        setTimeout(() => {
            modal.classList.add('hidden');
            this.closeInvestmentModal();
            this.render();
        }, 1000);
    },

    /**
     * Handle type change in investment form
     */
    handleTypeChange() {
        const type = document.getElementById('investment-type').value;
        const dynamicFields = document.getElementById('investment-dynamic-fields');
        const saveBtn = document.getElementById('investment-save-btn');
        
        // Clear all field errors
        this.clearAllFieldErrors();
        
        if (!type) {
            dynamicFields.innerHTML = '';
            saveBtn.disabled = true;
            saveBtn.classList.add('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
            saveBtn.classList.remove('bg-gradient-to-r', 'from-green-600', 'to-emerald-600', 'text-white', 'hover:shadow-lg', 'transform', 'hover:scale-105');
            return;
        }
        
        // EPF should only be Long Term - auto-select and disable Short Term
        if (type === 'EPF') {
            const longTermRadio = document.querySelector('input[name="investment-goal"][value="LONG_TERM"]');
            const shortTermRadio = document.querySelector('input[name="investment-goal"][value="SHORT_TERM"]');
            if (longTermRadio && shortTermRadio) {
                longTermRadio.checked = true;
                shortTermRadio.disabled = true;
                longTermRadio.disabled = false;
            }
        } else {
            // Enable both options for other types
            const isEditing = document.getElementById('investment-editing')?.value === 'true';
            if (!isEditing) {
                document.querySelectorAll('input[name="investment-goal"]').forEach(radio => {
                    radio.disabled = false;
                });
            }
        }
        
        // Enable save button
        saveBtn.disabled = false;
        saveBtn.classList.remove('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
        saveBtn.classList.add('bg-gradient-to-r', 'from-green-600', 'to-emerald-600', 'text-white', 'hover:shadow-lg', 'transform', 'hover:scale-105');

        const isEditing = document.getElementById('investment-editing').value === 'true';
        const goldRate = this.getGoldRate();

        let html = '';

        // Name field (with autocomplete) - disabled for EPF when editing
        const nameDisabled = (isEditing && type === 'EPF') ? 'disabled' : '';
        const nameClass = (isEditing && type === 'EPF') ? 
            'w-full p-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed' : 
            'w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500';
        
        html += `
            <div class="mb-3 relative">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Name</label>
                <input type="text" id="investment-name" placeholder="Enter name" maxlength="32" ${nameDisabled}
                       class="${nameClass}"
                       oninput="Investments.showNameSuggestions(this.value); Investments.clearNameError();"
                       onfocus="Investments.showNameSuggestions(this.value)"
                       onblur="Investments.validateNameDuplicate()"
                       autocomplete="off">
                <div id="investment-name-suggestions" class="hidden absolute w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto z-50 mt-1"></div>
                <div id="investment-name-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                    <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <span id="investment-name-error-text"></span>
                </div>
            </div>
        `;
        
        // Type-specific fields
        if (type === 'MF') {
            // Mutual funds reuse the units × NAV math (same as SHARES) but are
            // INR-only and add a sub-category that drives emergency-fund and
            // (future) tax-view classification. Field IDs intentionally mirror
            // SHARES (investment-quantity, investment-price) so calculateAmount
            // and validateField paths work unchanged.
            html += `
                <div class="mb-3">
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Sub-category</label>
                    <select id="investment-mf-category" onchange="Investments.toggleMfEmergencyFundVisibility()" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                        <option value="EQUITY">Equity</option>
                        <option value="DEBT">Debt</option>
                        <option value="LIQUID">Liquid</option>
                        <option value="ELSS">ELSS (tax-saver, 3-yr lock-in)</option>
                        <option value="HYBRID">Hybrid</option>
                    </select>
                    <p class="text-[10px] text-gray-500 mt-1">ELSS is locked 3 years — emergency-fund option is hidden for ELSS.</p>
                </div>
                <div class="mb-3">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Units</label>
                            <input type="number" id="investment-quantity" placeholder="Units" step="0.001" min="0"
                                   class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                   oninput="Investments.calculateAmount(); Investments.clearFieldError('quantity');"
                                   onblur="Investments.validateField('quantity')">
                            <div id="investment-quantity-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                                <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                                <span id="investment-quantity-error-text"></span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">NAV (₹)</label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">₹</span>
                                <input type="number" id="investment-price" placeholder="0.00" step="0.0001" min="0"
                                       class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                       oninput="Investments.calculateAmount(); Investments.clearFieldError('price');"
                                       onblur="Investments.validateField('price')">
                            </div>
                            <div id="investment-price-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                                <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                                <span id="investment-price-error-text"></span>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Hidden currency field so SHARES-shared logic (calculateAmount, save) reads INR. -->
                <input type="hidden" id="investment-currency" value="INR">
            `;
        } else if (type === 'SHARES') {
            html += `
                <div class="mb-3">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Quantity</label>
                            <input type="number" id="investment-quantity" placeholder="Qty" step="1" min="0"
                                   class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                   oninput="Investments.calculateAmount(); Investments.clearFieldError('quantity');"
                                   onblur="Investments.validateField('quantity')">
                            <div id="investment-quantity-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                                <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                                <span id="investment-quantity-error-text"></span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Price</label>
                            <div class="flex">
                                <select id="investment-currency" class="w-12 p-2 border border-gray-300 rounded-l-lg border-r-0 focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-gray-50 text-sm"
                                        onchange="Investments.calculateAmount()">
                                    <option value="INR">₹</option>
                                    <option value="USD">$</option>
                                </select>
                                <input type="number" id="investment-price" placeholder="0.00" step="0.01" min="0"
                                       class="flex-1 p-2 border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 min-w-0"
                                       oninput="Investments.calculateAmount(); Investments.clearFieldError('price');"
                                       onblur="Investments.validateField('price')">
                            </div>
                            <div id="investment-price-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                                <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                                <span id="investment-price-error-text"></span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'GOLD') {
            html += `
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Quantity (grams)</label>
                        <input type="number" id="investment-quantity" placeholder="Grams" step="0.01" min="0"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                               oninput="Investments.calculateAmount(); Investments.clearFieldError('quantity');"
                               onblur="Investments.validateField('quantity')">
                        <div id="investment-quantity-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                            <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                            <span id="investment-quantity-error-text"></span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Price/gram</label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">₹</span>
                            <input type="number" id="investment-price" placeholder="Per gram" step="0.01" min="0" value="${goldRate}"
                                   class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                   oninput="Investments.calculateAmount(); Investments.clearFieldError('price');"
                                   onblur="Investments.validateField('price')">
                        </div>
                        <div id="investment-price-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                            <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                            <span id="investment-price-error-text"></span>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'EPF') {
            html += `
                <div class="mb-3">
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Amount</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">₹</span>
                        <input type="number" id="investment-amount" placeholder="Amount" step="0.01" min="0"
                               class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                               oninput="Investments.clearFieldError('amount');"
                               onblur="Investments.validateField('amount')">
                    </div>
                    <div id="investment-amount-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                        <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                        <span id="investment-amount-error-text"></span>
                    </div>
                </div>
            `;
        } else if (type === 'FD') {
            html += `
                <div class="mb-3">
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Amount</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">₹</span>
                        <input type="number" id="investment-amount" placeholder="Amount" step="0.01" min="0"
                               class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                               oninput="Investments.clearFieldError('amount');"
                               onblur="Investments.validateField('amount')">
                    </div>
                    <div id="investment-amount-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                        <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                        <span id="investment-amount-error-text"></span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Tenure (months)</label>
                        <input type="number" id="investment-tenure" placeholder="Months" step="1" min="1"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                               oninput="Investments.clearFieldError('tenure');"
                               onblur="Investments.validateField('tenure')">
                        <div id="investment-tenure-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                            <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                            <span id="investment-tenure-error-text"></span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Interest Rate (%)</label>
                        <input type="number" id="investment-interest-rate" placeholder="Rate" step="0.01" min="0"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                               oninput="Investments.clearFieldError('interest-rate');"
                               onblur="Investments.validateField('interest-rate')">
                        <div id="investment-interest-rate-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                            <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                            <span id="investment-interest-rate-error-text"></span>
                        </div>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
                    <input type="date" id="investment-end-date"
                           class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                           onchange="Investments.clearFieldError('end-date');"
                           onblur="Investments.validateField('end-date')">
                    <div id="investment-end-date-error" class="hidden mt-1 text-sm text-red-600 flex items-start gap-1">
                        <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                        <span id="investment-end-date-error-text"></span>
                    </div>
                </div>
            `;
        }

        // Description field - disabled for EPF when editing
        const descDisabled = (isEditing && type === 'EPF') ? 'disabled' : '';
        const descClass = (isEditing && type === 'EPF') ? 
            'w-full p-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed' : 
            'w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500';
        
        html += `
            <div class="mb-3">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Description (optional)</label>
                <textarea id="investment-description" placeholder="Additional details" maxlength="256" rows="2" ${descDisabled}
                          class="${descClass}"></textarea>
            </div>
        `;

        // Calculated amount display (for SHARES, MF, and GOLD — all units×price types)
        if (type === 'SHARES' || type === 'MF' || type === 'GOLD') {
            html += `
                <div class="mb-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p class="text-xs text-yellow-700 mb-1">Calculated Amount</p>
                    <p id="investment-calculated-amount" class="text-lg font-bold text-yellow-800">₹0</p>
                </div>
            `;
        }

        // Track as monthly investment checkbox
        html += `
            <div class="mb-3 flex items-center gap-2">
                <input type="checkbox" id="investment-track-monthly" ${isEditing ? 'disabled' : ''} checked
                       class="w-4 h-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded">
                <label class="text-sm font-medium text-gray-700">Track as monthly investment</label>
            </div>
        `;

        // Emergency-fund flag rules:
        //  - FD: always eligible (can be broken on demand, penalty acceptable).
        //  - MF: eligible UNLESS the sub-category is ELSS — ELSS has a
        //        mandatory 3-year lock-in so it can't actually fund an
        //        emergency. The MF checkbox is rendered up front; we
        //        toggle it based on the sub-category dropdown's value
        //        (see toggleMfEmergencyFundVisibility below).
        //  - SHARES, EPF, GOLD: not eligible. Equities are too volatile to
        //        be reliable emergency money; EPF is retirement-locked;
        //        gold isn't liquid enough for true emergency use.
        if (type === 'FD' || type === 'MF') {
            const initialClassesForMf = (type === 'MF') ? 'mf-ef-row' : '';
            html += `
                <div id="investment-ef-row" class="mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-cyan-50 border border-cyan-200 ${initialClassesForMf}">
                    <input type="checkbox" id="investment-is-emergency-fund"
                           class="w-4 h-4 mt-0.5 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded">
                    <label for="investment-is-emergency-fund" class="text-xs text-cyan-900 leading-relaxed cursor-pointer">
                        <span class="font-semibold">🛡️ Part of my emergency fund</span><br>
                        <span class="text-cyan-700">Counts toward emergency-fund coverage on the dashboard. Use for sweep FDs and liquid / debt / arbitrage MFs you can redeem in under a week.</span>
                    </label>
                </div>
            `;
        }

        // Date field (if tracking monthly)
        const today = new Date();
        const suggestion = this.suggestIncomeMonth(today.toISOString().split('T')[0]);
        
        html += `
            <div id="investment-date-container" class="mb-3">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Investment Date</label>
                <input type="date" id="investment-date" value="${today.toISOString().split('T')[0]}"
                       onchange="Investments.updateIncomeSuggestion()"
                       class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
            </div>
            
            <!-- Budget Month Attribution -->
            <div id="investment-income-month-container" class="mb-3 p-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                <div class="flex justify-between items-center mb-2">
                    <label class="text-sm font-semibold text-blue-800">Budget Month</label>
                    <span id="income-month-hint" class="text-[10px] text-blue-600 hidden">(Auto-suggested)</span>
                </div>
                <p class="text-xs text-blue-600 mb-2">Count this investment towards which month's budget?</p>
                <div class="grid grid-cols-2 gap-2">
                    <select id="investment-income-month" class="p-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="1" ${suggestion.month === 1 ? 'selected' : ''}>January</option>
                        <option value="2" ${suggestion.month === 2 ? 'selected' : ''}>February</option>
                        <option value="3" ${suggestion.month === 3 ? 'selected' : ''}>March</option>
                        <option value="4" ${suggestion.month === 4 ? 'selected' : ''}>April</option>
                        <option value="5" ${suggestion.month === 5 ? 'selected' : ''}>May</option>
                        <option value="6" ${suggestion.month === 6 ? 'selected' : ''}>June</option>
                        <option value="7" ${suggestion.month === 7 ? 'selected' : ''}>July</option>
                        <option value="8" ${suggestion.month === 8 ? 'selected' : ''}>August</option>
                        <option value="9" ${suggestion.month === 9 ? 'selected' : ''}>September</option>
                        <option value="10" ${suggestion.month === 10 ? 'selected' : ''}>October</option>
                        <option value="11" ${suggestion.month === 11 ? 'selected' : ''}>November</option>
                        <option value="12" ${suggestion.month === 12 ? 'selected' : ''}>December</option>
                    </select>
                    <input type="number" id="investment-income-year" value="${suggestion.year}" min="2020" max="2100"
                           class="p-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                </div>
            </div>
        `;

        dynamicFields.innerHTML = html;

        // Add event listener for monthly checkbox
        document.getElementById('investment-track-monthly').addEventListener('change', (e) => {
            const dateContainer = document.getElementById('investment-date-container');
            const incomeMonthContainer = document.getElementById('investment-income-month-container');
            if (e.target.checked) {
                dateContainer.classList.remove('hidden');
                incomeMonthContainer.classList.remove('hidden');
            } else {
                dateContainer.classList.add('hidden');
                incomeMonthContainer.classList.add('hidden');
            }
        });

        // If editing, populate fields
        if (isEditing && this.editingInvestment) {
            this.populateEditFields(this.editingInvestment);
                    }
    },

    /**
     * Show name suggestions based on selected type and input
     */
    showNameSuggestions(searchTerm) {
        const suggestionsDiv = document.getElementById('investment-name-suggestions');
        const type = document.getElementById('investment-type')?.value;
        
        if (!type || !searchTerm || searchTerm.length < 1) {
            suggestionsDiv.classList.add('hidden');
            suggestionsDiv.innerHTML = '';
            return;
        }

        const portfolioData = window.DB.portfolioInvestments || [];
        const names = [...new Set(portfolioData.filter(inv => inv.type === type).map(inv => inv.name))];
        
        // Filter names that match the search term
        const filteredNames = names.filter(name => 
            name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (filteredNames.length === 0) {
            suggestionsDiv.classList.add('hidden');
            suggestionsDiv.innerHTML = '';
            return;
        }

        // Build suggestions HTML
        const suggestionsHTML = filteredNames.map(name => `
            <div class="px-3 py-2 hover:bg-yellow-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                 onclick="Investments.selectNameSuggestion('${name.replace(/'/g, "\\'")}')">
                <span class="text-sm text-gray-700">${name}</span>
            </div>
        `).join('');

        suggestionsDiv.innerHTML = suggestionsHTML;
        suggestionsDiv.classList.remove('hidden');
    },

    /**
     * Select a name suggestion
     */
    selectNameSuggestion(name) {
        document.getElementById('investment-name').value = name;
        const suggestionsDiv = document.getElementById('investment-name-suggestions');
        suggestionsDiv.classList.add('hidden');
        suggestionsDiv.innerHTML = '';
        
        // Validate for duplicates after selecting suggestion
        this.validateNameDuplicate();
    },

    /**
     * Hide name suggestions
     */
    hideNameSuggestions() {
        const suggestionsDiv = document.getElementById('investment-name-suggestions');
        if (suggestionsDiv) {
            suggestionsDiv.classList.add('hidden');
            suggestionsDiv.innerHTML = '';
        }
    },

    /**
     * Show name error message below input field
     */
    showNameError(type) {
        const errorDiv = document.getElementById('investment-name-error');
        const errorText = document.getElementById('investment-name-error-text');
        
        if (errorDiv && errorText) {
            errorText.textContent = `${type} with this name already exists. Choose a different name (add suffix) or delete existing one first.`;
            errorDiv.classList.remove('hidden');
            
            // Scroll error into view if needed
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    /**
     * Clear name error message
     */
    clearNameError() {
        const errorDiv = document.getElementById('investment-name-error');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    },

    /**
     * Show field error message
     */
    showFieldError(fieldName, message) {
        const errorDiv = document.getElementById(`investment-${fieldName}-error`);
        const errorText = document.getElementById(`investment-${fieldName}-error-text`);
        
        if (errorDiv && errorText) {
            errorText.textContent = message;
            errorDiv.classList.remove('hidden');
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    /**
     * Clear field error message
     */
    clearFieldError(fieldName) {
        const errorDiv = document.getElementById(`investment-${fieldName}-error`);
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    },

    /**
     * Clear all field errors
     */
    clearAllFieldErrors() {
        ['name', 'quantity', 'price', 'amount', 'tenure', 'interest-rate', 'end-date'].forEach(field => {
            this.clearFieldError(field);
        });
    },

    /**
     * Validate a single field
     */
    validateField(fieldName) {
        const type = document.getElementById('investment-type')?.value;
        if (!type) return true;

        let isValid = true;

        if (fieldName === 'quantity') {
            const value = parseFloat(document.getElementById('investment-quantity')?.value);
            if (!value || value <= 0) {
                this.showFieldError('quantity', 'Please enter a valid quantity greater than 0');
                isValid = false;
            }
        } else if (fieldName === 'price') {
            const value = parseFloat(document.getElementById('investment-price')?.value);
            if (!value || value <= 0) {
                const label = type === 'GOLD' ? 'price per gram' : 'price';
                this.showFieldError('price', `Please enter a valid ${label} greater than 0`);
                isValid = false;
            }
        } else if (fieldName === 'amount') {
            const value = parseFloat(document.getElementById('investment-amount')?.value);
            if (!value || value <= 0) {
                this.showFieldError('amount', 'Please enter a valid amount greater than 0');
                isValid = false;
            }
        } else if (fieldName === 'tenure') {
            const value = parseInt(document.getElementById('investment-tenure')?.value);
            if (!value || value <= 0) {
                this.showFieldError('tenure', 'Please enter a valid tenure in months');
                isValid = false;
            }
        } else if (fieldName === 'interest-rate') {
            const value = parseFloat(document.getElementById('investment-interest-rate')?.value);
            if (value === null || value === undefined || value < 0) {
                this.showFieldError('interest-rate', 'Please enter a valid interest rate');
                isValid = false;
            }
        } else if (fieldName === 'end-date') {
            const value = document.getElementById('investment-end-date')?.value;
            if (!value) {
                this.showFieldError('end-date', 'Please select an end date');
                isValid = false;
            }
        }

        return isValid;
    },

    /**
     * Validate name for duplicates (for FD and EPF)
     */
    validateNameDuplicate() {
        const nameInput = document.getElementById('investment-name');
        const typeInput = document.getElementById('investment-type');
        const goalInput = document.querySelector('input[name="investment-goal"]:checked');
        const isEditing = document.getElementById('investment-editing')?.value === 'true';
        
        if (!nameInput || !typeInput || !goalInput) return;
        
        const name = nameInput.value.trim();
        const type = typeInput.value;
        const goal = goalInput.value;
        
        // Only validate if name is not empty and type is selected
        if (!name || !type) {
            this.clearNameError();
            return;
        }
        
        // Only validate for FD and EPF
        if (type !== 'FD' && type !== 'EPF') {
            this.clearNameError();
            return;
        }
        
        // If editing, check if name is same as original (no validation needed)
        if (isEditing && this.editingInvestment && this.editingInvestment.name === name) {
            this.clearNameError();
            return;
        }
        
        // Check for duplicates
        const userDataKey = `${name}_${type}_${goal}`;
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        const existing = portfolioInvestments.find(inv => {
            const invKey = `${inv.name}_${inv.type}_${inv.goal}`;
            // If editing, exclude current investment from duplicate check
            if (isEditing && this.editingInvestment && parseInt(inv.id) === parseInt(this.editingInvestment.id)) {
                return false;
            }
            return invKey === userDataKey;
        });
        
        if (existing) {
            this.showNameError(type);
        } else {
            this.clearNameError();
        }
    },

    /**
     * Show/hide the emergency-fund checkbox for MFs based on sub-category.
     * ELSS has a 3-year lock-in so it can't fund an emergency — hide and
     * uncheck to prevent stale state if the user switches categories
     * after ticking the box.
     */
    toggleMfEmergencyFundVisibility() {
        const type = document.getElementById('investment-type')?.value;
        if (type !== 'MF') return;
        const cat = document.getElementById('investment-mf-category')?.value;
        const row = document.getElementById('investment-ef-row');
        const checkbox = document.getElementById('investment-is-emergency-fund');
        if (!row || !checkbox) return;
        if (cat === 'ELSS') {
            row.classList.add('hidden');
            checkbox.checked = false;
        } else {
            row.classList.remove('hidden');
        }
    },

    /**
     * Calculate amount for SHARES and GOLD
     */
    calculateAmount() {
        const type = document.getElementById('investment-type').value;
        const amountDisplay = document.getElementById('investment-calculated-amount');
        
        if (!amountDisplay) return;
        
        if (type === 'SHARES') {
            const quantity = parseFloat(document.getElementById('investment-quantity').value) || 0;
            const price = parseFloat(document.getElementById('investment-price').value) || 0;
            const currency = document.getElementById('investment-currency').value;
            const exchangeRate = this.getExchangeRate();
            
            const amount = price * quantity;
            const inrAmount = currency === 'USD' ? amount * exchangeRate : amount;
            
            amountDisplay.textContent = `₹${Utils.formatIndianNumber(Math.round(inrAmount))}`;
        } else if (type === 'GOLD') {
            const quantity = parseFloat(document.getElementById('investment-quantity').value) || 0;
            const price = parseFloat(document.getElementById('investment-price').value) || 0;

            const amount = price * quantity;
            amountDisplay.textContent = `₹${Utils.formatIndianNumber(Math.round(amount))}`;
        } else if (type === 'MF') {
            // Mutual funds: units × NAV in INR (no FX).
            const quantity = parseFloat(document.getElementById('investment-quantity').value) || 0;
            const price = parseFloat(document.getElementById('investment-price').value) || 0;
            const amount = price * quantity;
            amountDisplay.textContent = `₹${Utils.formatIndianNumber(Math.round(amount))}`;
        }
    },

    /**
     * Save investment
     */
    saveInvestment() {
        // Clear all previous errors
        this.clearAllFieldErrors();

        const type = document.getElementById('investment-type').value;
        if (!type) {
            Utils.showError('Please select an investment type');
            return;
        }

        const name = document.getElementById('investment-name')?.value.trim();
        if (!name) {
            this.showFieldError('name', 'Please enter investment name');
            return;
        }

        let goal = document.querySelector('input[name="investment-goal"]:checked').value;
        
        // EPF should always be LONG_TERM
        if (type === 'EPF') {
            goal = 'LONG_TERM';
        }
        
        const description = document.getElementById('investment-description')?.value.trim() || '';
        const trackMonthly = document.getElementById('investment-track-monthly').checked;
        // EF eligibility:
        //   - FD: yes
        //   - MF: yes, except ELSS (3-yr lock-in)
        //   - SHARES, EPF, GOLD: no (volatility / lock-in / illiquidity)
        // Coerce to false outside that envelope so a flipped type or stale
        // checkbox can't sneak through.
        const mfCategoryNow = document.getElementById('investment-mf-category')?.value;
        const efEligible = (type === 'FD')
            || (type === 'MF' && mfCategoryNow !== 'ELSS');
        const isEmergencyFund = efEligible
            ? (document.getElementById('investment-is-emergency-fund')?.checked || false)
            : false;
        const date = trackMonthly ? document.getElementById('investment-date').value : null;
        
        // Get income month attribution (for monthly investments)
        const incomeMonth = trackMonthly ? parseInt(document.getElementById('investment-income-month')?.value) : null;
        const incomeYear = trackMonthly ? parseInt(document.getElementById('investment-income-year')?.value) : null;

        let investmentData = {
            name,
            type,
            goal,
            description,
            isEmergencyFund
        };

        // Type-specific validation and data
        if (type === 'SHARES') {
            const quantity = parseInt(document.getElementById('investment-quantity').value);
            const price = parseFloat(document.getElementById('investment-price').value);
            const currency = document.getElementById('investment-currency').value;

            let hasError = false;
            if (!quantity || quantity <= 0) {
                this.showFieldError('quantity', 'Please enter a valid quantity greater than 0');
                hasError = true;
            }
            if (!price || price <= 0) {
                this.showFieldError('price', 'Please enter a valid price greater than 0');
                hasError = true;
            }
            if (hasError) return;

            investmentData.quantity = quantity;
            // Round price to 2 decimal places
            investmentData.price = Math.round(price * 100) / 100;
            investmentData.currency = currency;
        } else if (type === 'MF') {
            // Mutual funds: fractional units, INR-only NAV. Sub-category drives
            // emergency-fund eligibility hints and (future) tax-view splits.
            const quantity = parseFloat(document.getElementById('investment-quantity').value);
            const price = parseFloat(document.getElementById('investment-price').value);
            const mfCategory = document.getElementById('investment-mf-category')?.value || 'EQUITY';

            let hasError = false;
            if (!quantity || quantity <= 0) {
                this.showFieldError('quantity', 'Please enter valid units greater than 0');
                hasError = true;
            }
            if (!price || price <= 0) {
                this.showFieldError('price', 'Please enter a valid NAV greater than 0');
                hasError = true;
            }
            if (hasError) return;

            investmentData.quantity = quantity;
            // NAV typically has 4-decimal precision; preserve it.
            investmentData.price = Math.round(price * 10000) / 10000;
            investmentData.currency = 'INR';
            investmentData.mfCategory = mfCategory;
        } else if (type === 'GOLD') {
            const quantity = parseFloat(document.getElementById('investment-quantity').value);
            const price = parseFloat(document.getElementById('investment-price').value);

            let hasError = false;
            if (!quantity || quantity <= 0) {
                this.showFieldError('quantity', 'Please enter a valid quantity greater than 0');
                hasError = true;
            }
            if (!price || price <= 0) {
                this.showFieldError('price', 'Please enter a valid price per gram greater than 0');
                hasError = true;
            }
            if (hasError) return;

            investmentData.quantity = quantity;
            // Round price to 2 decimal places
            investmentData.price = Math.round(price * 100) / 100;
        } else if (type === 'EPF') {
            const amount = parseFloat(document.getElementById('investment-amount').value);

            if (!amount || amount <= 0) {
                this.showFieldError('amount', 'Please enter a valid amount greater than 0');
                return;
            }

            investmentData.amount = amount;
        } else if (type === 'FD') {
            const amount = parseFloat(document.getElementById('investment-amount').value);
            const tenure = parseInt(document.getElementById('investment-tenure').value);
            const interestRate = parseFloat(document.getElementById('investment-interest-rate').value);
            const endDate = document.getElementById('investment-end-date').value;

            let hasError = false;
            if (!amount || amount <= 0) {
                this.showFieldError('amount', 'Please enter a valid amount greater than 0');
                hasError = true;
            }
            if (!tenure || tenure <= 0) {
                this.showFieldError('tenure', 'Please enter a valid tenure in months');
                hasError = true;
            }
            if (interestRate === null || interestRate === undefined || interestRate < 0) {
                this.showFieldError('interest-rate', 'Please enter a valid interest rate');
                hasError = true;
            }
            if (!endDate) {
                this.showFieldError('end-date', 'Please select an end date');
                hasError = true;
            }
            if (hasError) return;
        
            investmentData.amount = amount;
            investmentData.tenure = tenure;
            investmentData.interestRate = interestRate;
            investmentData.endDate = endDate;
        }

        // Check if editing
        const isEditing = document.getElementById('investment-editing').value === 'true';
        const editId = document.getElementById('investment-id').value;

        if (isEditing && editId) {
            // Update existing investment
            this.updateExistingInvestment(parseInt(editId), investmentData, trackMonthly, date, incomeMonth, incomeYear);
        } else {
            // Check for duplicates and handle add/override
            const userDataKey = `${name}_${type}_${goal}`;
            
            if (trackMonthly) {
                // Add to monthly investments with income month attribution
                investmentData.date = date;
                investmentData.incomeMonth = incomeMonth;
                investmentData.incomeYear = incomeYear;
                this.addToMonthlyInvestments(investmentData);
                
                // Also sync to portfolio
                this.syncToPortfolio(investmentData, userDataKey);
                
                // Show success and close modal
                this.showSuccess();
            } else {
                // Add to portfolio only
                this.handlePortfolioAdd(investmentData, userDataKey);
            }
        }
    },
    
    /**
     * Update existing investment
     */
    updateExistingInvestment(id, data, trackMonthly, date, incomeMonth, incomeYear) {
        const isMonthly = this.editingInvestment.isMonthly;
        
        if (isMonthly) {
            // Update monthly investment (no portfolio sync - they're independent)
            const index = window.DB.monthlyInvestments.findIndex(inv => parseInt(inv.id) === id);
            if (index !== -1) {
                window.DB.monthlyInvestments[index] = {
                    ...window.DB.monthlyInvestments[index],
                    ...data,
                    date: date || window.DB.monthlyInvestments[index].date,
                    incomeMonth: incomeMonth || window.DB.monthlyInvestments[index].incomeMonth,
                    incomeYear: incomeYear || window.DB.monthlyInvestments[index].incomeYear
                };
                window.Storage.save();
                this.showSuccess();
            }
        } else {
            // Update portfolio investment
            const index = window.DB.portfolioInvestments.findIndex(inv => parseInt(inv.id) === id);
            if (index !== -1) {
                window.DB.portfolioInvestments[index] = {
                    ...window.DB.portfolioInvestments[index],
                    ...data
                };
                
                // Persist latest unit price for SHARES and MF (shared store)
                if (data.type === 'SHARES' || data.type === 'MF') {
                    this.updateSharePrice(data.name, data.price, data.currency || 'INR');
                }

                window.Storage.save();
                this.showSuccess();
            }
        }
    },
    
    /**
     * Add to monthly investments
     */
    addToMonthlyInvestments(data) {
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const newId = monthlyInvestments.length > 0 ? Math.max(...monthlyInvestments.map(inv => inv.id)) + 1 : 1;
        
        monthlyInvestments.push({
            id: newId,
            ...data
        });
        
        window.DB.monthlyInvestments = monthlyInvestments;
        window.Storage.save();
    },

    /**
     * Sync monthly investment to portfolio
     */
    syncToPortfolio(data, userDataKey) {
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        const existing = portfolioInvestments.find(inv => `${inv.name}_${inv.type}_${inv.goal}` === userDataKey);
        
        if (existing) {
            // Add to existing (SHARES, GOLD, MF — all units×price types).
            if (data.type === 'SHARES' || data.type === 'GOLD' || data.type === 'MF') {
                existing.quantity = (existing.quantity || 0) + (data.quantity || 0);
                // SHARES: 2-decimal price; MF: 4-decimal NAV; GOLD: 2-decimal price.
                if (data.type === 'MF') {
                    existing.price = Math.round(data.price * 10000) / 10000;
                } else {
                    existing.price = Math.round(data.price * 100) / 100;
                }
                if (data.type === 'SHARES') {
                    existing.currency = data.currency;
                }
                if (data.type === 'MF' && data.mfCategory) {
                    existing.mfCategory = data.mfCategory;
                }
            }
            // FD and EPF: Don't add to existing in portfolio from monthly investments

            // Propagate emergency-fund flag updates to the existing portfolio row
            // so flipping it on a monthly entry isn't silently lost.
            if (typeof data.isEmergencyFund === 'boolean') {
                existing.isEmergencyFund = data.isEmergencyFund;
            }

            // Update unit-price storage for SHARES and MF (both share the same store)
            if (data.type === 'SHARES' || data.type === 'MF') {
                this.updateSharePrice(data.name, data.price, data.currency || 'INR');
            }
        } else {
            // Add new
            const newId = portfolioInvestments.length > 0 ? Math.max(...portfolioInvestments.map(inv => inv.id)) + 1 : 1;
            const portfolioData = { ...data };
            delete portfolioData.date; // Remove date field for portfolio
            portfolioInvestments.push({
                id: newId,
                ...portfolioData
            });

            if (data.type === 'SHARES' || data.type === 'MF') {
                this.updateSharePrice(data.name, data.price, data.currency || 'INR');
            }
        }
        
        window.DB.portfolioInvestments = portfolioInvestments;
        window.Storage.save();
    },

    /**
     * Handle portfolio add with duplicate check
     */
    handlePortfolioAdd(data, userDataKey) {
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        const existing = portfolioInvestments.find(inv => `${inv.name}_${inv.type}_${inv.goal}` === userDataKey);
        
        if (existing) {
            // For FD and EPF, never allow "Add to Existing" - only override or suggest new name
            if (data.type === 'FD' || data.type === 'EPF') {
                this.showNameError(data.type);
                return;
            }

            // SHARES, GOLD, and MF can be added to existing (buy more units).
            this.pendingInvestmentData = data;
            this.showAddOrOverrideModal(existing, data);
        } else {
            // Add new
            const newId = portfolioInvestments.length > 0 ? Math.max(...portfolioInvestments.map(inv => inv.id)) + 1 : 1;
            portfolioInvestments.push({
                id: newId,
                ...data
            });

            // Persist latest unit price for SHARES and MFs (they share the
            // sharePrices store keyed by name).
            if (data.type === 'SHARES' || data.type === 'MF') {
                this.updateSharePrice(data.name, data.price, data.currency || 'INR');
            }

            window.DB.portfolioInvestments = portfolioInvestments;
            window.Storage.save();

            this.showSuccess();
        }
    },

    /**
     * Update or add share price in storage
     */
    updateSharePrice(name, price, currency) {
        const sharePrices = window.DB.sharePrices || [];
        const existing = sharePrices.find(sp => sp.name === name);
        
        if (existing) {
            // Round price to 2 decimal places
            existing.price = Math.round(price * 100) / 100;
            existing.currency = currency;
            existing.lastUpdated = new Date().toISOString();
        } else {
            sharePrices.push({
                name,
                // Round price to 2 decimal places
                price: Math.round(price * 100) / 100,
                currency,
                active: true,
                lastUpdated: new Date().toISOString()
            });
        }
        
        window.DB.sharePrices = sharePrices;
        window.Storage.save();
    },

    /**
     * Mark share price as inactive
     */
    markSharePriceInactive(name) {
        const sharePrices = window.DB.sharePrices || [];
        const sharePrice = sharePrices.find(sp => sp.name === name);
        if (sharePrice) {
            sharePrice.active = false;
            window.Storage.save();
        }
    },

    /**
     * Mark share price as active
     */
    markSharePriceActive(name) {
        const sharePrices = window.DB.sharePrices || [];
        const sharePrice = sharePrices.find(sp => sp.name === name);
        if (sharePrice) {
            sharePrice.active = true;
            window.Storage.save();
        }
    },

    /**
     * Show add or override modal
     */
    showAddOrOverrideModal(existing, newData) {
        const modal = document.getElementById('add-override-choice-modal');
        const message = document.getElementById('add-override-message');
        
        let existingInfo = '';
        if (newData.type === 'SHARES' || newData.type === 'GOLD' || newData.type === 'MF') {
            existingInfo = `Current: ${existing.quantity} units\nNew: ${newData.quantity} units`;
        } else {
            existingInfo = `Current: ₹${Utils.formatIndianNumber(existing.amount)}\nNew: ₹${Utils.formatIndianNumber(newData.amount)}`;
        }
        
        message.innerHTML = `An investment with name "${newData.name}" [${newData.type}] in ${newData.goal === 'SHORT_TERM' ? 'Short Term' : 'Long Term'} already exists.<br><br>${existingInfo}<br><br>What would you like to do?`;
        
        // Set up button handlers
        document.getElementById('add-to-existing-btn').onclick = () => {
            this.addToExisting(existing, newData);
            modal.classList.add('hidden');
        };
        
        document.getElementById('override-existing-btn').onclick = () => {
            this.showOverrideConfirmation(existing, newData);
            modal.classList.add('hidden');
        };
        
        document.getElementById('add-override-cancel-btn').onclick = () => {
            modal.classList.add('hidden');
            this.pendingInvestmentData = null;
        };
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Add to existing investment
     */
    addToExisting(existing, newData) {
        if (newData.type === 'SHARES' || newData.type === 'GOLD' || newData.type === 'MF') {
            existing.quantity = (existing.quantity || 0) + (newData.quantity || 0);
            // SHARES/GOLD: 2-decimal price; MF: 4-decimal NAV.
            if (newData.type === 'MF') {
                existing.price = Math.round(newData.price * 10000) / 10000;
                if (newData.mfCategory) existing.mfCategory = newData.mfCategory;
            } else {
                existing.price = Math.round(newData.price * 100) / 100;
            }
            if (newData.type === 'SHARES') {
                existing.currency = newData.currency;
            }
        } else {
            existing.amount = (existing.amount || 0) + (newData.amount || 0);
        }

        if (newData.type === 'SHARES' || newData.type === 'MF') {
            this.updateSharePrice(newData.name, newData.price, newData.currency || 'INR');
        }

        window.Storage.save();

        this.showSuccess();
    },

    /**
     * Show override confirmation modal
     */
    showOverrideConfirmation(existing, newData) {
        const modal = document.getElementById('override-confirm-modal');
        const message = document.getElementById('override-confirm-message');
        
        let oldInfo = '', newInfo = '';
        if (newData.type === 'SHARES' || newData.type === 'GOLD' || newData.type === 'MF') {
            oldInfo = `Quantity: ${existing.quantity}`;
            newInfo = `Quantity: ${newData.quantity}`;
        } else {
            oldInfo = `Amount: ₹${Utils.formatIndianNumber(existing.amount)}`;
            newInfo = `Amount: ₹${Utils.formatIndianNumber(newData.amount)}`;
        }
        
        message.innerHTML = `<strong>Old Value:</strong><br>${oldInfo}<br><br><strong>New Value:</strong><br>${newInfo}<br><br>Are you sure you want to override the existing investment?`;
        
        document.getElementById('override-proceed-btn').onclick = () => {
            this.overrideExisting(existing, newData);
            modal.classList.add('hidden');
        };
        
        document.getElementById('override-cancel-btn').onclick = () => {
            modal.classList.add('hidden');
        };
        
        modal.classList.remove('hidden');
    },

    /**
     * Override existing investment
     */
    overrideExisting(existing, newData) {
        Object.assign(existing, newData);

        if (newData.type === 'SHARES' || newData.type === 'MF') {
            this.updateSharePrice(newData.name, newData.price, newData.currency || 'INR');
        }

        window.Storage.save();

        this.showSuccess();
    },
    
    /**
     * Edit investment
     */
    editInvestment(id, isMonthly) {
        const investments = isMonthly ? window.DB.monthlyInvestments : window.DB.portfolioInvestments;
        const investment = investments.find(inv => parseInt(inv.id) === parseInt(id));
        
        if (!investment) {
            Utils.showError('Investment not found');
            return;
        }
        
        this.editingInvestment = { ...investment, isMonthly };
        
        document.getElementById('investment-modal-title').textContent = 'Update Investment';
        document.getElementById('investment-id').value = id;
        document.getElementById('investment-is-monthly').value = isMonthly ? 'true' : 'false';
        document.getElementById('investment-editing').value = 'true';
        
        // Set goal - EPF should always be LONG_TERM
        const goalToSet = investment.type === 'EPF' ? 'LONG_TERM' : investment.goal;
        document.querySelector(`input[name="investment-goal"][value="${goalToSet}"]`).checked = true;
        
        // Disable goal radio buttons for all investments (cannot move between short/long term)
        document.querySelectorAll('input[name="investment-goal"]').forEach(radio => {
            radio.disabled = true;
        });
        
        // Set type
        document.getElementById('investment-type').value = investment.type;
        document.getElementById('investment-type').disabled = true; // Type cannot be changed
        
        // Trigger type change to show fields
        this.handleTypeChange();
        
        document.getElementById('investment-modal').classList.remove('hidden');
    },

    /**
     * Populate edit fields
     */
    populateEditFields(investment) {
        document.getElementById('investment-name').value = investment.name;

        if (investment.type === 'SHARES') {
            document.getElementById('investment-quantity').value = investment.quantity;

            // For portfolio investments, use latest price from storage; for monthly, use historical price
            if (investment.isMonthly) {
                document.getElementById('investment-price').value = investment.price;
                document.getElementById('investment-currency').value = investment.currency;
            } else {
                const latestSharePrice = this.getLatestSharePrice(investment.name);
                document.getElementById('investment-price').value = latestSharePrice ? latestSharePrice.price : investment.price;
                document.getElementById('investment-currency').value = latestSharePrice ? latestSharePrice.currency : investment.currency;
            }
            this.calculateAmount();
        } else if (investment.type === 'MF') {
            // Same shape as SHARES (units + price) plus the sub-category.
            // We reuse the SHARES sharePrices store for latest NAV updates so
            // a manual NAV refresh works without a separate code path.
            document.getElementById('investment-quantity').value = investment.quantity;
            const latestSharePrice = this.getLatestSharePrice(investment.name);
            document.getElementById('investment-price').value = latestSharePrice ? latestSharePrice.price : investment.price;
            const mfCatEl = document.getElementById('investment-mf-category');
            if (mfCatEl) mfCatEl.value = investment.mfCategory || 'EQUITY';
            // Sync EF row visibility based on the sub-category we just set.
            this.toggleMfEmergencyFundVisibility();
            this.calculateAmount();
        } else if (investment.type === 'GOLD') {
            document.getElementById('investment-quantity').value = investment.quantity;
            
            // For portfolio investments, use latest gold rate; for monthly, use historical price
            if (investment.isMonthly) {
                document.getElementById('investment-price').value = investment.price;
            } else {
                const goldRate = this.getGoldRate();
                document.getElementById('investment-price').value = goldRate || investment.price;
            }
            this.calculateAmount();
        } else if (investment.type === 'EPF') {
            document.getElementById('investment-amount').value = investment.amount;
        } else if (investment.type === 'FD') {
            document.getElementById('investment-amount').value = investment.amount;
            document.getElementById('investment-tenure').value = investment.tenure;
            document.getElementById('investment-interest-rate').value = investment.interestRate;
            document.getElementById('investment-end-date').value = investment.endDate;
        }
        
        document.getElementById('investment-description').value = investment.description || '';

        // Restore emergency-fund flag (defaults to false for legacy investments).
        const efCheckbox = document.getElementById('investment-is-emergency-fund');
        if (efCheckbox) efCheckbox.checked = !!investment.isEmergencyFund;

        if (investment.isMonthly) {
            document.getElementById('investment-track-monthly').checked = true;
            document.getElementById('investment-track-monthly').disabled = true;
            document.getElementById('investment-date').value = investment.date;
            
            // Set income month attribution
            const incomeMonthSelect = document.getElementById('investment-income-month');
            const incomeYearInput = document.getElementById('investment-income-year');
            const incomeMonthContainer = document.getElementById('investment-income-month-container');
            
            if (incomeMonthSelect && incomeYearInput) {
                if (investment.incomeMonth && investment.incomeYear) {
                    // Use stored income month
                    incomeMonthSelect.value = investment.incomeMonth;
                    incomeYearInput.value = investment.incomeYear;
                } else {
                    // Fallback: use investment date month (backward compatibility)
                    const invDate = new Date(investment.date);
                    incomeMonthSelect.value = invDate.getMonth() + 1;
                    incomeYearInput.value = invDate.getFullYear();
                }
            }
            if (incomeMonthContainer) {
                incomeMonthContainer.classList.remove('hidden');
            }
        } else {
            document.getElementById('investment-track-monthly').checked = false;
            document.getElementById('investment-track-monthly').disabled = true;
            document.getElementById('investment-date-container').classList.add('hidden');
            
            // Hide income month container for portfolio investments
            const incomeMonthContainer = document.getElementById('investment-income-month-container');
            if (incomeMonthContainer) {
                incomeMonthContainer.classList.add('hidden');
            }
        }
    },

    /**
     * Confirm delete
     */
    confirmDelete(id, isMonthly) {
        const investments = isMonthly ? window.DB.monthlyInvestments : window.DB.portfolioInvestments;
        const investment = investments.find(inv => parseInt(inv.id) === parseInt(id));
        
        if (!investment) {
            Utils.showError('Investment not found');
            return;
        }
        
        const modal = document.getElementById('delete-confirm-modal');
        const message = document.getElementById('delete-confirm-message');
        
        // Get required data for calculations
        const exchangeRate = this.getExchangeRate();
        const goldRate = this.getGoldRate();
        const sharePrices = window.DB.sharePrices || [];
        
        // Build detailed info based on investment type
        let detailsHTML = '';
        let amount = 0;
        
        // Type badge - Removed since items are already grouped by type
        const typeBadge = ``;
        
        if (investment.type === 'SHARES') {
            // For monthly investments, use their own price; for portfolio, use latest share price
            const price = isMonthly ? investment.price : (this.getLatestSharePrice(investment.name)?.price || investment.price);
            const currency = isMonthly ? (investment.currency || 'INR') : (this.getLatestSharePrice(investment.name)?.currency || investment.currency || 'INR');
            
            // Use correct calculation method based on investment type
            amount = isMonthly ? this.calculateMonthlyAmount(investment) : this.calculatePortfolioAmount(investment, exchangeRate, goldRate, sharePrices);
            
            detailsHTML = `
                <div class="text-left space-y-2 bg-gray-50 p-4 rounded-lg">
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800 text-lg">${investment.name}</span>
                            ${typeBadge}
                        </div>
                        <span class="font-bold text-yellow-700 text-lg">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="font-semibold text-gray-700">Quantity:</span> <span class="text-gray-600">${investment.quantity}</span></div>
                        <div class="text-right"><span class="font-semibold text-gray-700">Price:</span> <span class="text-gray-600">${currency === 'USD' ? '$' : '₹'}${Utils.formatIndianNumber(price)}</span></div>
                        ${currency === 'USD' ? `<div class="col-span-2"><span class="font-semibold text-gray-700">USD Value:</span> <span class="text-gray-600">$${Utils.formatIndianNumber(investment.quantity * price)}</span></div>` : ''}
                        ${isMonthly && investment.date ? `<div class="col-span-2"><span class="font-semibold text-gray-700">Date:</span> <span class="text-gray-600">${Utils.formatLocalDate(new Date(investment.date))}</span></div>` : ''}
                    </div>
                    ${investment.description ? `<div class="text-sm text-gray-600 pt-2 border-t border-gray-200">${investment.description}</div>` : ''}
                </div>
            `;
        } else if (investment.type === 'MF') {
            // Same shape as the SHARES details — units + NAV + computed amount.
            const navRecord = isMonthly ? null : sharePrices.find(sp => sp.name === investment.name && sp.active);
            const nav = navRecord ? navRecord.price : investment.price;
            amount = isMonthly ? this.calculateMonthlyAmount(investment) : this.calculatePortfolioAmount(investment, exchangeRate, goldRate, sharePrices);

            detailsHTML = `
                <div class="text-left space-y-2 bg-gray-50 p-4 rounded-lg">
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800 text-lg">${investment.name}</span>
                            ${typeBadge}
                            ${investment.mfCategory ? `<span class="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold uppercase">${investment.mfCategory}</span>` : ''}
                        </div>
                        <span class="font-bold text-yellow-700 text-lg">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="font-semibold text-gray-700">Units:</span> <span class="text-gray-600">${investment.quantity}</span></div>
                        <div class="text-right"><span class="font-semibold text-gray-700">NAV:</span> <span class="text-gray-600">₹${Utils.formatIndianNumber(parseFloat(nav).toFixed(4))}</span></div>
                        ${isMonthly && investment.date ? `<div class="col-span-2"><span class="font-semibold text-gray-700">Date:</span> <span class="text-gray-600">${Utils.formatLocalDate(new Date(investment.date))}</span></div>` : ''}
                    </div>
                    ${investment.description ? `<div class="text-sm text-gray-600 pt-2 border-t border-gray-200">${investment.description}</div>` : ''}
                </div>
            `;
        } else if (investment.type === 'GOLD') {
            // Use correct calculation method based on investment type
            amount = isMonthly ? this.calculateMonthlyAmount(investment) : this.calculatePortfolioAmount(investment, exchangeRate, goldRate, sharePrices);

            detailsHTML = `
                <div class="text-left space-y-2 bg-gray-50 p-4 rounded-lg">
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800 text-lg">${investment.name}</span>
                            ${typeBadge}
                        </div>
                        <span class="font-bold text-yellow-700 text-lg">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="font-semibold text-gray-700">Quantity:</span> <span class="text-gray-600">${investment.quantity}g</span></div>
                        <div class="text-right"><span class="font-semibold text-gray-700">Price/gram:</span> <span class="text-gray-600">₹${Utils.formatIndianNumber(investment.price)}</span></div>
                        ${isMonthly && investment.date ? `<div class="col-span-2"><span class="font-semibold text-gray-700">Date:</span> <span class="text-gray-600">${Utils.formatLocalDate(new Date(investment.date))}</span></div>` : ''}
                    </div>
                    ${investment.description ? `<div class="text-sm text-gray-600 pt-2 border-t border-gray-200">${investment.description}</div>` : ''}
                </div>
            `;
        } else if (investment.type === 'FD') {
            amount = investment.amount;
            
            detailsHTML = `
                <div class="text-left space-y-2 bg-gray-50 p-4 rounded-lg">
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800 text-lg">${investment.name}</span>
                            ${typeBadge}
                        </div>
                        <span class="font-bold text-yellow-700 text-lg">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="font-semibold text-gray-700">Tenure:</span> <span class="text-gray-600">${investment.tenure} months</span></div>
                        <div class="text-right"><span class="font-semibold text-gray-700">Interest:</span> <span class="text-gray-600">${investment.interestRate}%</span></div>
                        <div class="col-span-2"><span class="font-semibold text-gray-700">End Date:</span> <span class="text-gray-600">${Utils.formatLocalDate(new Date(investment.endDate))}</span></div>
                        ${isMonthly && investment.date ? `<div class="col-span-2"><span class="font-semibold text-gray-700">Date Added:</span> <span class="text-gray-600">${Utils.formatLocalDate(new Date(investment.date))}</span></div>` : ''}
                    </div>
                    ${investment.description ? `<div class="text-sm text-gray-600 pt-2 border-t border-gray-200">${investment.description}</div>` : ''}
                </div>
            `;
        } else if (investment.type === 'EPF') {
            amount = investment.amount;
            
            detailsHTML = `
                <div class="text-left space-y-2 bg-gray-50 p-4 rounded-lg">
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800 text-lg">${investment.name}</span>
                            ${typeBadge}
                        </div>
                        <span class="font-bold text-yellow-700 text-lg">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                    </div>
                    ${isMonthly && investment.date ? `<div class="text-sm pt-2 border-t border-gray-200"><span class="font-semibold text-gray-700">Date:</span> <span class="text-gray-600">${Utils.formatLocalDate(new Date(investment.date))}</span></div>` : ''}
                    ${investment.description ? `<div class="text-sm text-gray-600 pt-2 ${isMonthly && investment.date ? '' : 'border-t border-gray-200'}">${investment.description}</div>` : ''}
                </div>
            `;
        }
        
        // Warning message based on investment type
        const warningMessage = isMonthly ? `
            <div class="mt-4 space-y-2">
                <div class="flex items-center justify-center gap-2 text-red-600 font-semibold">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <span>This action cannot be recovered!</span>
                </div>
                <div class="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800">
                    <p class="font-semibold mb-1">⚠️ Portfolio Update Required</p>
                    <p>This monthly investment was added to your Portfolio. After deletion, you must manually update your Portfolio for <strong>${investment.name} [${investment.type}]</strong> to keep your current holdings accurate.</p>
                </div>
            </div>
        ` : `
            <div class="mt-4 flex items-center justify-center gap-2 text-red-600 font-semibold">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                <span>This action cannot be recovered!</span>
            </div>
        `;
        
        message.innerHTML = `
            <div class="mb-4">
                <p class="text-center text-gray-700 font-semibold mb-4">Are you sure you want to delete this investment?</p>
                ${detailsHTML}
                ${warningMessage}
            </div>
        `;
        
        document.getElementById('delete-confirm-btn').onclick = () => {
            this.deleteInvestment(id, isMonthly);
            modal.classList.add('hidden');
        };
        
        document.getElementById('delete-cancel-btn').onclick = () => {
            modal.classList.add('hidden');
        };
        
        modal.classList.remove('hidden');
    },

    /**
     * Delete investment
     */
    deleteInvestment(id, isMonthly) {
        const parsedId = parseInt(id);
        
        if (isMonthly) {
            window.DB.monthlyInvestments = window.DB.monthlyInvestments.filter(inv => parseInt(inv.id) !== parsedId);
            } else {
            const investment = window.DB.portfolioInvestments.find(inv => parseInt(inv.id) === parsedId);
            window.DB.portfolioInvestments = window.DB.portfolioInvestments.filter(inv => parseInt(inv.id) !== parsedId);
            
            // SHARES and MF both write to the sharePrices store keyed by name,
            // so when the last entry with a given name is deleted, mark it
            // inactive so it stops surfacing in the price-update modal.
            if (investment && (investment.type === 'SHARES' || investment.type === 'MF')) {
                const hasOtherEntries = window.DB.portfolioInvestments.some(inv =>
                    (inv.type === 'SHARES' || inv.type === 'MF') && inv.name === investment.name
                );

                if (!hasOtherEntries) {
                    this.markSharePriceInactive(investment.name);
                }
            }
        }
        
            window.Storage.save();
        Utils.showSuccess('Investment deleted successfully');
            this.render();
    },

    /**
     * Open share price management modal
     */
    openSharePriceModal() {
        const sharePrices = window.DB.sharePrices || [];
        const activeShares = sharePrices.filter(sp => sp.active);
        
        // Don't open modal if no shares exist
        if (activeShares.length === 0) {
            Utils.showInfo('No shares in portfolio yet');
            return;
        }
        
        const modal = document.getElementById('share-price-modal');
        const list = document.getElementById('share-prices-list');
        
        // Check portfolio investments once
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        
        list.innerHTML = activeShares.map(share => {
            // Existence check covers both SHARES and MF (same sharePrices store).
            const existsInPortfolio = portfolioInvestments.some(inv =>
                (inv.type === 'SHARES' || inv.type === 'MF') && inv.name === share.name
            );
            
            return `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200" data-share="${share.name}">
                <!-- Line 1: Name (left), Actions (right) -->
                <div class="flex justify-between items-center mb-2">
                    <!-- Name (left) -->
                    <span class="font-semibold text-gray-800 text-sm">${share.name}</span>
                    
                    <!-- Actions (right) -->
                    <div class="flex gap-2">
                        <button onclick="Investments.openEditPriceModal('${share.name}', ${share.price}, '${share.currency}')" 
                                class="text-blue-600 hover:text-blue-800 transition-all p-1" 
                                title="Edit Price">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="Investments.reloadSingleSharePrice('${share.name}')" 
                                class="reload-share-btn text-yellow-600 hover:text-yellow-800 transition-all p-1" 
                                title="Reload Price">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                        </button>
                        <button onclick="Investments.deleteSharePrice('${share.name}')" 
                                class="p-1 ${existsInPortfolio ? 'text-gray-400 cursor-not-allowed' : 'text-red-500 hover:text-red-700'}" 
                                title="${existsInPortfolio ? 'Cannot delete - exists in portfolio' : 'Delete'}"
                                ${existsInPortfolio ? 'disabled' : ''}>
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Line 2: Updated date (left), Price (right) -->
                <div class="flex justify-between items-center">
                    <!-- Updated date (left) -->
                    <p class="text-xs text-gray-500">Updated: ${new Date(share.lastUpdated).toLocaleString()}</p>
                    
                    <!-- Price (right, dark green) -->
                    <span class="share-price text-sm font-bold text-green-700" data-currency="${share.currency}">
                        ${share.currency === 'USD' ? '$' : '₹'}${Utils.formatIndianNumber(share.price.toFixed(2))}
                    </span>
                </div>
            </div>
        `;
        }).join('');
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close share price modal
     */
    closeSharePriceModal() {
        document.getElementById('share-price-modal').classList.add('hidden');
    },

    /**
     * Fetch stock tickers from LLM for all shares
     * Step 1: Convert stock names to ticker symbols
     */
    async fetchTickersFromLLM() {
        const shareNames = window.DB.sharePrices
            .filter(s => s.active)
            .map(s => s.name);
        
        if (shareNames.length === 0) {
            throw new Error('No active shares found');
        }

        // Build prompt for LLM
        const prompt = `You are a stock market expert. I need stock ticker symbols for the following companies:

${shareNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')}

For EACH company, provide:
- ticker: Official stock ticker symbol
- exchange: NSE (for Indian stocks) or NASDAQ/NYSE (for US stocks)
- currency: INR or USD

IMPORTANT RULES:
- For Indian stocks: Use NSE ticker with .NS suffix (e.g., "RELIANCE.NS", "TCS.NS")
- For US stocks: Use standard ticker WITHOUT suffix (e.g., "AAPL", "MSFT")
- If a stock exists on both NSE and BSE, prefer NSE
- If you're unsure about a company, set ticker to null

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "Company Name 1": {
    "ticker": "SYMBOL.NS",
    "exchange": "NSE",
    "currency": "INR"
  },
  "Company Name 2": {
    "ticker": "AAPL",
    "exchange": "NASDAQ",
    "currency": "USD"
  }
}`;

        try {
            // Use existing AI framework with priority order
            const response = await window.AIProvider.call(prompt, null);
            
            // Parse JSON response (handle markdown code blocks if present)
            let cleanedResponse = response.trim();
            if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            
            const tickerData = JSON.parse(cleanedResponse);
            
            return tickerData;
            
        } catch (error) {
            throw new Error(`Failed to fetch tickers: ${error.message}`);
        }
    },

    /**
     * Generic JSON GET. Uses CapacitorHttp on native (avoids CORS) and falls
     * back to fetch() on web. Throws an Error with a `.status` property on
     * non-2xx so callers can detect transient (429/5xx) failures.
     */
    async _httpGetJson(url) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
            const response = await window.Capacitor.Plugins.CapacitorHttp.get({ url, headers });
            if (response.status < 200 || response.status >= 300) {
                const err = new Error(`HTTP ${response.status}`);
                err.status = response.status;
                throw err;
            }
            return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        }
        const response = await fetch(url, { headers });
        if (!response.ok) {
            const err = new Error(`HTTP ${response.status}`);
            err.status = response.status;
            throw err;
        }
        return response.json();
    },

    /**
     * Single Yahoo Finance quote fetch for a ticker. Tries query1 then query2
     * (the two hosts fail independently under load / rate-limiting). Returns
     * { price, currency, symbol } so callers can also learn the real currency
     * (USD vs INR) straight from the exchange rather than guessing.
     */
    async _fetchQuoteOnce(ticker) {
        const hosts = ['query1', 'query2'];
        let lastErr;
        for (const host of hosts) {
            const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
            try {
                const data = await this._httpGetJson(url);
                const meta = data?.chart?.result?.[0]?.meta;
                const price = meta?.regularMarketPrice;
                if (price == null) throw new Error('Price not found in response');
                return {
                    price: Math.round(price * 100) / 100,
                    currency: meta.currency || null,
                    symbol: meta.symbol || ticker,
                };
            } catch (e) {
                lastErr = e;
                // Only fall through to the other host on transient errors.
                const transient = e.status && (e.status === 429 || (e.status >= 500 && e.status < 600));
                if (!transient && host === 'query1' && hosts.length > 1) {
                    // Non-transient (e.g. 404 = bad ticker) — no point trying the
                    // other host with the same ticker, bail immediately.
                    throw e;
                }
            }
        }
        throw lastErr || new Error('Quote fetch failed');
    },

    /**
     * Fetch a quote with one automatic retry on transient (429/5xx) errors.
     * Returns { price, currency, symbol }.
     */
    async fetchQuoteFromYahoo(ticker) {
        try {
            return await this._fetchQuoteOnce(ticker);
        } catch (error) {
            const isTransient = error.status &&
                (error.status === 429 || (error.status >= 500 && error.status < 600));
            if (!isTransient) throw error;
            console.warn(`Transient Yahoo error (${error.status}) for ${ticker}; retrying in 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            return await this._fetchQuoteOnce(ticker);
        }
    },

    /**
     * Back-compat: return just the price number.
     */
    async fetchPriceFromYahoo(ticker) {
        const quote = await this.fetchQuoteFromYahoo(ticker);
        return quote.price;
    },

    /**
     * Resolve a company name to candidate tickers via Yahoo's symbol-search
     * endpoint. This is what makes BSE-only stocks (e.g. Eco Recycling →
     * EORECO.BO) and US stocks (Salesforce → CRM) resolve reliably without
     * depending on the LLM guessing the exact suffix. Returns an array of
     * symbol strings, ranked NSE → BSE → US/other.
     */
    async searchYahooSymbol(name) {
        const q = encodeURIComponent(name);
        const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0`;
        const data = await this._httpGetJson(url);
        const quotes = (data?.quotes || []).filter(quote =>
            quote.symbol && (quote.quoteType === 'EQUITY' || quote.quoteType === 'ETF' || quote.quoteType === 'MUTUALFUND')
        );
        // Rank: .NS (NSE) first, then .BO (BSE), then plain US tickers, then rest.
        const rank = (sym) => sym.endsWith('.NS') ? 0 : sym.endsWith('.BO') ? 1 : (sym.includes('.') ? 3 : 2);
        return quotes
            .map(quote => quote.symbol)
            .sort((a, b) => rank(a) - rank(b));
    },

    /**
     * Update one share's price from the market, robustly.
     *
     * Strategy (stops at first ticker that returns a price):
     *   1. The share's already-known working ticker (if any).
     *   2. Yahoo symbol-search candidates for the share name (NSE → BSE → US).
     *
     * On success it persists the WORKING ticker + currency + exchange back onto
     * the share, so subsequent reloads hit step 1 directly. Throws if every
     * candidate fails. Mutates `share` but does NOT save — caller saves.
     */
    async _updateShareFromMarket(share) {
        const candidates = [];
        const push = (t) => { if (t && !candidates.includes(t)) candidates.push(t); };

        // 1. Cached working ticker first.
        push(share.ticker);

        // 2. Symbol search by name (covers BSE-only + US + suffix mistakes).
        try {
            const found = await this.searchYahooSymbol(share.name);
            found.forEach(push);
        } catch (e) {
            console.warn(`Yahoo symbol search failed for "${share.name}":`, e.message);
        }

        if (candidates.length === 0) {
            throw new Error('No ticker found (symbol search returned nothing)');
        }

        let lastErr;
        for (const ticker of candidates) {
            try {
                const quote = await this.fetchQuoteFromYahoo(ticker);
                share.ticker = ticker;
                share.price = quote.price;
                if (quote.currency) {
                    share.currency = quote.currency === 'USD' ? 'USD' : 'INR';
                }
                share.exchange = ticker.endsWith('.NS') ? 'NSE'
                    : ticker.endsWith('.BO') ? 'BSE'
                    : (share.currency === 'USD' ? 'US' : (share.exchange || ''));
                share.lastUpdated = new Date().toISOString();
                return quote.price;
            } catch (e) {
                lastErr = e;
                console.warn(`Ticker ${ticker} failed for "${share.name}":`, e.message);
            }
        }
        throw lastErr || new Error('All ticker candidates failed');
    },

    /**
     * Reload all share prices (LLM + Yahoo Finance)
     * Step 1: Fetch tickers from LLM (if not already stored)
     * Step 2: Fetch prices from Yahoo Finance
     */
    async reloadAllSharePrices() {
        const sharePrices = window.DB.sharePrices || [];
        const activeShares = sharePrices.filter(sp => sp.active);
        
        if (activeShares.length === 0) return;
        
        // Suppress AIProvider info messages (progress modal handles feedback)
        if (window.AIProvider) {
            window.AIProvider.suppressInfoMessages = true;
        }
        
        // Show loading state on global button
        const globalBtn = document.getElementById('global-reload-btn');
        const originalBtnHTML = globalBtn.innerHTML;
        globalBtn.disabled = true;
        globalBtn.innerHTML = `
            <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span>Reloading...</span>
        `;
        
        // Show loading state for all shares
        activeShares.forEach(share => {
            const shareDiv = document.querySelector(`[data-share="${share.name}"]`);
            if (shareDiv) {
                const priceSpan = shareDiv.querySelector('.share-price');
                if (priceSpan) {
                    priceSpan.innerHTML = '<span class="loading-dots">...</span>';
                }
                
                // Animate reload button
                const reloadBtn = shareDiv.querySelector('.reload-share-btn svg');
                if (reloadBtn) {
                    reloadBtn.classList.add('animate-spin');
                }
                
                // Hide any previous errors
                const errorDiv = shareDiv.querySelector('.share-error');
                if (errorDiv) {
                    errorDiv.classList.add('hidden');
                }
            }
        });
        
        try {
            Utils.showProgressModal(`📊 Fetching stock prices...<br><span class="text-sm text-gray-600">Updating ${activeShares.length} stock(s)</span>`, true);

            // Each share resolves its own ticker via cached-ticker → Yahoo
            // symbol-search (NSE → BSE → US), so we no longer need a separate
            // LLM ticker step. This is what makes BSE-only and US stocks work.
            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            for (let i = 0; i < activeShares.length; i++) {
                const share = activeShares[i];

                Utils.updateProgressModal(`📊 Fetching stock prices...<br><span class="text-sm text-gray-600">Updating ${share.name} (${i + 1}/${activeShares.length})</span>`, true);

                try {
                    await this._updateShareFromMarket(share);
                    this.updatePortfolioSharePrice(share.name, share.price, share.currency);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(share.name);

                    const shareDiv = document.querySelector(`[data-share="${share.name}"]`);
                    if (shareDiv) {
                        const priceSpan = shareDiv.querySelector('.share-price');
                        if (priceSpan) {
                            priceSpan.innerHTML = `<span class="text-xs text-red-600">Not found</span>`;
                        }
                        const errorDiv = shareDiv.querySelector('.share-error');
                        if (errorDiv) {
                            errorDiv.textContent = `Couldn't fetch price: ${error.message}`;
                            errorDiv.classList.remove('hidden');
                        }
                    }
                }
            }

            window.Storage.save();
            
            // Re-render the modal with updated prices
            this.openSharePriceModal();
            
            // Restore global button
            globalBtn.disabled = false;
            globalBtn.innerHTML = originalBtnHTML;
            
            // Show result in progress modal
            if (successCount > 0 && errorCount === 0) {
                // All success
                Utils.showProgressSuccess(`✅ All prices updated!<br><span class="text-sm text-gray-600">${successCount} stock(s) updated successfully</span>`, true);
            } else if (successCount > 0 && errorCount > 0) {
                // Partial success
                Utils.showProgressError(`⚠️ Partially completed<br><span class="text-sm">${successCount} updated, ${errorCount} failed</span><br><span class="text-xs text-red-600">${errors.join(', ')}</span>`);
            } else {
                // All failed
                Utils.showProgressError(`❌ Update failed<br><span class="text-sm">All ${errorCount} stock(s) failed</span><br><span class="text-xs text-gray-300">Check inline errors below each stock</span>`);
            }
            
            // Re-render portfolio to reflect updated prices
            this.render();
            
        } catch (error) {
            // Restore global button
            globalBtn.disabled = false;
            globalBtn.innerHTML = originalBtnHTML;
            
            // Re-render modal to restore prices
            this.openSharePriceModal();
            
            // Show error in progress modal
            Utils.showProgressError(`❌ Failed to reload prices<br><span class="text-sm text-gray-300">${error.message}</span>`);
        } finally {
            // Re-enable AIProvider info messages
            if (window.AIProvider) {
                window.AIProvider.suppressInfoMessages = false;
            }
        }
    },

    /**
     * Reload single share price (LLM + Yahoo Finance).
     *
     * Optimization: when the ticker is already cached on the share record,
     * we skip the LLM call entirely (saves 1 AI call per reload, which adds
     * up fast). Tickers rarely change; users can clear them via Edit if needed.
     *
     * Concurrency: a per-share lock prevents duplicate parallel reloads when
     * the user taps the reload button multiple times.
     */
    async reloadSingleSharePrice(shareName) {
        const shareDiv = document.querySelector(`[data-share="${shareName}"]`);
        if (!shareDiv) return;

        // Concurrency guard — second tap while a reload is running is a no-op
        if (this._sharePriceReloadsInFlight.has(shareName)) {
            console.warn(`Reload already in progress for ${shareName}; ignoring duplicate request.`);
            return;
        }
        this._sharePriceReloadsInFlight.add(shareName);

        const priceSpan = shareDiv.querySelector('.share-price');
        const reloadBtn = shareDiv.querySelector('.reload-share-btn svg');
        const originalPrice = priceSpan.innerHTML;

        // Show loading state
        priceSpan.innerHTML = '<span class="loading-dots">...</span>';
        if (reloadBtn) reloadBtn.classList.add('animate-spin');

        // Hide any previous errors
        const errorDiv = shareDiv.querySelector('.share-error');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }

        // Suppress AIProvider info messages (progress modal handles feedback)
        if (window.AIProvider) {
            window.AIProvider.suppressInfoMessages = true;
        }

        // Show progress modal
        Utils.showProgressModal(`📊 Updating ${shareName}...<br><span class="text-sm text-gray-600">Fetching latest price</span>`, true);

        // Find share in DB
        const sharePrices = window.DB.sharePrices || [];
        const share = sharePrices.find(sp => sp.name === shareName);

        if (!share) {
            priceSpan.innerHTML = originalPrice;
            if (reloadBtn) reloadBtn.classList.remove('animate-spin');
            Utils.closeProgressModal();
            this._sharePriceReloadsInFlight.delete(shareName);
            return;
        }

        try {
            // Resolve ticker + price in one robust pass: tries the cached
            // ticker, then Yahoo symbol-search candidates (NSE → BSE → US), so
            // BSE-only stocks (Eco Recycling → EORECO.BO) and US stocks
            // (Salesforce → CRM) work without depending on an LLM guess.
            Utils.updateProgressModal(`📊 Fetching price from market...<br><span class="text-sm text-gray-600">Updating ${shareName}</span>`, true);
            const newPrice = await this._updateShareFromMarket(share);

            // Also update portfolio entries with this share
            this.updatePortfolioSharePrice(share.name, share.price, share.currency);

            window.Storage.save();
            
            // Update display
            const currency = share.currency === 'USD' ? '$' : '₹';
            priceSpan.innerHTML = `${currency}${Utils.formatIndianNumber(share.price.toFixed(2))}`;
            
            // Update timestamp
            const timestampDiv = shareDiv.querySelector('.text-xs.text-gray-500');
            if (timestampDiv) {
                timestampDiv.textContent = `Updated: ${new Date(share.lastUpdated).toLocaleString()}`;
            }
            
            // Show success
            Utils.showProgressSuccess(`✅ Price updated!<br><span class="text-sm text-gray-600">${shareName}: ${currency}${newPrice}</span>`, true);
            
            // Re-render portfolio to reflect updated price
            this.render();
            
        } catch (error) {
            // Restore original price
            priceSpan.innerHTML = originalPrice;
            
            // Show error in progress modal
            Utils.showProgressError(`❌ Failed to update ${shareName}<br><span class="text-sm text-gray-300">${error.message}</span>`);
            
            // Show inline error message below the share item
            if (errorDiv) {
                errorDiv.textContent = `Unable to fetch price. ${error.message}`;
                errorDiv.classList.remove('hidden');
            }
        } finally {
            // Remove loading animation
            if (reloadBtn) reloadBtn.classList.remove('animate-spin');

            // Re-enable AIProvider info messages
            if (window.AIProvider) {
                window.AIProvider.suppressInfoMessages = false;
            }

            // Release the per-share concurrency lock
            this._sharePriceReloadsInFlight.delete(shareName);
        }
    },

    /**
     * Delete share price from storage
     */
    deleteSharePrice(shareName) {
        // Block delete if any SHARES or MF entry still uses this name.
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        const existsInPortfolio = portfolioInvestments.some(inv =>
            (inv.type === 'SHARES' || inv.type === 'MF') && inv.name === shareName
        );
        
        if (existsInPortfolio) {
            Utils.showError(`Cannot delete "${shareName}" - it exists in your portfolio. Remove it from portfolio first.`);
            return;
        }
        
        const sharePrices = window.DB.sharePrices || [];
        const index = sharePrices.findIndex(sp => sp.name === shareName);
        
        if (index !== -1) {
            sharePrices.splice(index, 1);
            window.DB.sharePrices = sharePrices;
            window.Storage.save();
            
            Utils.showSuccess('Share price removed from tracking');
            this.openSharePriceModal(); // Refresh the modal
        }
    },

    /**
     * Open edit price modal
     */
    openEditPriceModal(shareName, currentPrice, currency) {
        document.getElementById('edit-share-name').textContent = shareName;
        document.getElementById('edit-share-currency').textContent = currency === 'USD' ? '$' : '₹';
        // Format price to 2 decimals
        document.getElementById('edit-share-price-input').value = parseFloat(currentPrice).toFixed(2);
        document.getElementById('edit-share-price-error').textContent = '';
        document.getElementById('edit-share-price-error').classList.add('hidden');
        
        // Store current editing share
        this.editingShare = { name: shareName, currency: currency };
        
        document.getElementById('edit-share-price-modal').classList.remove('hidden');
    },

    /**
     * Close edit price modal
     */
    closeEditPriceModal() {
        document.getElementById('edit-share-price-modal').classList.add('hidden');
        this.editingShare = null;
    },

    /**
     * Save edited share price
     */
    saveEditedSharePrice() {
        const priceInput = document.getElementById('edit-share-price-input');
        const errorDiv = document.getElementById('edit-share-price-error');
        const newPrice = parseFloat(priceInput.value);
        
        // Validation
        if (!priceInput.value || isNaN(newPrice) || newPrice <= 0) {
            errorDiv.textContent = 'Price must be greater than 0';
            errorDiv.classList.remove('hidden');
            priceInput.focus();
            return;
        }
        
        // Update price in storage
        const sharePrices = window.DB.sharePrices || [];
        const share = sharePrices.find(sp => sp.name === this.editingShare.name);
        
        if (share) {
            // Round to 2 decimal places for DB storage
            share.price = Math.round(newPrice * 100) / 100;
            share.lastUpdated = new Date().toISOString();
            
            // Also update portfolio entries with this share
            this.updatePortfolioSharePrice(share.name, share.price, share.currency);
            
            window.Storage.save();
            
            Utils.showSuccess('Share price updated!<br>Portfolio values recalculated');
            
            // Close edit modal
            this.closeEditPriceModal();
            
            // Refresh share price modal
            this.openSharePriceModal();
            
            // Re-render portfolio to reflect updated price
            this.render();
        } else {
            Utils.showError('Share not found');
        }
    },

    /**
     * Open exchange rate modal
     */
    openExchangeRateModal() {
        const currentRate = this.getExchangeRate();
        const freshness = this.getRateFreshness(window.DB.exchangeRate);
        document.getElementById('current-rate-display').textContent = `₹${currentRate.toFixed(2)}`;
        document.getElementById('exchange-rate-input').value = '';

        const freshnessEl = document.getElementById('exchange-rate-freshness');
        if (freshnessEl) {
            freshnessEl.textContent = freshness.hasData
                ? `Last updated: ${freshness.label}${freshness.isStale ? ' ⚠ stale' : ''}`
                : 'Never updated — tap Auto-fetch or enter manually';
            freshnessEl.className = 'text-xs ' + (freshness.isStale ? 'text-amber-700' : 'text-gray-500');
        }

        document.getElementById('exchange-rate-modal').classList.remove('hidden');
    },

    /**
     * Close exchange rate modal
     */
    closeExchangeRateModal() {
        document.getElementById('exchange-rate-modal').classList.add('hidden');
    },

    /**
     * Save exchange rate (manual entry)
     */
    saveExchangeRate() {
        const newRate = parseFloat(document.getElementById('exchange-rate-input').value);

        if (!newRate || newRate <= 0) {
            Utils.showError('Please enter a valid exchange rate');
            return;
        }

        try {
            this.setExchangeRate(newRate);
        } catch (e) {
            Utils.showError(e.message);
            return;
        }

        Utils.showSuccess('Exchange rate updated successfully! Portfolio values recalculated.');
        this.closeExchangeRateModal();
        this.render();
    },

    /**
     * Auto-fetch USD/INR exchange rate from a free public API (frankfurter.app).
     * Uses CapacitorHttp on native to avoid CORS, falls back to fetch on web.
     */
    async autoFetchExchangeRate() {
        const btn = document.getElementById('exchange-rate-autofetch-btn');
        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Fetching...';
        }
        try {
            // frankfurter.app — free, no API key needed, ECB rates
            const url = 'https://api.frankfurter.app/latest?from=USD&to=INR';
            let data;
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
                const response = await window.Capacitor.Plugins.CapacitorHttp.get({ url });
                if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
                data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
            } else {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                data = await response.json();
            }
            const rate = data?.rates?.INR;
            if (!rate || rate <= 0) throw new Error('Rate not found in response');

            const rounded = Math.round(rate * 100) / 100;
            const input = document.getElementById('exchange-rate-input');
            if (input) input.value = rounded;
            Utils.showInfo(`✓ Fetched USD/INR: ₹${rounded.toFixed(2)} — review & save`);
        } catch (e) {
            console.error('Auto-fetch exchange rate failed:', e);
            Utils.showError(`Auto-fetch failed: ${e.message}. Please enter manually.`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    },
    
    /**
     * Open gold rate modal
     */
    openGoldRateModal() {
        const currentRate = this.getGoldRate();
        const purity = (window.DB.goldRatePerGram && window.DB.goldRatePerGram.purity) || '22K';
        const freshness = this.getRateFreshness(window.DB.goldRatePerGram);
        document.getElementById('current-gold-rate-display').textContent = Utils.formatIndianNumber(currentRate);
        document.getElementById('gold-rate-input').value = '';

        const purityEl = document.getElementById('gold-rate-purity');
        if (purityEl) purityEl.value = purity;

        const freshnessEl = document.getElementById('gold-rate-freshness');
        if (freshnessEl) {
            freshnessEl.textContent = freshness.hasData
                ? `Last updated: ${freshness.label}${freshness.isStale ? ' ⚠ stale' : ''}`
                : 'Never updated — tap Auto-fetch or enter manually';
            freshnessEl.className = 'text-xs ' + (freshness.isStale ? 'text-amber-700' : 'text-gray-500');
        }

        document.getElementById('gold-rate-modal').classList.remove('hidden');
    },

    /**
     * Close gold rate modal
     */
    closeGoldRateModal() {
        document.getElementById('gold-rate-modal').classList.add('hidden');
    },

    /**
     * Save gold rate (manual entry)
     */
    saveGoldRate() {
        const newRate = parseFloat(document.getElementById('gold-rate-input').value);
        const purityEl = document.getElementById('gold-rate-purity');
        const purity = purityEl ? purityEl.value : '24K';

        if (!newRate || newRate <= 0) {
            Utils.showError('Please enter a valid gold rate');
            return;
        }

        try {
            this.setGoldRate(newRate, purity);
        } catch (e) {
            Utils.showError(e.message);
            return;
        }

        // Auto-calibrate the India premium: if the user just auto-fetched (so
        // we have the raw 24K spot) and is now saving a corrected rate, back-
        // solve the premium that maps spot → their number. Future auto-fetches
        // then match their real source (jeweller / IBJA) without a code change.
        //   manualRate = spot24K × (1 + premium) × purityFactor
        //   ⇒ premium  = manualRate / (spot24K × purityFactor) − 1
        let calibrated = false;
        if (this._lastGold24KSpot && this._lastGold24KSpot > 0) {
            const purityFactor = purity === '22K' ? 0.916 : 1.0;
            const impliedPremium = (newRate / (this._lastGold24KSpot * purityFactor)) - 1;
            // Sanity-clamp to a plausible band (3%–35%) so a typo doesn't poison
            // the premium. Outside the band we leave the premium untouched.
            if (impliedPremium >= 0.03 && impliedPremium <= 0.35) {
                window.DB.goldIndiaPremium = Math.round(impliedPremium * 1000) / 1000;
                calibrated = true;
            }
            // One-shot: don't reuse a stale spot for the next manual save.
            this._lastGold24KSpot = null;
        }

        // Sync portfolio GOLD entries' price field with the new rate
        this.updatePortfolioGoldPrice(this.getGoldRate());

        // Close modal first, then render to ensure clean UI update
        this.closeGoldRateModal();
        this.render();

        setTimeout(() => {
            const calibMsg = calibrated
                ? `<br><span class="text-xs">India premium calibrated to ${Math.round(window.DB.goldIndiaPremium * 100)}% — future auto-fetches will match</span>`
                : '';
            Utils.showSuccess(`Gold rate updated!<br>Portfolio values recalculated${calibMsg}`);
        }, 100);
    },

    // India landed-cost premium over international spot. Indian retail gold is
    // ~ spot + 6% basic customs duty + 3% GST + small jeweller/refining margin,
    // which lands around +13–16% over the raw international price converted to
    // INR. 0.14 (14%) is a sensible default that tracks IBJA/retail closely.
    // Stored in DB so it's tunable if duty/GST policy changes.
    GOLD_INDIA_PREMIUM_DEFAULT: 0.14,

    /**
     * Auto-fetch gold rate (₹/gram) for the Indian market.
     *
     * Method (deterministic, matches Indian retail far better than the old
     * GOLDBEES×100 heuristic, which drifted because 1 ETF unit is no longer
     * ~0.01g of spot):
     *   1. International spot: GC=F (COMEX gold front-month) in USD/troy-oz.
     *   2. Convert: USD/oz → INR/gram  =  (spot × USDINR) / 31.1035.
     *   3. Apply India landed premium (duty + GST + margin), default +14%.
     *   4. Apply purity factor (24K = 1.0, 22K = 0.916).
     *
     * USD-INR comes from the stored exchange rate (or a live frankfurter
     * fetch if we don't have one). Shows the breakdown so the number is
     * auditable before saving.
     */
    async autoFetchGoldRate() {
        const btn = document.getElementById('gold-rate-autofetch-btn');
        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Fetching...';
        }
        try {
            const purity = document.getElementById('gold-rate-purity')?.value || '22K';

            // 1. International spot (USD per troy ounce).
            const spotUsdPerOz = await this.fetchPriceFromYahoo('GC=F');

            // 2. USD-INR — prefer the stored rate; fetch live if missing.
            let usdInr = this.getExchangeRate();
            if (!usdInr || usdInr <= 0) {
                const fx = await this._httpGetJson('https://api.frankfurter.app/latest?from=USD&to=INR');
                usdInr = fx?.rates?.INR;
            }
            if (!usdInr || usdInr <= 0) throw new Error('USD-INR rate unavailable');

            const GRAMS_PER_TROY_OZ = 31.1035;
            const inrPerGram24KSpot = (spotUsdPerOz * usdInr) / GRAMS_PER_TROY_OZ;

            // Stash the raw (pre-premium) 24K spot so a later manual Save can
            // back-solve the premium for calibration. See saveGoldRate().
            this._lastGold24KSpot = inrPerGram24KSpot;

            // 3. India landed premium (duty + GST + margin).
            const premium = (typeof window.DB.goldIndiaPremium === 'number')
                ? window.DB.goldIndiaPremium
                : this.GOLD_INDIA_PREMIUM_DEFAULT;
            const inrPerGram24K = inrPerGram24KSpot * (1 + premium);

            // 4. Purity factor.
            const purityFactor = purity === '22K' ? 0.916 : 1.0;
            const finalRate = Math.round(inrPerGram24K * purityFactor);

            const input = document.getElementById('gold-rate-input');
            if (input) input.value = finalRate;

            Utils.showInfo(
                `✓ ${purity} gold: ₹${Utils.formatIndianNumber(finalRate)}/g` +
                `<br><span class="text-xs">spot $${spotUsdPerOz.toFixed(0)}/oz × ₹${usdInr.toFixed(1)} ÷ 31.1 + ${Math.round(premium * 100)}% India premium${purity === '22K' ? ' × 0.916' : ''}</span>` +
                `<br><span class="text-xs">Review & Save</span>`
            );
        } catch (e) {
            console.error('Auto-fetch gold rate failed:', e);
            Utils.showError(`Auto-fetch failed: ${e.message}. Please enter manually.`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    },

    /**
     * Open date filter modal
     */
    openDateFilterModal() {
        document.querySelector(`input[name="investment-date-filter"][value="${this.dateFilter}"]`).checked = true;
        
        if (this.dateFilter === 'custom') {
            document.getElementById('investment-custom-date-fields').classList.remove('hidden');
            if (this.customDateRange.start) {
                document.getElementById('investment-filter-start-date').value = this.customDateRange.start;
            }
            if (this.customDateRange.end) {
                document.getElementById('investment-filter-end-date').value = this.customDateRange.end;
            }
        }
        
        document.getElementById('investment-date-filter-modal').classList.remove('hidden');
    },

    /**
     * Open date filter modal
     */
    openDateFilterModal() {
        // Ensure buttons are hidden if non-custom filter is selected
        const selected = document.querySelector('input[name="investment-date-filter"]:checked').value;
        const buttons = document.getElementById('investment-filter-buttons');
        const customFields = document.getElementById('investment-custom-date-fields');
        
        if (selected === 'custom') {
            buttons.classList.remove('hidden');
            customFields.classList.remove('hidden');
        } else {
            buttons.classList.add('hidden');
            customFields.classList.add('hidden');
        }
        
        document.getElementById('investment-date-filter-modal').classList.remove('hidden');
    },

    /**
     * Close date filter modal
     */
    closeDateFilterModal() {
        document.getElementById('investment-date-filter-modal').classList.add('hidden');
    },

    /**
     * Handle date filter change
     */
    handleDateFilterChange() {
        const selected = document.querySelector('input[name="investment-date-filter"]:checked').value;
        const customFields = document.getElementById('investment-custom-date-fields');
        const buttons = document.getElementById('investment-filter-buttons');
        
        if (selected === 'custom') {
            // Show custom date fields and buttons
            customFields.classList.remove('hidden');
            buttons.classList.remove('hidden');
        } else {
            // Hide custom fields and buttons
            customFields.classList.add('hidden');
            buttons.classList.add('hidden');
            
            // Apply filter immediately and close modal
            this.dateFilter = selected;
            
            // Manage expanded state based on filter
            if (selected === 'thisMonth') {
                const now = new Date();
                const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
                this.expandedMonths.clear();
                this.expandedMonths.add(currentMonthKey);
                
                // Also expand all type groups within current month
                this.expandedMonthlyTypes.clear();
                ['EPF', 'FD', 'GOLD', 'SHARES', 'MF'].forEach(type => {
                    this.expandedMonthlyTypes.add(`${currentMonthKey}-${type}`);
                });
            } else {
                // Collapse all for other filters
                this.expandedMonths.clear();
                this.expandedYears.clear();
                this.expandedMonthlyTypes.clear();
            }
            
            this.closeDateFilterModal();
            this.renderMonthlySection();
        }
    },

    /**
     * Toggle custom date fields (legacy support)
     */
    toggleCustomDateFields() {
        this.handleDateFilterChange();
    },

    /**
     * Apply date filter
     */
    applyDateFilter() {
        const selected = document.querySelector('input[name="investment-date-filter"]:checked').value;
        
        if (selected === 'custom') {
            const startDate = document.getElementById('investment-filter-start-date').value;
            const endDate = document.getElementById('investment-filter-end-date').value;
            
            if (!startDate || !endDate) {
                Utils.showError('Please select both start and end dates');
                return;
            }
            
            this.customDateRange = { start: startDate, end: endDate };
        }
        
        this.dateFilter = selected;
        
        // Manage expanded state based on filter
        if (selected === 'thisMonth') {
            // Expand current month for 'This Month' filter
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
            this.expandedMonths.clear();
            this.expandedMonths.add(currentMonthKey);
            
            // Also expand all type groups within current month
            this.expandedMonthlyTypes.clear();
            ['EPF', 'FD', 'GOLD', 'SHARES', 'MF'].forEach(type => {
                this.expandedMonthlyTypes.add(`${currentMonthKey}-${type}`);
            });
        } else {
            // Collapse all for other filters
            this.expandedMonths.clear();
            this.expandedYears.clear();
            this.expandedMonthlyTypes.clear();
        }
        
        this.closeDateFilterModal();
        this.renderMonthlySection();
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    window.Investments = Investments;
}
