/**
 * Investments Module
 * Handles investment portfolio and monthly investment tracking
 */

const Investments = {
    expandedTypes: new Set(), // Track expanded type groups in portfolio
    expandedMonths: new Set(), // Track expanded months in monthly investments
    expandedYears: new Set(), // Track expanded years in monthly investments
    currentPortfolioTab: 'short', // 'short' or 'long'
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
        window.Storage.save();
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

        // Check if portfolio body is currently visible
        const portfolioBody = document.getElementById('portfolio-body');
        const isBodyVisible = portfolioBody && !portfolioBody.classList.contains('hidden');

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md overflow-hidden">
                <!-- Header -->
                <div class="bg-gradient-to-r from-yellow-600 to-orange-600 text-white p-4 rounded-t-xl cursor-pointer" onclick="Investments.togglePortfolioBody()">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-lg font-bold">Portfolio</h3>
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
                                class="flex-1 py-3 px-4 text-center font-semibold transition-all ${this.currentPortfolioTab === 'short' ? 'text-yellow-700 border-b-2 border-yellow-600 bg-white' : 'text-gray-600 hover:text-gray-800'}">
                            Short Term<br><span class="text-xs">(₹${Utils.formatIndianNumber(Math.round(shortTermTotal))})</span>
                        </button>
                        <button onclick="Investments.switchPortfolioTab('long')" 
                                class="flex-1 py-3 px-4 text-center font-semibold transition-all ${this.currentPortfolioTab === 'long' ? 'text-yellow-700 border-b-2 border-yellow-600 bg-white' : 'text-gray-600 hover:text-gray-800'}">
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

                html += `
                    <div class="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                        <div class="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-150" 
                             onclick="Investments.toggleTypeGroup('${this.currentPortfolioTab}', '${type}')">
                            <div class="flex items-center gap-2">
                                <span class="text-lg">${isExpanded ? '📂' : '📁'}</span>
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

        if (inv.type === 'SHARES') {
            const sharePrice = sharePrices.find(sp => sp.name === inv.name && sp.active);
            const currentPrice = sharePrice ? sharePrice.price : inv.price;
            const currencySymbol = (sharePrice?.currency || inv.currency) === 'USD' ? '$' : '₹';
            line2 = `<span class="text-gray-700">Price: ${currencySymbol}${Utils.formatIndianNumber(currentPrice)}</span>`;
            line3 = `<span class="text-gray-600 text-sm">Qty: ${inv.quantity}</span>`;
            if ((sharePrice?.currency || inv.currency) === 'USD') {
                const usdAmount = currentPrice * inv.quantity;
                line3 += `<span class="text-gray-600 text-sm">$${Utils.formatIndianNumber(usdAmount.toFixed(2))}</span>`;
            }
        } else if (inv.type === 'GOLD') {
            line2 = `<span class="text-gray-700">Price: ₹${Utils.formatIndianNumber(goldRate)}/gm</span>`;
            line3 = `<span class="text-gray-600 text-sm">Qty: ${inv.quantity}gm</span>`;
        } else if (inv.type === 'FD') {
            line2 = `<span class="text-gray-700">Amount: ₹${Utils.formatIndianNumber(inv.amount)}</span>`;
            line3 = `<span class="text-gray-600 text-sm">Tenure: ${inv.tenure} months | Interest: ${inv.interestRate}%</span>`;
            line3 += `<span class="text-gray-600 text-sm">End: ${Utils.formatLocalDate(new Date(inv.endDate))}</span>`;
        } else if (inv.type === 'EPF') {
            line2 = `<span class="text-gray-700">Amount: ₹${Utils.formatIndianNumber(inv.amount)}</span>`;
        }

        line4 = inv.description ? `<p class="text-gray-600 text-xs">${inv.description}</p>` : '';

        return `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-semibold text-gray-800">${inv.name}<span class="text-xs text-gray-500 ml-1">[${inv.type}]</span></span>
                    <div class="flex gap-2">
                        <button onclick="Investments.editInvestment(${inv.id}, false)" class="text-blue-600 hover:text-blue-800" title="Edit">
                            🖊️
                        </button>
                        <button onclick="Investments.confirmDelete(${inv.id}, false)" class="text-red-600 hover:text-red-800" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="flex justify-between items-center mb-1">
                    ${line2}
                    <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
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

        // Apply search filter
        let filtered = monthlyData;
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(inv => 
                inv.name.toLowerCase().includes(query) || 
                (inv.description && inv.description.toLowerCase().includes(query))
            );
        }

        // Apply date filter
        filtered = this.applyDateFilterToInvestments(filtered);

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-gray-500">No monthly investments found</div>`;
            return;
        }

        // Group by year and month
        const grouped = this.groupByYearMonth(filtered);

        let html = '<div class="space-y-4">';

        if (this.dateFilter === 'thisMonth') {
            // Show only current month, expanded
            const now = new Date();
            const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const currentMonthData = grouped[now.getFullYear()]?.[now.getMonth() + 1] || [];
            
            html += this.renderMonthGroup(now.getFullYear(), now.getMonth() + 1, currentMonthData, exchangeRate, goldRate, true);
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
                                <span>${isYearExpanded ? '📂' : '📁'}</span>
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

        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Render a month group
     */
    renderMonthGroup(year, month, investments, exchangeRate, goldRate, forceExpanded = false) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[month - 1];
        const monthKey = `${year}-${month}`;
        const isExpanded = forceExpanded || this.expandedMonths.has(monthKey);
        const monthTotal = investments.reduce((sum, inv) => sum + this.calculateMonthlyAmount(inv, goldRate), 0);

        return `
            <div class="border border-gray-200 rounded-lg overflow-hidden">
                <div class="bg-gray-100 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-150"
                     onclick="Investments.toggleMonthGroup('${monthKey}')">
                    <div class="flex items-center gap-2">
                        <span>${isExpanded ? '📂' : '📁'}</span>
                        <span class="font-semibold text-gray-800">${monthName} ${year}</span>
                        <span class="text-xs text-gray-600">(${investments.length})</span>
                    </div>
                    <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(monthTotal))}</span>
                </div>
                ${isExpanded ? `
                    <div class="p-3 space-y-3 bg-white">
                        ${investments.map(inv => this.renderMonthlyItem(inv, goldRate)).join('')}
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

        if (inv.type === 'SHARES') {
            const currencySymbol = inv.currency === 'USD' ? '$' : '₹';
            line2 = `<span class="text-gray-700">Price: ${currencySymbol}${Utils.formatIndianNumber(inv.price)}</span>`;
            line3 = `<span class="text-gray-600 text-sm">Qty: ${inv.quantity}</span>`;
            line3 += `<span class="text-gray-600 text-sm">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        } else if (inv.type === 'GOLD') {
            line2 = `<span class="text-gray-700">Price: ₹${Utils.formatIndianNumber(inv.price)}/gm</span>`;
            line3 = `<span class="text-gray-600 text-sm">Qty: ${inv.quantity}gm</span>`;
            line3 += `<span class="text-gray-600 text-sm">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        } else if (inv.type === 'FD' || inv.type === 'EPF') {
            line2 = `<span class="text-gray-700">Amount: ₹${Utils.formatIndianNumber(inv.amount)}</span>`;
            line3 = `<span class="text-gray-600 text-sm"></span>`;
            line3 += `<span class="text-gray-600 text-sm">${Utils.formatLocalDate(new Date(inv.date))}</span>`;
        }

        const line4 = inv.description ? `<p class="text-gray-600 text-xs">${inv.description}</p>` : '';

        return `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-semibold text-gray-800">${inv.name}<span class="text-xs text-gray-500 ml-1">[${inv.type}]</span></span>
                    <div class="flex gap-2">
                        <button onclick="Investments.editInvestment(${inv.id}, true)" class="text-blue-600 hover:text-blue-800" title="Edit">
                            🖊️
                        </button>
                        <button onclick="Investments.confirmDelete(${inv.id}, true)" class="text-red-600 hover:text-red-800" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="flex justify-between items-center mb-1">
                    ${line2}
                    <span class="font-bold text-yellow-700">₹${Utils.formatIndianNumber(Math.round(amount))}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
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
        const body = document.getElementById('portfolio-body');
        if (body) {
            body.classList.toggle('hidden');
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
     * Toggle month group expansion
     */
    toggleMonthGroup(monthKey) {
        if (this.expandedMonths.has(monthKey)) {
            this.expandedMonths.delete(monthKey);
        } else {
            this.expandedMonths.add(monthKey);
        }
        this.render();
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
        this.render();
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
        
        // Set default goal to Long Term
        document.querySelector('input[name="investment-goal"][value="LONG_TERM"]').checked = true;
        
        document.getElementById('investment-modal').classList.remove('hidden');
    },

    /**
     * Close investment modal
     */
    closeInvestmentModal() {
        document.getElementById('investment-modal').classList.add('hidden');
        this.editingInvestment = null;
    },

    /**
     * Handle type change in investment form
     */
    handleTypeChange() {
        const type = document.getElementById('investment-type').value;
        const dynamicFields = document.getElementById('investment-dynamic-fields');
        const saveBtn = document.getElementById('investment-save-btn');
        
        if (!type) {
            dynamicFields.innerHTML = '';
            saveBtn.disabled = true;
            saveBtn.classList.add('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
            saveBtn.classList.remove('bg-gradient-to-r', 'from-green-600', 'to-emerald-600', 'text-white', 'hover:shadow-lg', 'transform', 'hover:scale-105');
            return;
        }

        // Enable save button
        saveBtn.disabled = false;
        saveBtn.classList.remove('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
        saveBtn.classList.add('bg-gradient-to-r', 'from-green-600', 'to-emerald-600', 'text-white', 'hover:shadow-lg', 'transform', 'hover:scale-105');

        const isEditing = document.getElementById('investment-editing').value === 'true';
        const goldRate = window.DB.goldRatePerGram || 7000;

        let html = '';

        // Name field (with autocomplete)
        html += `
            <div class="mb-3">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Name</label>
                <input type="text" id="investment-name" list="investment-name-suggestions" placeholder="Enter name" maxlength="32"
                       class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                       oninput="Investments.updateNameSuggestions()">
                <datalist id="investment-name-suggestions"></datalist>
            </div>
        `;

        // Type-specific fields
        if (type === 'SHARES') {
            html += `
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Quantity</label>
                        <input type="number" id="investment-quantity" placeholder="Qty" step="1" min="0"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                               oninput="Investments.calculateAmount()">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Price</label>
                        <div class="flex gap-1">
                            <select id="investment-currency" class="w-16 p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                    onchange="Investments.calculateAmount()">
                                <option value="INR">₹</option>
                                <option value="USD">$</option>
                            </select>
                            <input type="number" id="investment-price" placeholder="Price" step="0.01" min="0"
                                   class="flex-1 p-2 border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                   oninput="Investments.calculateAmount()">
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
                               oninput="Investments.calculateAmount()">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Price/gram</label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">₹</span>
                            <input type="number" id="investment-price" placeholder="Per gram" step="0.01" min="0" value="${goldRate}"
                                   class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                   oninput="Investments.calculateAmount()">
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
                               class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
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
                               class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Tenure (months)</label>
                        <input type="number" id="investment-tenure" placeholder="Months" step="1" min="1"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Interest Rate (%)</label>
                        <input type="number" id="investment-interest-rate" placeholder="Rate" step="0.01" min="0"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
                    <input type="date" id="investment-end-date"
                           class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                </div>
            `;
        }

        // Description field
        html += `
            <div class="mb-3">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Description (optional)</label>
                <textarea id="investment-description" placeholder="Additional details" maxlength="256" rows="2"
                          class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"></textarea>
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
     * Update name suggestions based on selected type
     */
    updateNameSuggestions() {
        const type = document.getElementById('investment-type').value;
        if (!type) return;

        const portfolioData = window.DB.portfolioInvestments || [];
        const names = [...new Set(portfolioData.filter(inv => inv.type === type).map(inv => inv.name))];
        
        const datalist = document.getElementById('investment-name-suggestions');
        datalist.innerHTML = names.map(name => `<option value="${name}">`).join('');
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
        const type = document.getElementById('investment-type').value;
        if (!type) {
            Toast.error('Please select an investment type');
            return;
        }

        const name = document.getElementById('investment-name')?.value.trim();
        if (!name) {
            Toast.error('Please enter investment name');
            return;
        }

        const goal = document.querySelector('input[name="investment-goal"]:checked').value;
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

            if (!quantity || quantity <= 0) {
                Toast.error('Please enter a valid quantity');
                return;
            }
            if (!price || price <= 0) {
                Toast.error('Please enter a valid price');
                return;
            }

            investmentData.quantity = quantity;
            investmentData.price = price;
            investmentData.currency = currency;
        } else if (type === 'GOLD') {
            const quantity = parseFloat(document.getElementById('investment-quantity').value);
            const price = parseFloat(document.getElementById('investment-price').value);

            if (!quantity || quantity <= 0) {
                Toast.error('Please enter a valid quantity');
                return;
            }
            if (!price || price <= 0) {
                Toast.error('Please enter a valid price per gram');
                return;
            }

            investmentData.quantity = quantity;
            investmentData.price = price;
        } else if (type === 'EPF') {
            const amount = parseFloat(document.getElementById('investment-amount').value);

            if (!amount || amount <= 0) {
                Toast.error('Please enter a valid amount');
                return;
            }

            investmentData.amount = amount;
        } else if (type === 'FD') {
            const amount = parseFloat(document.getElementById('investment-amount').value);
            const tenure = parseInt(document.getElementById('investment-tenure').value);
            const interestRate = parseFloat(document.getElementById('investment-interest-rate').value);
            const endDate = document.getElementById('investment-end-date').value;

            if (!amount || amount <= 0) {
                Toast.error('Please enter a valid amount');
                return;
            }
            if (!tenure || tenure <= 0) {
                Toast.error('Please enter a valid tenure');
                return;
            }
            if (!interestRate || interestRate < 0) {
                Toast.error('Please enter a valid interest rate');
                return;
            }
            if (!endDate) {
                Toast.error('Please select an end date');
                return;
            }

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
            // Update monthly investment
            const index = window.DB.monthlyInvestments.findIndex(inv => parseInt(inv.id) === id);
            if (index !== -1) {
                window.DB.monthlyInvestments[index] = {
                    ...window.DB.monthlyInvestments[index],
                    ...data,
                    date: date || window.DB.monthlyInvestments[index].date
                };
                window.Storage.save();
                
                // Sync to portfolio
                const userDataKey = `${data.name}_${data.type}_${data.goal}`;
                this.syncToPortfolio(data, userDataKey);
                
                Toast.success('Monthly investment updated successfully');
                this.closeInvestmentModal();
                this.render();
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
                Toast.success('Portfolio investment updated successfully');
                this.closeInvestmentModal();
                this.render();
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
            // Add to existing
            if (data.type === 'SHARES' || data.type === 'GOLD') {
                existing.quantity = (existing.quantity || 0) + (data.quantity || 0);
            } else if (data.type === 'EPF' || data.type === 'FD') {
                existing.amount = (existing.amount || 0) + (data.amount || 0);
            }
            
            // Update share price if SHARES
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
            // Show add/override modal
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
            
            Toast.success('Investment added successfully');
            this.closeInvestmentModal();
            this.render();
        }
    },

    /**
     * Update or add share price in storage
     */
    updateSharePrice(name, price, currency) {
        const sharePrices = window.DB.sharePrices || [];
        const existing = sharePrices.find(sp => sp.name === name);
        
        if (existing) {
            existing.price = price;
            existing.currency = currency;
            existing.lastUpdated = new Date().toISOString();
        } else {
            sharePrices.push({
                name,
                price,
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
        } else {
            existing.amount = (existing.amount || 0) + (newData.amount || 0);
        }
        
        // Update share price if SHARES
        if (newData.type === 'SHARES') {
            this.updateSharePrice(newData.name, newData.price, newData.currency);
        }
        
        window.Storage.save();
        
        Toast.success('Added to existing investment');
        this.closeInvestmentModal();
        this.render();
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
        
        // Update share price if SHARES
        if (newData.type === 'SHARES') {
            this.updateSharePrice(newData.name, newData.price, newData.currency);
        }
        
        window.Storage.save();
        
        Toast.success('Investment overridden successfully');
        this.closeInvestmentModal();
        this.render();
    },

    /**
     * Edit investment
     */
    editInvestment(id, isMonthly) {
        const investments = isMonthly ? window.DB.monthlyInvestments : window.DB.portfolioInvestments;
        const investment = investments.find(inv => parseInt(inv.id) === parseInt(id));
        
        if (!investment) {
            Toast.error('Investment not found');
            return;
        }
        
        this.editingInvestment = { ...investment, isMonthly };
        
        document.getElementById('investment-modal-title').textContent = 'Update Investment';
        document.getElementById('investment-id').value = id;
        document.getElementById('investment-is-monthly').value = isMonthly ? 'true' : 'false';
        document.getElementById('investment-editing').value = 'true';
        
        // Set goal
        document.querySelector(`input[name="investment-goal"][value="${investment.goal}"]`).checked = true;
        
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
            document.getElementById('investment-price').value = investment.price;
            document.getElementById('investment-currency').value = investment.currency;
            this.calculateAmount();
        } else if (investment.type === 'GOLD') {
            document.getElementById('investment-quantity').value = investment.quantity;
            document.getElementById('investment-price').value = investment.price;
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
            Toast.error('Investment not found');
            return;
        }
        
        const modal = document.getElementById('delete-confirm-modal');
        const message = document.getElementById('delete-confirm-message');
        
        message.innerHTML = `Are you sure you want to delete this investment?<br><br><strong>${investment.name}</strong> [${investment.type}]<br><br>⚠️ This action cannot be recovered!`;
        
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
        Toast.success('Investment deleted successfully');
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
            Toast.info('No shares in portfolio yet');
            return;
        }
        
        const modal = document.getElementById('share-price-modal');
        const list = document.getElementById('share-prices-list');
        
        list.innerHTML = activeShares.map(share => `
            <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-semibold text-gray-800">${share.name}</span>
                    <div class="flex gap-2">
                        <button onclick="Investments.reloadSingleSharePrice('${share.name}')" 
                                class="text-yellow-600 hover:text-yellow-800 transition-all" title="Reload Price">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                        </button>
                        <button onclick="Investments.deleteSharePrice('${share.name}')" 
                                class="text-red-600 hover:text-red-800" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="text-center">
                    <p class="text-2xl font-bold text-gray-800">${share.currency === 'USD' ? '$' : '₹'}${Utils.formatIndianNumber(share.price)}</p>
                    <p class="text-xs text-gray-500 mt-1">Updated: ${new Date(share.lastUpdated).toLocaleString()}</p>
                </div>
            </div>
        `).join('');
        
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
    reloadAllSharePrices() {
        Toast.info('📊 Share price reload feature coming soon! Will integrate with stock price API.');
        // TODO: Integrate with stock price API
    },

    /**
     * Reload single share price (placeholder for API integration)
     */
    reloadSingleSharePrice(shareName) {
        Toast.info(`📊 Reloading price for ${shareName}... (API integration coming soon)`);
        // TODO: Integrate with stock price API for single share
    },

    /**
     * Delete share price from storage
     */
    deleteSharePrice(shareName) {
        const sharePrices = window.DB.sharePrices || [];
        const index = sharePrices.findIndex(sp => sp.name === shareName);
        
        if (index !== -1) {
            sharePrices.splice(index, 1);
            window.DB.sharePrices = sharePrices;
            window.Storage.save();
            
            Toast.success('Share price removed from tracking');
            this.openSharePriceModal(); // Refresh the modal
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
            Toast.error('Please enter a valid exchange rate');
            return;
        }
        
        window.DB.exchangeRate = newRate;
        window.Storage.save();
        
        Toast.success('Exchange rate updated successfully! Portfolio values recalculated.');
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
            Toast.error('Please enter a valid gold rate');
            return;
        }
        
        window.DB.goldRatePerGram = newRate;
        window.Storage.save();
        
        Toast.success('Gold rate updated successfully! Portfolio values recalculated.');
        this.closeGoldRateModal();
        this.render();
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
     * Close date filter modal
     */
    closeDateFilterModal() {
        document.getElementById('investment-date-filter-modal').classList.add('hidden');
    },

    /**
     * Toggle custom date fields
     */
    toggleCustomDateFields() {
        const selected = document.querySelector('input[name="investment-date-filter"]:checked').value;
        const customFields = document.getElementById('investment-custom-date-fields');
        
        if (selected === 'custom') {
            customFields.classList.remove('hidden');
        } else {
            customFields.classList.add('hidden');
        }
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
                Toast.error('Please select both start and end dates');
                return;
            }
            
            this.customDateRange = { start: startDate, end: endDate };
        }
        
        this.dateFilter = selected;
        this.closeDateFilterModal();
        this.renderMonthlySection();
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    window.Investments = Investments;
}
