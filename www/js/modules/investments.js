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

    /**
     * Initialize the module
     */
    init() {
        // Initialize default rates if not set, handle old object format
        if (!window.DB.exchangeRate) {
            window.DB.exchangeRate = 83;
        } else if (typeof window.DB.exchangeRate === 'object' && window.DB.exchangeRate !== null) {
            // Convert old object format to number
            window.DB.exchangeRate = window.DB.exchangeRate.rate || 83;
        }
        
        if (!window.DB.goldRatePerGram) {
            window.DB.goldRatePerGram = 7000;
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
        ['EPF', 'FD', 'GOLD', 'SHARES'].forEach(type => {
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
     * Get exchange rate as a number (handles old object format)
     */
    getExchangeRate() {
        let rate = window.DB.exchangeRate;
        if (typeof rate === 'object' && rate !== null) {
            return rate.rate || 83;
        }
        return typeof rate === 'number' ? rate : 83;
    },

    /**
     * Render the investments page
     */
    render() {
        this.renderPortfolioSection();
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
        const goldRate = window.DB.goldRatePerGram || 7000;
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

        // Use persistent state for portfolio body visibility
        const isBodyVisible = this.portfolioBodyVisible;

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md overflow-hidden">
                <!-- Header -->
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
                        <button onclick="event.stopPropagation(); Investments.openSharePriceModal()" class="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            Stocks
                        </button>
                        <button onclick="event.stopPropagation(); Investments.openExchangeRateModal()" class="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1">
                            <span class="text-base">💲</span>
                            ${currentExchangeRate}
                        </button>
                        <button onclick="event.stopPropagation(); Investments.openGoldRateModal()" class="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1">
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
        ['EPF', 'FD', 'GOLD', 'SHARES'].forEach(type => {
            if (grouped[type] && grouped[type].length > 0) {
                const typeTotal = grouped[type].reduce((sum, inv) => 
                    sum + this.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices), 0);
                
                const isExpanded = this.expandedTypes.has(`${this.currentPortfolioTab}-${type}`);
                const typeLabel = type === 'FD' ? 'Fixed Deposit' : type === 'EPF' ? 'EPF' : type === 'GOLD' ? 'Gold' : 'Shares';
                const typeIcon = type === 'SHARES' ? '📈' : type === 'GOLD' ? '🪙' : type === 'EPF' ? '💼' : '🏦';

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
            'GOLD': 'bg-yellow-100 text-yellow-800',
            'EPF': 'bg-green-100 text-green-800',
            'FD': 'bg-orange-100 text-orange-800'
        };
        const typeBadge = `<span class="px-2 py-0.5 ${typeColors[inv.type] || 'bg-gray-100 text-gray-800'} rounded text-xs font-medium ml-2">${inv.type}</span>`;

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

        // Edit button HTML - hide for FD, show for others
        const editButton = inv.type === 'FD' ? '' : `
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
        const goldRate = window.DB.goldRatePerGram || 7000;

        // Separate by term first
        const shortTermData = monthlyData.filter(inv => inv.goal === 'SHORT_TERM');
        const longTermData = monthlyData.filter(inv => inv.goal === 'LONG_TERM');

        // Calculate term totals
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

        // Apply date filter
        filtered = this.applyDateFilterToInvestments(filtered);
        
        // Group by year and month
        const grouped = this.groupByYearMonth(filtered);

        // Build HTML with tabs
        let html = `
            <div class="bg-white rounded-xl shadow-md overflow-hidden mb-4">
                <!-- Tabs -->
                <div class="flex border-b border-gray-200 bg-gray-50">
                    <button onclick="Investments.switchMonthlyTab('short')" 
                            class="flex-1 py-2 px-3 text-center text-sm font-medium transition-all ${this.currentMonthlyTab === 'short' ? 'text-yellow-700 border-b-2 border-yellow-600 bg-white' : 'text-gray-600 hover:text-gray-800'}">
                        Short Term<br><span class="text-xs">(₹${Utils.formatIndianNumber(Math.round(shortTermTotal))})</span>
                    </button>
                    <button onclick="Investments.switchMonthlyTab('long')" 
                            class="flex-1 py-2 px-3 text-center text-sm font-medium transition-all ${this.currentMonthlyTab === 'long' ? 'text-yellow-700 border-b-2 border-yellow-600 bg-white' : 'text-gray-600 hover:text-gray-800'}">
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
            ['EPF', 'FD', 'GOLD', 'SHARES'].forEach(type => {
                if (grouped[type] && grouped[type].length > 0) {
                    const typeTotal = grouped[type].reduce((sum, inv) => 
                        sum + this.calculateMonthlyAmount(inv, goldRate), 0);
                    
                    const typeKey = `${monthKey}-${type}`;
                    const isTypeExpanded = this.expandedMonthlyTypes.has(typeKey);
                    const typeLabel = type === 'FD' ? 'Fixed Deposit' : type === 'EPF' ? 'EPF' : type === 'GOLD' ? 'Gold' : 'Shares';
                    const typeIcon = type === 'SHARES' ? '📈' : type === 'GOLD' ? '🪙' : type === 'EPF' ? '💼' : '🏦';

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
            'GOLD': 'bg-yellow-100 text-yellow-800',
            'EPF': 'bg-green-100 text-green-800',
            'FD': 'bg-orange-100 text-orange-800'
        };
        const typeBadge = `<span class="px-2 py-0.5 ${typeColors[inv.type] || 'bg-gray-100 text-gray-800'} rounded text-xs font-medium ml-2">${inv.type}</span>`;

        if (inv.type === 'SHARES') {
            const currencySymbol = inv.currency === 'USD' ? '$' : '₹';
            line2 = `<span class="text-gray-600 text-xs"><span class="font-bold">Price:</span> ${currencySymbol}${Utils.formatIndianNumber(inv.price)}</span>`;
            line3 = `<span class="text-gray-600 text-xs"><span class="font-bold">Qty:</span> ${inv.quantity}</span>`;
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
     */
    groupByYearMonth(investments) {
        const grouped = {};
        investments.forEach(inv => {
            const date = new Date(inv.date);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
                        
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
        if (inv.type === 'SHARES') {
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
        
        // Update all portfolio entries with this share
        portfolioInvestments.forEach(inv => {
            if (inv.type === 'SHARES' && inv.name === shareName) {
                inv.price = newPrice;
                inv.currency = currency;
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
     * Apply date filter to investments
     */
    applyDateFilterToInvestments(investments) {
        const now = new Date();
        
        switch (this.dateFilter) {
            case 'thisMonth':
                return investments.filter(inv => {
                    const date = new Date(inv.date);
                    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                });
            
            case 'last6Months':
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                return investments.filter(inv => new Date(inv.date) >= sixMonthsAgo);
            
            case 'thisYear':
                return investments.filter(inv => new Date(inv.date).getFullYear() === now.getFullYear());
            
            case 'custom':
                if (this.customDateRange.start && this.customDateRange.end) {
                    const start = new Date(this.customDateRange.start);
                    const end = new Date(this.customDateRange.end);
                    return investments.filter(inv => {
                        const date = new Date(inv.date);
                        return date >= start && date <= end;
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
        const goldRate = window.DB.goldRatePerGram || 7000;

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
        if (type === 'SHARES') {
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

        // Calculated amount display (for SHARES and GOLD)
        if (type === 'SHARES' || type === 'GOLD') {
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

        // Date field (if tracking monthly)
        html += `
            <div id="investment-date-container" class="mb-3">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                <input type="date" id="investment-date" value="${new Date().toISOString().split('T')[0]}"
                       class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
            </div>
        `;

        dynamicFields.innerHTML = html;

        // Add event listener for monthly checkbox
        document.getElementById('investment-track-monthly').addEventListener('change', (e) => {
            const dateContainer = document.getElementById('investment-date-container');
            if (e.target.checked) {
                dateContainer.classList.remove('hidden');
            } else {
                dateContainer.classList.add('hidden');
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
        const date = trackMonthly ? document.getElementById('investment-date').value : null;

        let investmentData = {
            name,
            type,
            goal,
            description
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
            this.updateExistingInvestment(parseInt(editId), investmentData, trackMonthly, date);
        } else {
            // Check for duplicates and handle add/override
            const userDataKey = `${name}_${type}_${goal}`;
            
            if (trackMonthly) {
                // Add to monthly investments
                investmentData.date = date;
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
    updateExistingInvestment(id, data, trackMonthly, date) {
        const isMonthly = this.editingInvestment.isMonthly;
        
        if (isMonthly) {
            // Update monthly investment (no portfolio sync - they're independent)
            const index = window.DB.monthlyInvestments.findIndex(inv => parseInt(inv.id) === id);
            if (index !== -1) {
                window.DB.monthlyInvestments[index] = {
                    ...window.DB.monthlyInvestments[index],
                    ...data,
                    date: date || window.DB.monthlyInvestments[index].date
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
                
                // Update share price if SHARES
                if (data.type === 'SHARES') {
                    this.updateSharePrice(data.name, data.price, data.currency);
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
            // Add to existing (only for SHARES and GOLD)
            if (data.type === 'SHARES' || data.type === 'GOLD') {
                existing.quantity = (existing.quantity || 0) + (data.quantity || 0);
                // Update to latest price (rounded to 2 decimals)
                existing.price = Math.round(data.price * 100) / 100;
                if (data.type === 'SHARES') {
                    existing.currency = data.currency;
                }
            }
            // FD and EPF: Don't add to existing in portfolio from monthly investments
            
            // Update share price in storage if SHARES
            if (data.type === 'SHARES') {
                this.updateSharePrice(data.name, data.price, data.currency);
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
            
            // Update share price if SHARES
            if (data.type === 'SHARES') {
                this.updateSharePrice(data.name, data.price, data.currency);
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
            
            // Show add/override modal for SHARES and GOLD
            this.pendingInvestmentData = data;
            this.showAddOrOverrideModal(existing, data);
        } else {
            // Add new
            const newId = portfolioInvestments.length > 0 ? Math.max(...portfolioInvestments.map(inv => inv.id)) + 1 : 1;
            portfolioInvestments.push({
                id: newId,
                ...data
            });
            
            // Update share price if SHARES
            if (data.type === 'SHARES') {
                this.updateSharePrice(data.name, data.price, data.currency);
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
        if (newData.type === 'SHARES' || newData.type === 'GOLD') {
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
        if (newData.type === 'SHARES' || newData.type === 'GOLD') {
            existing.quantity = (existing.quantity || 0) + (newData.quantity || 0);
            // Update to latest price (rounded to 2 decimals)
            existing.price = Math.round(newData.price * 100) / 100;
            if (newData.type === 'SHARES') {
                existing.currency = newData.currency;
            }
        } else {
            existing.amount = (existing.amount || 0) + (newData.amount || 0);
        }
        
        // Update share price in storage if SHARES
        if (newData.type === 'SHARES') {
            this.updateSharePrice(newData.name, newData.price, newData.currency);
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
        if (newData.type === 'SHARES' || newData.type === 'GOLD') {
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
        
        // Update share price in storage if SHARES
        if (newData.type === 'SHARES') {
            this.updateSharePrice(newData.name, newData.price, newData.currency);
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
        } else if (investment.type === 'GOLD') {
            document.getElementById('investment-quantity').value = investment.quantity;
            
            // For portfolio investments, use latest gold rate; for monthly, use historical price
            if (investment.isMonthly) {
                document.getElementById('investment-price').value = investment.price;
            } else {
                const goldRate = window.DB.goldRatePerGram || 7000;
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
        
        if (investment.isMonthly) {
            document.getElementById('investment-track-monthly').checked = true;
            document.getElementById('investment-track-monthly').disabled = true;
            document.getElementById('investment-date').value = investment.date;
        } else {
            document.getElementById('investment-track-monthly').checked = false;
            document.getElementById('investment-track-monthly').disabled = true;
            document.getElementById('investment-date-container').classList.add('hidden');
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
        const goldRate = window.DB.goldRatePerGram || 7000;
        const sharePrices = window.DB.sharePrices || [];
        
        // Build detailed info based on investment type
        let detailsHTML = '';
        let amount = 0;
        
        // Type badge
        const typeBadgeClass = {
            'SHARES': 'badge-type-shares',
            'GOLD': 'badge-type-gold',
            'EPF': 'badge-type-epf',
            'FD': 'badge-type-fd'
        };
        const typeBadge = `<span class="${typeBadgeClass[investment.type] || 'badge-type-shares'}">${investment.type}</span>`;
        
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
            
            // Check if any other portfolio items use this share
            if (investment && investment.type === 'SHARES') {
                const hasOtherShares = window.DB.portfolioInvestments.some(inv => 
                    inv.type === 'SHARES' && inv.name === investment.name
                );
                
                if (!hasOtherShares) {
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
            // Check if share exists in portfolio
            const existsInPortfolio = portfolioInvestments.some(inv => 
                inv.type === 'SHARES' && inv.name === share.name
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
     * Reload all share prices (placeholder for API integration)
     */
    async reloadAllSharePrices() {
        const sharePrices = window.DB.sharePrices || [];
        const activeShares = sharePrices.filter(sp => sp.active);
        
        if (activeShares.length === 0) return;
        
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
            }
        });
        
        // Simulate API call (TODO: Replace with actual API integration)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update prices (placeholder - in real implementation, fetch from API)
        activeShares.forEach(share => {
            // Simulate price update (±2% change)
            const newPrice = share.price * (0.98 + Math.random() * 0.04);
            // Round to 2 decimal places
            share.price = Math.round(newPrice * 100) / 100;
            share.lastUpdated = new Date().toISOString();
            
            // Also update portfolio entries with this share
            this.updatePortfolioSharePrice(share.name, share.price, share.currency);
        });
        
        window.Storage.save();
        
        // Re-render the modal with updated prices
        this.openSharePriceModal();
        
        // Restore global button
        globalBtn.disabled = false;
        globalBtn.innerHTML = originalBtnHTML;
        
        Utils.showSuccess('All share prices updated!<br>Portfolio values recalculated');
        
        // Re-render portfolio to reflect updated prices
        this.render();
    },

    /**
     * Reload single share price (placeholder for API integration)
     */
    async reloadSingleSharePrice(shareName) {
        const shareDiv = document.querySelector(`[data-share="${shareName}"]`);
        if (!shareDiv) return;
        
        const priceSpan = shareDiv.querySelector('.share-price');
        const reloadBtn = shareDiv.querySelector('.reload-share-btn svg');
        const originalPrice = priceSpan.innerHTML;
        
        // Show loading state
        priceSpan.innerHTML = '<span class="loading-dots">...</span>';
        if (reloadBtn) reloadBtn.classList.add('animate-spin');
        
        // Simulate API call (TODO: Replace with actual API integration)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update price in DB
        const sharePrices = window.DB.sharePrices || [];
        const share = sharePrices.find(sp => sp.name === shareName);
        
        if (share) {
            // Simulate price update (±2% change)
            const newPrice = share.price * (0.98 + Math.random() * 0.04);
            // Round to 2 decimal places
            share.price = Math.round(newPrice * 100) / 100;
            share.lastUpdated = new Date().toISOString();
            
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
            
            // Re-render portfolio to reflect updated price
            this.render();
        } else {
            priceSpan.innerHTML = originalPrice;
        }
        
        // Remove loading animation
        if (reloadBtn) reloadBtn.classList.remove('animate-spin');
    },

    /**
     * Delete share price from storage
     */
    deleteSharePrice(shareName) {
        // Check if share exists in portfolio
        const portfolioInvestments = window.DB.portfolioInvestments || [];
        const existsInPortfolio = portfolioInvestments.some(inv => 
            inv.type === 'SHARES' && inv.name === shareName
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
        document.getElementById('current-rate-display').textContent = `₹${currentRate.toFixed(2)}`;
        document.getElementById('exchange-rate-input').value = '';
        document.getElementById('exchange-rate-modal').classList.remove('hidden');
    },

    /**
     * Close exchange rate modal
     */
    closeExchangeRateModal() {
        document.getElementById('exchange-rate-modal').classList.add('hidden');
    },

    /**
     * Save exchange rate
     */
    saveExchangeRate() {
        const newRate = parseFloat(document.getElementById('exchange-rate-input').value);
        
        if (!newRate || newRate <= 0) {
            Utils.showError('Please enter a valid exchange rate');
            return;
        }
        
        window.DB.exchangeRate = newRate;
        window.Storage.save();
        
        Utils.showSuccess('Exchange rate updated successfully! Portfolio values recalculated.');
        this.closeExchangeRateModal();
        this.render();
    },
    
    /**
     * Open gold rate modal
     */
    openGoldRateModal() {
        const currentRate = window.DB.goldRatePerGram || 7000;
        document.getElementById('current-gold-rate-display').textContent = Utils.formatIndianNumber(currentRate);
        document.getElementById('gold-rate-input').value = '';
        document.getElementById('gold-rate-modal').classList.remove('hidden');
    },
            
    /**
     * Close gold rate modal
     */
    closeGoldRateModal() {
        document.getElementById('gold-rate-modal').classList.add('hidden');
    },
    
    /**
     * Save gold rate
     */
    saveGoldRate() {
        const newRate = parseFloat(document.getElementById('gold-rate-input').value);
        
        if (!newRate || newRate <= 0) {
            Utils.showError('Please enter a valid gold rate');
            return;
        }
        
        // Round to 2 decimal places
        window.DB.goldRatePerGram = Math.round(newRate * 100) / 100;
        
        // Also update portfolio entries with GOLD (sync the price field)
        this.updatePortfolioGoldPrice(window.DB.goldRatePerGram);
        
        window.Storage.save();
        
        // Close modal first, then render to ensure clean UI update
        this.closeGoldRateModal();
        
        // Force complete re-render (portfolio + monthly sections)
        this.render();
        
        // Small delay to ensure DOM is updated before showing success
        setTimeout(() => {
            Utils.showSuccess('Gold rate updated!<br>Portfolio values recalculated');
        }, 100);
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
                ['EPF', 'FD', 'GOLD', 'SHARES'].forEach(type => {
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
            ['EPF', 'FD', 'GOLD', 'SHARES'].forEach(type => {
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
