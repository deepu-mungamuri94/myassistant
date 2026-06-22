/**
 * Dashboard Module
 * Provides overview of expenses, income, and EMI/Loan progress
 */

const Dashboard = {
    // Store selected month range
    selectedMonthRange: null,
    // Store selected filter month for second line cards
    selectedFilterMonth: null,
    // Store excluded categories (for category chart filtering)
    excludedCategories: null,
    // Investment chart instance
    investmentChartInstance: null,
    // Selected month for budget rule cards
    selectedBudgetMonth: null,
    // Selected month range for investments trend
    selectedInvestmentRange: null,
    // Credit card chart view mode: 'total' or 'individual'
    creditCardChartView: 'total',
    // Selected month range for credit card bills chart
    selectedCreditCardRange: null,
    // Investments chart view mode: 'total' or 'category'
    investmentsChartView: 'total',
    // First line cards month view: 'current' or 'next'
    firstLineMonthView: 'current',
    
    // Loading state for AI insights
    aiInsightsLoading: false,
    
    /**
     * Get AI expense insights cache (persisted in DB)
     */
    get aiExpenseInsightsCache() {
        if (!window.DB.aiExpenseInsights) {
            window.DB.aiExpenseInsights = {};
        }
        return window.DB.aiExpenseInsights;
    },

    // ===================================================================
    // Shared chart styling — keeps Income/Expense, Investments and Card-bill
    // charts visually consistent (gradient fills, soft slate grid, glowing
    // hover points, polished dark tooltips). All use the vendored Chart.js v4;
    // no new dependencies.
    // ===================================================================

    /** Format a rupee value for axis ticks (₹1.2L / ₹8k / ₹500). */
    _chartFmtY(value) {
        if (value >= 100000) return '₹' + (value / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
        if (value >= 1000)   return '₹' + (value / 1000).toFixed(0) + 'k';
        return '₹' + value;
    },

    /**
     * A top→bottom gradient for an area/bar fill. Returns the flat colour until
     * Chart.js has measured the plot area (first paint), then the gradient.
     */
    _chartGradient(context, c0, c1) {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return c0;
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, c0);
        g.addColorStop(1, c1);
        return g;
    },

    /** Shared modern tooltip (dark, rounded, point-style swatches, ₹ formatting). */
    _chartTooltip() {
        return {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            titleFont: { size: 12, weight: '600' },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 10,
            usePointStyle: true,
            boxPadding: 4,
            callbacks: {
                label: (c) => ' ' + (c.dataset.label || '') + ': ₹' + Math.round(c.parsed.y).toLocaleString('en-IN'),
            },
        };
    },

    /** Shared x/y scale config: hidden x grid, faint y grid, slate ticks, no borders. */
    _chartScales(opts = {}) {
        const ticks = { font: { size: 10 }, color: '#94a3b8' };
        return {
            x: {
                stacked: !!opts.stacked,
                grid: { display: false },
                ticks,
                border: { display: false },
            },
            y: {
                stacked: !!opts.stacked,
                beginAtZero: opts.beginAtZero !== false,
                grid: { color: 'rgba(148, 163, 184, 0.12)', drawTicks: false },
                border: { display: false },
                ticks: { ...ticks, maxTicksLimit: 5, callback: (v) => this._chartFmtY(v) },
            },
        };
    },

    /**
     * Shared entrance animation for line/bar charts — a smooth ease-out that
     * grows bars up from the baseline and draws lines in. Skipped when the user
     * prefers reduced motion. Use as `animation: this._chartAnimation()`.
     */
    _chartAnimation() {
        if (this._prefersReducedMotion()) return { duration: 0 };
        return { duration: 800, easing: 'easeOutQuart' };
    },

    /** Shared bottom legend (point-style, slate). */
    _chartLegend(display = true) {
        return {
            display,
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, padding: 12, font: { size: 10 }, color: '#64748b' },
        };
    },
    
    // Default category mappings for Needs vs Wants
    defaultNeedsCategories: [
        'Bills & Utilities', 'Groceries', 'Healthcare', 'Transportation', 
        'EMI', 'Loan EMI', 'Credit Card EMI', 'Rent', 'Insurance', 
        'Education', 'Personal & Family'
    ],
    defaultWantsCategories: [
        'Entertainment', 'Food & Dining', 'Shopping', 'Travel', 
        'Subscriptions', 'Gifts', 'Hobbies', 'Other'
    ],
    
    // Default budget rule percentages
    defaultBudgetRule: { needs: 50, wants: 30, invest: 20 },
    
    /**
     * Get budget rule percentages (user configured or default)
     */
    get budgetRule() {
        return window.DB.budgetRuleConfig || this.defaultBudgetRule;
    },
    
    /**
     * Check if loan EMIs should be included in budget calculation
     * Default: false (exclude loan EMIs)
     */
    get includeLoanEmis() {
        return window.DB.budgetIncludeLoanEmis === true;
    },
    
    /**
     * Get needs categories (user configured or default)
     */
    get needsCategories() {
        return window.DB.budgetCategoryConfig?.needs || this.defaultNeedsCategories;
    },
    
    /**
     * Get wants categories (user configured or default)
     */
    get wantsCategories() {
        return window.DB.budgetCategoryConfig?.wants || this.defaultWantsCategories;
    },
    
    /**
     * Initialize excluded categories from localStorage
     */
    initExcludedCategories() {
        if (this.excludedCategories !== null) return; // Already initialized
        
        try {
            const saved = localStorage.getItem('dashboard_excluded_categories');
            if (saved) {
                this.excludedCategories = new Set(JSON.parse(saved));
                
                // Safety check: ensure at least one category is visible
                const allData = this.getCategoryData(true);
                const visibleCount = allData.filter(item => !this.excludedCategories.has(item.category)).length;
                
                if (visibleCount === 0 && allData.length > 0) {
                    // If all categories are excluded, reset to default
                    console.warn('All categories were excluded. Resetting to defaults.');
                    this.excludedCategories = new Set(['EMI', 'Personal & Family']);
                    this.saveExcludedCategories();
                }
            } else {
                // Default exclusions: EMI and Personal & Family
                this.excludedCategories = new Set(['EMI', 'Personal & Family']);
                this.saveExcludedCategories();
            }
        } catch (e) {
            console.error('Error loading excluded categories:', e);
            this.excludedCategories = new Set(['EMI', 'Personal & Family']);
        }
    },
    
    /**
     * Save excluded categories to localStorage
     */
    saveExcludedCategories() {
        try {
            localStorage.setItem('dashboard_excluded_categories', JSON.stringify([...this.excludedCategories]));
        } catch (e) {
            console.error('Error saving excluded categories:', e);
        }
    },
    
    /**
     * Toggle category exclusion
     */
    toggleCategoryExclusion(category) {
        this.initExcludedCategories();
        
        if (this.excludedCategories.has(category)) {
            // Always allow re-enabling
            this.excludedCategories.delete(category);
        } else {
            // Check if this is the last visible category
            const allData = this.getCategoryData(true);
            const visibleCount = allData.filter(item => !this.excludedCategories.has(item.category)).length;
            
            if (visibleCount <= 1) {
                // Don't allow excluding the last category
                window.Toast.show('Cannot exclude the last category', 'error');
                return;
            }
            
            this.excludedCategories.add(category);
        }
        
        this.saveExcludedCategories();
        this.renderCategoryChart();
    },
    
    /**
     * Render dashboard
     */
    /**
     * True when the user has entered NO financial data at all. For brand-new
     * users the normal dashboard is a wall of ₹0 / "—" / "N/A" that looks
     * broken, so we show a friendly welcome + setup card instead (_renderWelcome).
     *
     * IMPORTANT: this must check EVERY store that produces a visible dashboard /
     * net-worth figure — otherwise we'd hide real data behind the welcome
     * screen. Cash & savings and money-lent both feed the Net Worth tile, and
     * plans/salaries are real user data too. Missing any of these would be a
     * silent data-hiding bug.
     */
    _isFirstRun() {
        const hasIncome = (this.getMinimumNetPay && this.getMinimumNetPay() > 0);
        const hasExpenses = (window.DB.expenses || []).length > 0;
        const hasInvestments = (window.DB.portfolioInvestments || []).length > 0
            || (window.DB.monthlyInvestments || []).length > 0;
        const hasLoans = (window.DB.loans || []).length > 0;
        const hasCards = (window.DB.cards || []).length > 0;
        const hasRecurring = window.RecurringExpenses && window.RecurringExpenses.getAll().length > 0;
        const cs = window.DB.cashSavings;
        const hasCash = !!cs && (((cs.current || 0) > 0) || ((cs.history || []).length > 0));
        const hasLent = (window.DB.moneyLent || []).length > 0;
        const hasPlans = (window.DB.plans || []).length > 0;
        const hasSalaries = (window.DB.salaries || []).length > 0;
        return !(hasIncome || hasExpenses || hasInvestments || hasLoans || hasCards
            || hasRecurring || hasCash || hasLent || hasPlans || hasSalaries);
    },

    /**
     * Welcome / get-started card shown to a brand-new user instead of empty
     * tiles. Guides them to the highest-value first actions.
     */
    _renderWelcome() {
        const step = (onclick, emoji, title, desc) => `
            <button onclick="${onclick}" class="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all text-left active:scale-[0.99]">
                <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">${emoji}</div>
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-gray-800">${title}</div>
                    <div class="text-xs text-gray-500 leading-snug">${desc}</div>
                </div>
                <div class="ml-auto text-gray-300 text-lg flex-shrink-0">›</div>
            </button>`;
        return `
            <div class="dash-card-hero text-center">
                <div class="text-4xl mb-2">👋</div>
                <h2 class="text-lg font-bold text-gray-800 mb-1">Welcome to your money dashboard</h2>
                <p class="text-xs text-gray-500 mb-4 px-2">Add a few details and this screen fills with your net worth, spending, budget and forecasts. Start with any of these:</p>
                <div class="space-y-2 text-left">
                    ${step("Navigation.navigateTo('income')", '💰', 'Add your income', 'Your salary/pay — powers budget % and forecasts.')}
                    ${step("Navigation.navigateTo('expenses')", '🧾', 'Log an expense', 'Track where your money goes.')}
                    ${step("FinancialHealth.showEmergencyFundBreakdown()", '🏦', 'Set your cash & savings', 'Unlocks net worth and emergency-fund coverage.')}
                    ${step("Navigation.navigateTo('investments')", '📈', 'Add an investment', 'Funds, stocks, FD, gold, EPF.')}
                </div>
                <p class="text-[11px] text-gray-400 mt-4">You can always reach these from the ☰ menu too.</p>
            </div>`;
    },

    render() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;

        // Initialize excluded categories
        this.initExcludedCategories();

        // Destroy all existing chart instances first
        this.destroyAllCharts();

        // Brand-new user with zero data → friendly welcome instead of a grid
        // of zeros that reads as a broken screen.
        if (this._isFirstRun()) {
            container.innerHTML = this._renderWelcome();
            return;
        }
        
        // Get number of months from selected range
        const monthsCount = this.getMonthsCount();
        
        // Get data for specified months
        const loans = this.getLoansData();
        
        container.innerHTML = `
            <!-- Net Worth + Emergency Fund tile (top-of-dashboard summary) -->
            ${window.FinancialHealth ? window.FinancialHealth.renderTile() : ''}

            <!-- Monthly Expenses Cards Box -->
            ${this.renderFirstLineCards()}

            ${this.renderMonthlyBreakdown()}

            ${this.renderNeedsWantsInvestments()}
            
            <!-- Category Expenses Chart -->
            <div class="dash-card-secondary dash-tier-break">
                <div class="flex justify-between items-center mb-3 max-w-full">
                    <h3 class="text-sm font-semibold">Expenses by Category</h3>
                    <div class="relative">
                        <input type="month" id="category-month-selector" value="${this.getCurrentMonthValue()}" onchange="Dashboard.updateCategoryButton(); Dashboard.renderCategoryChart()" class="absolute opacity-0 pointer-events-none" />
                        <button id="category-month-button" onclick="document.getElementById('category-month-selector').showPicker()" class="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(this.getCurrentMonthValue())} ▼
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-center max-w-full" style="height: 144px; gap: 16px;">
                    <div style="flex: 0 0 160px; max-width: 160px;">
                        <canvas id="category-chart"></canvas>
                    </div>
                    <div id="category-chart-legend" style="flex: 1; overflow-y: auto; max-height: 144px;"></div>
                </div>
            </div>
            
            <!-- Income vs Expenses Chart -->
            <div class="dash-card-secondary">
                <div class="flex justify-between items-center mb-1 max-w-full">
                    <h3 class="text-sm font-semibold">Income vs Expenses</h3>
                    <button onclick="Dashboard.openMonthRangeModal()" class="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                        <span id="month-range-label">${this.getMonthRangeLabel()}</span> ▼
                    </button>
                </div>
                <!-- Trend summary (income/expense totals + avg savings) — filled by renderIncomeExpenseChart -->
                <div id="ie-trend-summary" class="mb-2"></div>
                <div style="height: 400px; max-width: 100%;">
                    <canvas id="income-expense-chart"></canvas>
                </div>
            </div>
            
            <!-- Investments Chart -->
            ${this.renderInvestmentsSection()}
            
            <!-- Loans & EMIs (collapsed by default — reference data) -->
            ${loans.length > 0 ? `
            <details class="dash-card-secondary" id="loans-section" ontoggle="if(this.open) Dashboard.renderLoansChartIfNeeded()">
                <summary class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold">Loans & EMIs <span class="text-xs text-gray-400 font-normal">(${loans.length})</span></h3>
                    <span class="text-xs text-gray-400 details-arrow">▾</span>
                </summary>
                <div style="height: ${Math.max(200, Math.min(400, loans.length * 60))}px; max-width: 100%;">
                    <canvas id="loans-chart"></canvas>
                </div>
            </details>
            ` : ''}
            
            <!-- Credit Card Bills Chart -->
            ${this.renderCreditCardBillsSection()}
        `;
        
        // Add investment range modal if not exists
        if (!document.getElementById('investment-range-modal')) {
            const modalHtml = `
            <div id="investment-range-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeInvestmentRangeModal()">
                <div class="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Select Month Range</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
                            <input type="month" id="investment-range-start" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">End Month</label>
                            <input type="month" id="investment-range-end" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-5">
                        <button onclick="Dashboard.applyInvestmentRange()" class="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all">
                            Apply
                        </button>
                        <button onclick="Dashboard.resetInvestmentRange()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-all">
                            Reset
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        // Initialize charts after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.initializeCharts();
        }, 100);

        // Animate the meter numbers on first paint, and keep animating on every
        // partial re-render (month switches replace section markup via
        // outerHTML/innerHTML — see _installMeterAnimator).
        this._installMeterAnimator();
        this._animateMeters(container);

        // Surface a one-shot popup if Needs or Wants have exceeded their cap
        // for the current month. Dismissal is keyed by YYYY-MM, so it resets
        // automatically next calendar month. Run on a microtask so it doesn't
        // block the dashboard's first paint.
        setTimeout(() => this._maybeShowBudgetExceededPopup(), 250);
    },

    /**
     * Install a one-time MutationObserver on #dashboard-content that runs the
     * count-up whenever new meters are inserted. This covers the partial
     * re-render paths (switchFirstLineMonthView, updateBudgetMonth, filter
     * month change, etc.) without having to call _animateMeters at each site.
     * The CSS ring sweep self-triggers on element creation, so the observer
     * only needs to drive the numbers. Coalesced via requestAnimationFrame so
     * a burst of mutations animates once.
     */
    _installMeterAnimator() {
        if (this._meterObserver) return; // already installed
        const container = document.getElementById('dashboard-content');
        if (!container || typeof MutationObserver === 'undefined') return;

        let queued = false;
        this._meterObserver = new MutationObserver((mutations) => {
            const hasNewMeter = mutations.some((m) =>
                Array.from(m.addedNodes).some((n) =>
                    n.nodeType === 1 && (n.matches?.('.meter-val[data-count-to]') || n.querySelector?.('.meter-val[data-count-to]'))
                )
            );
            if (!hasNewMeter || queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                this._animateMeters(container);
            });
        });
        this._meterObserver.observe(container, { childList: true, subtree: true });
    },

    /**
     * Render First Line Cards (Recurring, Loans/EMIs, Regular Expenses)
     */
    /**
     * Render one circular "meter-reading" gauge for a KPI tile.
     *
     * The conic-gradient ring (see .meter in styles.css) fills clockwise to
     * `pct`; the value sits in the centre with the ₹ amount under it and the
     * label below the dial. Replaces the old solid gradient tiles — every KPI
     * here is a percentage, so a ring fill is a meaningful glanceable visual.
     *
     * @param {Object} o
     * @param {string} o.label   - text under the circle (e.g. "Needs")
     * @param {string|number} o.value - headline number (already rounded/fixed). Pass 'N/A' to dim it.
     * @param {number} o.pct     - 0–100 fill for the ring (clamped). Defaults to value when numeric.
     * @param {string} o.amount  - sub-line under the value (e.g. "₹38,200"). Optional.
     * @param {string} o.c1      - ring gradient start colour (hex).
     * @param {string} o.c2      - ring gradient end colour (hex).
     * @param {string} [o.onclick] - click handler; omit for a non-interactive dial.
     * @param {string} [o.status]  - small marker shown after the label (✓ / ⚠ / ↓ …).
     * @param {string} [o.prefix]  - prepended to the value (e.g. "~" for projected).
     * @param {string} [o.unit]    - unit glyph after the value (default "%"). Pass '' to drop it.
     */
    _renderMeter(o) {
        const isNA = o.value === 'N/A' || o.value === null || o.value === undefined;
        const pctRaw = o.pct != null ? o.pct : (isNA ? 0 : parseFloat(o.value));
        const pct = Math.max(0, Math.min(100, isNaN(pctRaw) ? 0 : pctRaw));
        const unit = o.unit != null ? o.unit : '%';
        // The numeric headline counts up on render (see _animateMeters). We tag
        // it with data-count-to (the target number) and data-suffix (the unit
        // glyph in a faded span) so the animator can rebuild the markup each
        // frame. Non-numeric headlines (N/A, "—") are left static.
        let valHtml;
        if (isNA) {
            valHtml = `<div class="meter-val meter-na">N/A</div>`;
        } else {
            const num = parseFloat(o.value);
            const animatable = !isNaN(num);
            const suffix = unit ? `<span>${unit}</span>` : '';
            const countAttrs = animatable
                ? ` data-count-to="${num}" data-decimals="${(String(o.value).split('.')[1] || '').length}" data-prefix="${o.prefix || ''}" data-suffix="${unit}"`
                : '';
            valHtml = `<div class="meter-val"${countAttrs}>${o.prefix || ''}${o.value}${suffix}</div>`;
        }
        const onclick = o.onclick ? ` onclick="${o.onclick}"` : '';
        // --pct-target is the real fill; the CSS meter-fill keyframe animates
        // the registered --pct from 0 up to it on creation.
        return `
            <div class="meter-wrap"${onclick}>
                <div class="meter" style="--pct-target:${pct}; --c1:${o.c1}; --c2:${o.c2};">
                    <div class="meter-inner">
                        ${valHtml}
                        ${o.amount ? `<div class="meter-amt">${o.amount}</div>` : ''}
                    </div>
                </div>
                <div class="meter-label">${o.label}</div>
                ${o.status ? `<div class="meter-status">${o.status}</div>` : ''}
            </div>`;
    },

    /**
     * Count-up animation for meter headline numbers. Scans a container for
     * `.meter-val[data-count-to]` elements and tweens each from 0 to its target
     * over ~0.9s (matching the ring sweep), preserving the original decimals,
     * prefix (e.g. "~") and unit suffix. Honours prefers-reduced-motion by
     * snapping straight to the final value. Idempotent: the data-count-to attr
     * is removed once animated so re-scans skip already-done numbers.
     */
    _animateMeters(root) {
        const scope = root || document.getElementById('dashboard-content');
        if (!scope) return;
        const els = scope.querySelectorAll('.meter-val[data-count-to]');
        if (!els.length) return;

        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const fmt = (n, decimals, prefix, suffix) =>
            `${prefix}${n.toFixed(decimals)}${suffix ? `<span>${suffix}</span>` : ''}`;

        els.forEach((el) => {
            const target = parseFloat(el.dataset.countTo);
            const decimals = parseInt(el.dataset.decimals, 10) || 0;
            const prefix = el.dataset.prefix || '';
            const suffix = el.dataset.suffix || '';
            el.removeAttribute('data-count-to'); // mark done

            if (reduce || isNaN(target)) {
                el.innerHTML = fmt(target || 0, decimals, prefix, suffix);
                return;
            }

            const duration = 900;
            let startTs = null;
            const step = (ts) => {
                if (startTs === null) startTs = ts;
                const t = Math.min(1, (ts - startTs) / duration);
                // easeOutCubic — fast start, gentle settle (matches the ring).
                const eased = 1 - Math.pow(1 - t, 3);
                el.innerHTML = fmt(target * eased, decimals, prefix, suffix);
                if (t < 1) requestAnimationFrame(step);
                else el.innerHTML = fmt(target, decimals, prefix, suffix);
            };
            requestAnimationFrame(step);
        });
    },

    renderFirstLineCards() {
        const isCurrent = this.firstLineMonthView === 'current';
        const now = new Date();
        const targetYear = isCurrent ? now.getFullYear() : (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
        const targetMonth = isCurrent ? now.getMonth() + 1 : (now.getMonth() === 11 ? 1 : now.getMonth() + 2);
        
        // Get formatted month name (e.g., "Dec 2024")
        const targetDate = new Date(targetYear, targetMonth - 1, 1);
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        const minNetPay = this.getMinimumNetPay();
        const recurringExpenses = this.getTotalRecurringExpensesForMonth(targetYear, targetMonth);
        const totalEmis = this.getTotalEmisForMonth(targetYear, targetMonth);
        // For regular expenses: use actual for current month, projected average for next month
        const regularExpenses = isCurrent ? this.getRegularExpenses() : this.getProjectedRegularExpenses();
        const isProjected = !isCurrent;
        
        const recurringPercent = minNetPay > 0 ? ((recurringExpenses / minNetPay) * 100).toFixed(1) : 0;
        const emisPercent = minNetPay > 0 ? ((totalEmis / minNetPay) * 100).toFixed(1) : 0;
        const regularPercent = minNetPay > 0 ? ((regularExpenses / minNetPay) * 100).toFixed(1) : 0;
        
        // "Other" — short label so it fits one line on the dashboard tile.
        // The bucket is "everything that isn't recurring or an EMI" but the
        // tile is too small for the long form; the modal title and AI prompt
        // still spell it out as "Other spend" for clarity.
        const regularLabel = 'Other spend';
        
        return `
        <div class="dash-card-primary" id="first-line-cards-section">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-700">Outflows by type — ${monthName}</h3>
                <div class="flex bg-gray-100 rounded-lg p-0.5">
                    <button onclick="Dashboard.switchFirstLineMonthView('current')" 
                        class="px-2 py-1 text-xs rounded-md transition-all ${isCurrent ? 'bg-white shadow-sm text-purple-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                        Current
                    </button>
                    <button onclick="Dashboard.switchFirstLineMonthView('next')" 
                        class="px-2 py-1 text-xs rounded-md transition-all ${!isCurrent ? 'bg-white shadow-sm text-purple-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                        Next
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 max-w-full">
                ${this._renderMeter({
                    label: 'Recurring',
                    value: recurringPercent,
                    amount: `₹${Utils.formatIndianNumber(recurringExpenses)}`,
                    c1: '#f97316', c2: '#f59e0b',
                    onclick: `Dashboard.showMonthList('recurring', ${targetYear}, ${targetMonth})`
                })}
                ${this._renderMeter({
                    label: 'Loans & EMIs',
                    value: emisPercent,
                    amount: `₹${Utils.formatIndianNumber(totalEmis)}`,
                    c1: '#3b82f6', c2: '#4f46e5',
                    onclick: `Dashboard.showMonthList('emis', ${targetYear}, ${targetMonth})`
                })}
                ${this._renderMeter({
                    label: regularLabel,
                    value: regularPercent,
                    prefix: isProjected ? '~' : '',
                    amount: `${isProjected ? '~' : ''}₹${Utils.formatIndianNumber(regularExpenses)}`,
                    c1: '#14b8a6', c2: '#0d9488',
                    status: isProjected ? '<span class="text-[11px] text-teal-600 font-semibold">est.</span>' : '',
                    onclick: `Dashboard.showMonthList('regular', ${targetYear}, ${targetMonth})`
                })}
            </div>
            ${isCurrent ? this.renderSettlementSection(targetYear, targetMonth) : ''}
            ${!isCurrent ? this.renderAIInsightsSection(targetYear, targetMonth) : ''}
        </div>
        `;
    },
    
    /**
     * Render Settlement Calculations Section for current month
     */
    renderSettlementSection(year, month) {
        return `
            <div class="mt-3 pt-3 border-t border-gray-200">
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center shadow-sm">
                            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                            </svg>
                        </div>
                        <div>
                            <span class="text-xs font-medium text-green-700">Outflow Overview</span>
                        </div>
                    </div>
                    <button onclick="Dashboard.showSettlementModal(${year}, ${month})" 
                            class="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        View
                    </button>
                </div>
            </div>
        `;
    },
    
    /**
     * Switch first line cards month view
     */
    switchFirstLineMonthView(view) {
        this.firstLineMonthView = view;
        const section = document.getElementById('first-line-cards-section');
        if (section) {
            section.outerHTML = this.renderFirstLineCards();
        }
    },
    
    /**
     * Render AI Insights Section for next month projection
     */
    renderAIInsightsSection(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const cached = this.aiExpenseInsightsCache[monthKey];
        
        return `
            <div class="mt-3 pt-3 border-t border-gray-200" id="ai-insights-section">
                <div id="ai-insights-content">
                    ${this.getAIInsightsContent(year, month)}
                </div>
            </div>
        `;
    },
    
    /**
     * Render Investments section
     */
    renderInvestmentsSection() {
        const isTotal = this.investmentsChartView === 'total';
        
        return `
        <div class="dash-card-secondary" id="investments-section">
            <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 class="text-sm font-semibold">📈 Investments</h3>
                <div class="flex items-center gap-2">
                    <button onclick="Dashboard.openInvestmentRangeModal()" class="px-2 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                        <span id="investment-range-label">${this.getInvestmentRangeLabel()}</span> ▼
                    </button>
                    <div class="flex bg-gray-100 rounded-lg p-0.5">
                        <button onclick="Dashboard.switchInvestmentsChartView('total')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${isTotal ? 'bg-white shadow-sm text-emerald-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            Total
                        </button>
                        <button onclick="Dashboard.switchInvestmentsChartView('category')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${!isTotal ? 'bg-white shadow-sm text-emerald-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            By Type
                        </button>
                    </div>
                </div>
            </div>
            <div style="height: 300px; max-width: 100%;">
                <canvas id="investments-trend-chart"></canvas>
            </div>
        </div>
        `;
    },
    
    /**
     * Switch investments chart view
     */
    switchInvestmentsChartView(view) {
        this.investmentsChartView = view;
        
        // Destroy existing chart
        if (this.investmentChartInstance) {
            this.investmentChartInstance.destroy();
            this.investmentChartInstance = null;
        }
        
        // Re-render the section
        const section = document.getElementById('investments-section');
        if (section) {
            section.outerHTML = this.renderInvestmentsSection();
            this.renderInvestmentsTrendChart();
        }
    },
    
    /**
     * Render Credit Card Bills section
     */
    renderCreditCardBillsSection(forceOpen = true) {
        const paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && b.paidAt);
        if (paidBills.length === 0) return '';

        const isTotal = this.creditCardChartView === 'total';
        // CC Bills is one of the most-checked sections, so we open it by
        // default. <details> retains its toggle behaviour — users can still
        // collapse it manually; we just don't start collapsed.
        const openAttr = forceOpen ? ' open' : '';

        return `
        <details class="dash-card-secondary" id="credit-card-bills-section"${openAttr} ontoggle="if(this.open) Dashboard.renderCreditCardBillsChartIfNeeded()">
            <summary class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold">💳 Credit Card Bills</h3>
                <span class="text-xs text-gray-400 details-arrow">▾</span>
            </summary>
            <div class="flex items-center justify-end gap-2 mb-3 flex-wrap">
                <div class="flex items-center gap-2">
                    <button onclick="Dashboard.openCreditCardRangeModal()" class="px-2 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                        <span id="credit-card-range-label">${this.getCreditCardRangeLabel()}</span> ▼
                    </button>
                    <div class="flex bg-gray-100 rounded-lg p-0.5">
                        <button onclick="Dashboard.switchCreditCardChartView('total')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${isTotal ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            Total
                        </button>
                        <button onclick="Dashboard.switchCreditCardChartView('individual')" 
                            class="px-2 py-1 text-xs rounded-md transition-all ${!isTotal ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}">
                            By Card
                        </button>
                    </div>
                </div>
            </div>
            <div style="height: 220px; max-width: 100%;">
                <canvas id="credit-card-bills-chart"></canvas>
            </div>
        </details>
        `;
    },

    /**
     * Switch credit card chart view
     */
    switchCreditCardChartView(view) {
        this.creditCardChartView = view;
        
        // Destroy existing chart
        if (this.creditCardBillsChartInstance) {
            this.creditCardBillsChartInstance.destroy();
            this.creditCardBillsChartInstance = null;
        }
        
        // Re-render the section, preserving the open/closed state
        const section = document.getElementById('credit-card-bills-section');
        if (section) {
            const wasOpen = section.open;
            section.outerHTML = this.renderCreditCardBillsSection(wasOpen);
            if (wasOpen) this.renderCreditCardBillsChart();
        }
    },

    /**
     * Get credit card range label
     */
    getCreditCardRangeLabel() {
        if (!this.selectedCreditCardRange) {
            return 'Last 6 months';
        }
        const start = this.getFormattedMonth(this.selectedCreditCardRange.start);
        const end = this.getFormattedMonth(this.selectedCreditCardRange.end);
        return `${start} - ${end}`;
    },
    
    /**
     * Open credit card range modal
     */
    openCreditCardRangeModal() {
        // Create modal if it doesn't exist
        if (!document.getElementById('credit-card-range-modal')) {
            const modalHtml = `
            <div id="credit-card-range-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeCreditCardRangeModal()">
                <div class="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Select Month Range</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
                            <input type="month" id="cc-range-start" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">End Month</label>
                            <input type="month" id="cc-range-end" class="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-5">
                        <button onclick="Dashboard.applyCreditCardRange()" class="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all">
                            Apply
                        </button>
                        <button onclick="Dashboard.resetCreditCardRange()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all">
                            Reset
                        </button>
                        <button onclick="Dashboard.closeCreditCardRangeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        const modal = document.getElementById('credit-card-range-modal');
        
        // Set default values
        const now = new Date();
        const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (this.selectedCreditCardRange) {
            document.getElementById('cc-range-start').value = this.selectedCreditCardRange.start;
            document.getElementById('cc-range-end').value = this.selectedCreditCardRange.end;
        } else {
            document.getElementById('cc-range-start').value = startMonth;
            document.getElementById('cc-range-end').value = endMonth;
        }
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close credit card range modal
     */
    closeCreditCardRangeModal() {
        const modal = document.getElementById('credit-card-range-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Apply credit card range selection
     */
    applyCreditCardRange() {
        const start = document.getElementById('cc-range-start').value;
        const end = document.getElementById('cc-range-end').value;
        
        if (!start || !end) {
            alert('Please select both start and end months');
            return;
        }
        
        // Validate range
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        
        if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
            alert('Start month must be before end month');
            return;
        }
        
        this.selectedCreditCardRange = { start, end };
        this.closeCreditCardRangeModal();
        
        // Update label
        const label = document.getElementById('credit-card-range-label');
        if (label) {
            label.textContent = this.getCreditCardRangeLabel();
        }
        
        // Re-render chart
        if (this.creditCardBillsChartInstance) {
            this.creditCardBillsChartInstance.destroy();
            this.creditCardBillsChartInstance = null;
        }
        this.renderCreditCardBillsChart();
    },
    
    /**
     * Reset credit card range to default (last 6 months)
     */
    resetCreditCardRange() {
        this.selectedCreditCardRange = null;
        this.closeCreditCardRangeModal();
        
        // Update label
        const label = document.getElementById('credit-card-range-label');
        if (label) {
            label.textContent = this.getCreditCardRangeLabel();
        }
        
        // Re-render chart
        if (this.creditCardBillsChartInstance) {
            this.creditCardBillsChartInstance.destroy();
            this.creditCardBillsChartInstance = null;
        }
        this.renderCreditCardBillsChart();
    },
    
    /**
     * Destroy all chart instances
     */
    destroyAllCharts() {
        // Reset lazy-render flags so collapsed charts re-render after a full dashboard refresh
        this._loansChartRendered = false;
        this._ccBillsChartRendered = false;
        if (this.incomeExpenseChartInstance) {
            try {
                this.incomeExpenseChartInstance.destroy();
                this.incomeExpenseChartInstance = null;
            } catch (e) {
                console.error('Error destroying income/expense chart:', e);
            }
        }
        if (this.categoryChartInstance) {
            try {
                this.categoryChartInstance.destroy();
                this.categoryChartInstance = null;
            } catch (e) {
                console.error('Error destroying category chart:', e);
            }
        }
        if (this.loansChartInstance) {
            try {
                this.loansChartInstance.destroy();
                this.loansChartInstance = null;
            } catch (e) {
                console.error('Error destroying loans chart:', e);
            }
        }
        if (this.creditCardBillsChartInstance) {
            try {
                this.creditCardBillsChartInstance.destroy();
                this.creditCardBillsChartInstance = null;
            } catch (e) {
                console.error('Error destroying credit card bills chart:', e);
            }
        }
        if (this.investmentChartInstance) {
            try {
                this.investmentChartInstance.destroy();
                this.investmentChartInstance = null;
            } catch (e) {
                console.error('Error destroying investment chart:', e);
            }
        }
        if (this.cashFlowTrendChartInstance) {
            try {
                this.cashFlowTrendChartInstance.destroy();
                this.cashFlowTrendChartInstance = null;
            } catch (e) {
                console.error('Error destroying cash-flow trend chart:', e);
            }
        }
    },
    
    /**
     * Get expenses data for last N months or custom range
     * Uses budget month if available, falls back to expense date
     */
    getExpensesData(monthsCount = 6) {
        const monthsData = [];
        const expenses = window.DB.expenses || [];
        
        // Use custom range if selected
        if (this.selectedMonthRange) {
            const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Get expenses for this month using budget month
                const monthExpenses = expenses.filter(exp => {
                    const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                    return expYear === currentYear && expMonth === currentMonth;
                });
                
                const totalWithLoans = monthExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
                
                // Filter out Loan EMI expenses to get withoutLoans total
                const totalWithoutLoans = monthExpenses
                    .filter(exp => exp.category !== 'Loan EMI')
                    .reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
                
                monthsData.push({
                    label: monthName,
                    withoutLoans: totalWithoutLoans,
                    withLoans: totalWithLoans
                });
                
                // Move to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
            
            return monthsData;
        }
        
        // Default: last N months
        const now = new Date();
        for (let i = monthsCount - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            
            // Get expenses for this month using budget month
            const monthExpenses = expenses.filter(exp => {
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                return expYear === year && expMonth === month;
            });
            
            const totalWithoutLoans = monthExpenses
                .filter(exp => exp.category !== 'Loan EMI')
                .reduce((sum, exp) => sum + exp.amount, 0);
                
            const totalWithLoans = monthExpenses
                .reduce((sum, exp) => sum + exp.amount, 0);
            
            monthsData.push({
                label: monthName,
                withoutLoans: totalWithoutLoans,
                withLoans: totalWithLoans
            });
        }
        
        return monthsData;
    },
    
    /**
     * Get income data for last N months or custom range
     * Uses actual salary data if available, fallback to estimated payslips
     * Respects pay schedule setting - shifts income by 1 month if 'last_week'
     */
    getIncomeData(monthsCount = 6) {
        const monthsData = [];
        
        const income = window.DB.income;
        const salaries = window.DB.salaries || [];
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        
        if (!income || !income.ctc) {
            return [];
        }
        
        // Generate payslips for all months (fallback)
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        /**
         * Helper function to get income for a specific expense month
         * If pay schedule is 'last_week', get previous month's income
         * Includes salary + additional income (bonus, freelance, etc.)
         */
        const getIncomeForMonth = (expenseYear, expenseMonth) => {
            let incomeYear, incomeMonth;
            
            if (paySchedule === 'last_week') {
                // Shift back by 1 month
                incomeMonth = expenseMonth === 1 ? 12 : expenseMonth - 1;
                incomeYear = expenseMonth === 1 ? expenseYear - 1 : expenseYear;
            } else {
                incomeMonth = expenseMonth;
                incomeYear = expenseYear;
            }
            
            // Get additional income for the month
            const additionalIncomeTotal = window.Income ? 
                window.Income.getAdditionalIncomeTotalForMonth(incomeMonth, incomeYear) : 0;
            
            // Try actual salary first
            const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
            if (actualSalary) {
                return actualSalary.amount + additionalIncomeTotal;
            }
            
            // Fallback to payslip + additional income
            const monthNamesLong = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const payslip = yearlyPayslips.find(p => p.month === monthNamesLong[incomeMonth - 1]);
            return (payslip ? payslip.totalNetPay : 0) + additionalIncomeTotal;
        };
        
        // Use custom range if selected
        if (this.selectedMonthRange) {
            const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });
                
                const incomeAmount = getIncomeForMonth(currentYear, currentMonth);
                
                monthsData.push({
                    label: shortMonth,
                    income: incomeAmount
                });
                
                // Move to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
            
            return monthsData;
        }
        
        // Default: last N months
        const now = new Date();
        for (let i = monthsCount - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });
            
            const incomeAmount = getIncomeForMonth(year, month);
            
            monthsData.push({
                label: shortMonth,
                income: incomeAmount
            });
        }
        
        return monthsData;
    },
    
    /**
     * Get active loans/EMIs data
     */
    getLoansData() {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const result = [];
        
        // Process loans
        loans.forEach(loan => {
            if (loan.status === 'active') {
                const remaining = loan.tenure - (loan.paidEmis || 0);
                if (remaining > 0) {
                    result.push({
                        name: loan.reason || loan.type,
                        remaining: remaining,
                        total: loan.tenure
                    });
                }
            }
        });
        
        // Process card EMIs
        cards.forEach(card => {
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (emi.status === 'active') {
                        const remaining = emi.totalEmis - emi.paidEmis;
                        if (remaining > 0) {
                            result.push({
                                name: `${card.nickname || card.name} - ${emi.reason}`,
                                remaining: remaining,
                                total: emi.totalEmis
                            });
                        }
                    }
                });
            }
        });
        
        return result;
    },
    
    /**
     * Initialize charts
     */
    initializeCharts() {
        // Check if Chart.js is loaded
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded');
            return;
        }

        // Each chart in its OWN try/catch — previously these were wrapped in a
        // single block, so a throw in any earlier chart silently aborted the
        // chain. The Investments chart is rendered last, so a hiccup elsewhere
        // (empty data, missing canvas, transient DOM state) made it disappear
        // until the user changed the timeframe (which calls render directly).
        const safe = (label, fn) => {
            try { fn(); } catch (err) { console.error(`Error initializing ${label}:`, err); }
        };

        safe('income/expense chart', () => this.renderIncomeExpenseChart());
        safe('category chart', () => this.renderCategoryChart());
        // Loans + Credit Card Bills are inside <details>. Rendering Chart.js
        // into a hidden parent gives a 0×0 canvas, so we lazy-render on first
        // open via renderLoansChartIfNeeded / renderCreditCardBillsChartIfNeeded.
        // CC Bills now defaults to open, so we render it eagerly here.
        const loansEl = document.getElementById('loans-section');
        if (loansEl && loansEl.open) safe('loans chart', () => this.renderLoansChart());
        const ccEl = document.getElementById('credit-card-bills-section');
        if (ccEl && ccEl.open) safe('credit card bills chart', () => this.renderCreditCardBillsChart());
        safe('investments trend chart', () => this.renderInvestmentsTrendChart());
    },

    /**
     * Lazy chart renderers — invoked the first time a collapsible section opens.
     */
    renderLoansChartIfNeeded() {
        if (this._loansChartRendered) return;
        this._loansChartRendered = true;
        try { this.renderLoansChart(); } catch (e) { console.error(e); this._loansChartRendered = false; }
    },

    renderCreditCardBillsChartIfNeeded() {
        if (this._ccBillsChartRendered) return;
        this._ccBillsChartRendered = true;
        try { this.renderCreditCardBillsChart(); } catch (e) { console.error(e); this._ccBillsChartRendered = false; }
    },
    
    /**
     * Render Credit Card Bills Chart
     */
    renderCreditCardBillsChart() {
        const canvas = document.getElementById('credit-card-bills-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Get all paid bills (check both paidAt and paidDate for backward compatibility)
        let paidBills = (window.DB.cardBills || []).filter(b => b.isPaid && (b.paidAt || b.paidDate));
        if (paidBills.length === 0) return;
        
        // Get credit cards (non-placeholder)
        const creditCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        
        // Determine month range
        let rangeMonths = [];
        if (this.selectedCreditCardRange) {
            // Custom range selected
            const [startYear, startMonth] = this.selectedCreditCardRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedCreditCardRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                rangeMonths.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
        } else {
            // Default: last 6 months
            const now = new Date();
            for (let i = 5; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                rangeMonths.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
            }
        }
        
        // Filter bills to only include those in the selected range
        paidBills = paidBills.filter(b => {
            const paidDateValue = b.paidAt || b.paidDate;
            const d = new Date(paidDateValue);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return rangeMonths.includes(monthKey);
        });
        
        // Use only the months in the range that have data OR all range months for a complete view
        const allMonths = rangeMonths;
        
        // Format labels (MMM YY)
        const labels = allMonths.map(d => {
            const [year, month] = d.split('-');
            const date = new Date(year, month - 1);
            return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        });
        
        let datasets = [];
        
        if (this.creditCardChartView === 'total') {
            // Total view: Single line showing sum of all cards
            const totalDataPoints = allMonths.map(monthKey => {
                const [year, month] = monthKey.split('-');
                const monthBills = paidBills.filter(b => {
                    const paidDateValue = b.paidAt || b.paidDate;
                    const d = new Date(paidDateValue);
                    return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
                });
                return monthBills.reduce((sum, b) => sum + (parseFloat(b.paidAmount) || parseFloat(b.amount) || 0), 0);
            });
            
            // Monthly bills are discrete amounts → rounded gradient BARS read
            // more honestly than a connected line.
            datasets.push({
                label: 'Total Bills',
                data: totalDataPoints,
                backgroundColor: (c) => this._chartGradient(c, 'rgba(139,92,246,0.95)', 'rgba(139,92,246,0.45)'),
                hoverBackgroundColor: '#7c3aed',
                borderRadius: 8,
                borderSkipped: false,
                maxBarThickness: 38,
            });
        } else {
            // By-card view: STACKED bars — each month's bar splits into per-card
            // segments (total height = total bill). Far cleaner than N overlapping
            // lines and shows composition at a glance.
            const cardBillsMap = {};
            creditCards.forEach(card => {
                const cardIdStr = String(card.id);
                cardBillsMap[cardIdStr] = {
                    name: card.name,
                    bills: paidBills.filter(b => String(b.cardId) === cardIdStr)
                };
            });

            // Solid card colours (stacked segments — no per-bar gradient).
            const cardColors = ['#6366f1', '#ec4899', '#22c55e', '#f97316', '#0ea5e9', '#a855f7'];

            const activeCards = Object.keys(cardBillsMap).filter(id => cardBillsMap[id].bills.length > 0);
            let colorIndex = 0;
            activeCards.forEach((cardId, idx) => {
                const cardData = cardBillsMap[cardId];
                const color = cardColors[colorIndex % cardColors.length];
                colorIndex++;

                const dataPoints = allMonths.map(monthKey => {
                    const [year, month] = monthKey.split('-');
                    const monthBills = cardData.bills.filter(b => {
                        const paidDateValue = b.paidAt || b.paidDate;
                        const d = new Date(paidDateValue);
                        return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
                    });
                    return monthBills.reduce((sum, b) => sum + (parseFloat(b.paidAmount) || parseFloat(b.amount) || 0), 0);
                });

                datasets.push({
                    label: cardData.name,
                    data: dataPoints,
                    backgroundColor: color,
                    hoverBackgroundColor: color,
                    stack: 'bills',
                    // Round only the top-most segment for a clean stacked-bar cap.
                    borderRadius: idx === activeCards.length - 1 ? { topLeft: 6, topRight: 6 } : 0,
                    borderSkipped: false,
                    maxBarThickness: 38,
                });
            });
        }
        
        if (datasets.length === 0) return;
        
        this.creditCardBillsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: this._chartAnimation(),
                plugins: {
                    legend: this._chartLegend(this.creditCardChartView !== 'total'),
                    datalabels: { display: false },
                    tooltip: this._chartTooltip(),
                },
                // By-card view stacks per-card segments; total view is a single bar.
                scales: this._chartScales({ stacked: this.creditCardChartView !== 'total' }),
            }
        });
    },
    
    /**
     * Get budget month value
     */
    getBudgetMonthValue() {
        if (this.selectedBudgetMonth) {
            return this.selectedBudgetMonth;
        }
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    
    /**
     * Update budget month and re-render only budget cards
     */
    updateBudgetMonth() {
        const input = document.getElementById('budget-month-selector');
        if (input) {
            this.selectedBudgetMonth = input.value;
            // Re-render only the budget cards section
            const container = document.getElementById('budget-rule-container');
            if (container) {
                container.innerHTML = this.renderBudgetRuleContent();
            }
        }
    },
    
    /**
     * Render Needs/Wants/Investments cards
     */
    renderNeedsWantsInvestments() {
        return `
            <!-- Needs/Wants/Investments Cards -->
            <div id="budget-rule-container" class="dash-card-primary">
                ${this.renderBudgetRuleContent()}
            </div>
        `;
    },
    
    /**
     * Render budget rule content (for initial and updates)
     */
    renderBudgetRuleContent() {
        const budgetMonth = this.getBudgetMonthValue();
        const [year, month] = budgetMonth.split('-').map(Number);
        
        // Get income for this month
        const incomeData = this.getIncomeForExpenseComparison(year, month);
        const netPay = incomeData.income || 0;
        
        // Calculate needs, wants, and investments
        const needs = this.getNeedsTotal(year, month);
        const wants = this.getWantsTotal(year, month);
        const investments = this.getMonthInvestments(budgetMonth);
        
        // Calculate percentages
        const hasIncome = netPay > 0;
        const needsPercent = hasIncome ? ((needs / netPay) * 100).toFixed(1) : 'N/A';
        const wantsPercent = hasIncome ? ((wants / netPay) * 100).toFixed(1) : 'N/A';
        const investPercent = hasIncome ? ((investments / netPay) * 100).toFixed(1) : 'N/A';
        
        // Get budget rule percentages (user configurable)
        const rule = this.budgetRule;
        const needsIdeal = rule.needs;
        const wantsIdeal = rule.wants;
        const investIdeal = rule.invest;
        
        // Calculate differences from ideal
        const needsDiff = hasIncome ? (parseFloat(needsPercent) - needsIdeal).toFixed(1) : 0;
        const wantsDiff = hasIncome ? (parseFloat(wantsPercent) - wantsIdeal).toFixed(1) : 0;
        const investDiff = hasIncome ? (parseFloat(investPercent) - investIdeal).toFixed(1) : 0;
        
        // Three-zone classifier for spend categories (Needs / Wants):
        //   ok     → comfortably under the limit (more than 10pp of headroom)
        //   warn   → within 10pp of the limit (limit-10 ≤ % ≤ limit)
        //   danger → over the limit
        // The 10pp warning band is a soft cushion: by the time spend is within
        // 10% of the cap, behavior usually has to change to avoid breaching
        // mid-month. Investments only have an "is it ≥ ideal?" question, so we
        // leave its existing 2-state badge alone.
        const WARN_BAND = 10;
        const classifySpend = (pct, limit) => {
            const v = parseFloat(pct);
            if (Number.isNaN(v)) return 'ok';
            if (v > limit) return 'danger';
            if (v >= limit - WARN_BAND) return 'warn';
            return 'ok';
        };
        const needsZone = hasIncome ? classifySpend(needsPercent, needsIdeal) : 'ok';
        const wantsZone = hasIncome ? classifySpend(wantsPercent, wantsIdeal) : 'ok';

        const needsOk = hasIncome && parseFloat(needsPercent) <= needsIdeal;
        const wantsOk = hasIncome && parseFloat(wantsPercent) <= wantsIdeal;
        const investOk = hasIncome && parseFloat(investPercent) >= investIdeal;

        const needsStatus = hasIncome ? (needsOk ? '✓' : `+${needsDiff}%`) : '';
        const wantsStatus = hasIncome ? (wantsOk ? '✓' : `+${wantsDiff}%`) : '';
        const investStatus = hasIncome ? (investOk ? '✓' : `${investDiff}%`) : '';

        // Per-zone status for a circle meter's label. Plain coloured text
        // (no pill) so it reads cleanly under the dial on the light card.
        const meterZone = (zone, limit) => {
            if (zone === 'danger') return `<span class="text-[9px] text-red-600 font-semibold" title="Over ${limit}% — exceeded limit">&gt;${limit}%</span>`;
            if (zone === 'warn')   return `<span class="text-[9px] text-amber-500 font-semibold" title="Within 10% of the ${limit}% cap">⚠ ${limit}%</span>`;
            return `<span class="text-[9px] text-green-600 font-semibold">≤${limit}%</span>`;
        };
        
        // Budget rule title
        const ruleTitle = `Budget Split (${needsIdeal}/${wantsIdeal}/${investIdeal})`;

        // Show a tiny "re-enable alert" pill if the user dismissed this month's
        // exceeded-popup and is currently looking at that same month. The popup
        // only fires for the current calendar month, so the toggle is only
        // useful in that context.
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const showReEnable = budgetMonth === currentKey && this._isBudgetPopupDismissed(currentKey);
        
        return `
                <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-2">
                        <h3 class="text-sm font-semibold text-gray-700">${ruleTitle}</h3>
                        ${showReEnable ? `
                            <button onclick="Dashboard.reEnableBudgetPopup()"
                                    class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 text-[10px] font-semibold transition-colors"
                                    title="You've muted this month's exceeded-budget alert. Tap to re-enable.">
                                🔔 Alert muted
                            </button>
                        ` : ''}
                        <button onclick="Dashboard.openCategoryConfigModal()" class="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors" title="Configure categories & rule">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="relative">
                        <input type="month" id="budget-month-selector" value="${budgetMonth}" onchange="Dashboard.updateBudgetMonth()" class="absolute opacity-0 pointer-events-none" />
                        <button id="budget-month-button" onclick="document.getElementById('budget-month-selector').showPicker()" class="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(budgetMonth)} ▼
                        </button>
                    </div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 max-w-full">
                    ${this._renderMeter({
                        label: 'Needs',
                        value: hasIncome ? needsPercent : '—',
                        unit: hasIncome ? '%' : '',
                        pct: hasIncome ? parseFloat(needsPercent) : 0,
                        amount: hasIncome ? `₹${Utils.formatIndianNumber(Math.round(needs))}` : 'Add income →',
                        c1: '#1e3a8a', c2: '#1e40af',
                        status: hasIncome ? meterZone(needsZone, needsIdeal) : '',
                        onclick: hasIncome ? `Dashboard.showBudgetBreakdown('needs')` : `Navigation.navigateTo('income')`
                    })}
                    ${this._renderMeter({
                        label: 'Wants',
                        value: hasIncome ? wantsPercent : '—',
                        unit: hasIncome ? '%' : '',
                        pct: hasIncome ? parseFloat(wantsPercent) : 0,
                        amount: hasIncome ? `₹${Utils.formatIndianNumber(Math.round(wants))}` : 'Add income →',
                        c1: '#ec4899', c2: '#db2777',
                        status: hasIncome ? meterZone(wantsZone, wantsIdeal) : '',
                        onclick: hasIncome ? `Dashboard.showBudgetBreakdown('wants')` : `Navigation.navigateTo('income')`
                    })}
                    ${this._renderMeter({
                        label: 'Invest',
                        value: hasIncome ? investPercent : '—',
                        unit: hasIncome ? '%' : '',
                        pct: hasIncome ? parseFloat(investPercent) : 0,
                        amount: hasIncome ? `₹${Utils.formatIndianNumber(Math.round(investments))}` : 'Add income →',
                        c1: '#4f46e5', c2: '#9333ea',
                        status: hasIncome
                            ? (investOk
                                ? `<span class="text-[9px] text-green-600 font-semibold">≥${investIdeal}%</span>`
                                : `<span class="text-[9px] text-red-600 font-semibold">&lt;${investIdeal}%</span>`)
                            : '',
                        onclick: hasIncome ? `Dashboard.showBudgetBreakdown('investments')` : `Navigation.navigateTo('income')`
                    })}
                </div>
                ${this._renderBudgetZoneBanner({ needsZone, wantsZone, needsPercent, wantsPercent, needsIdeal, wantsIdeal })}
            </div>
        `;
    },

    /**
     * Banner under the Needs/Wants/Invest cards. Renders one line per category
     * that has crossed the warn or danger threshold. Hidden entirely when both
     * categories are in the green zone — no need to clutter the dashboard
     * with "all good" copy.
     */
    _renderBudgetZoneBanner({ needsZone, wantsZone, needsPercent, wantsPercent, needsIdeal, wantsIdeal }) {
        const lines = [];
        const line = (label, zone, pct, ideal) => {
            const pctStr = `${parseFloat(pct).toFixed(1)}%`;
            if (zone === 'danger') {
                return `
                    <div class="flex items-start gap-2 text-[11px] leading-snug bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                        <span class="text-red-600 flex-shrink-0">🚨</span>
                        <div class="text-red-700"><strong>${label} exceeded:</strong> ${pctStr} vs ${ideal}% cap. Plan better — trim non-essential spend or rebalance the rule.</div>
                    </div>
                `;
            }
            if (zone === 'warn') {
                return `
                    <div class="flex items-start gap-2 text-[11px] leading-snug bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                        <span class="text-amber-600 flex-shrink-0">⚠️</span>
                        <div class="text-amber-700"><strong>${label} approaching cap:</strong> ${pctStr} of income, cap is ${ideal}%. Watch the rest of the month.</div>
                    </div>
                `;
            }
            return '';
        };

        const needsLine = line('Needs', needsZone, needsPercent, needsIdeal);
        const wantsLine = line('Wants', wantsZone, wantsPercent, wantsIdeal);
        if (needsLine) lines.push(needsLine);
        if (wantsLine) lines.push(wantsLine);
        if (lines.length === 0) return '';

        return `<div class="mt-3 space-y-1.5">${lines.join('')}</div>`;
    },

    /**
     * Storage key for the "don't show again this month" dismissal.
     * Format: 'dashboard_budget_popup_dismissed_YYYY-MM'. Lives in localStorage
     * because it's a UX preference, not durable financial data — cleared by
     * design when the user clears site data, and naturally expires every month.
     */
    _budgetPopupDismissKey(monthKey) {
        return `dashboard_budget_popup_dismissed_${monthKey}`;
    },

    /**
     * Check whether the user has dismissed the popup for the given month.
     */
    _isBudgetPopupDismissed(monthKey) {
        try {
            return localStorage.getItem(this._budgetPopupDismissKey(monthKey)) === '1';
        } catch (e) {
            return false;
        }
    },

    /**
     * Persist the dismissal for the given month + close the popup.
     */
    dismissBudgetPopupForMonth(monthKey) {
        try {
            localStorage.setItem(this._budgetPopupDismissKey(monthKey), '1');
        } catch (e) { /* private mode etc. — best-effort */ }
        this.closeBudgetExceededPopup();
    },

    /**
     * Re-enable the popup for the current month after the user dismissed it.
     * Clears the flag, refreshes the budget card so the "muted" pill goes
     * away, and re-fires the popup immediately so the user gets confirmation
     * the alert is back on (rather than waiting for the next dashboard load).
     */
    reEnableBudgetPopup() {
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        try {
            localStorage.removeItem(this._budgetPopupDismissKey(currentKey));
        } catch (e) { /* best-effort */ }

        const container = document.getElementById('budget-rule-container');
        if (container) container.innerHTML = this.renderBudgetRuleContent();
        this._maybeShowBudgetExceededPopup();
    },

    closeBudgetExceededPopup() {
        const el = document.getElementById('budget-exceeded-popup');
        if (el) el.remove();
    },

    /**
     * Pop a single combined alert when Needs and/or Wants are over their cap
     * for the current calendar month. Skipped silently if:
     *   - no income data (we have nothing to compare against)
     *   - neither category is in the danger zone
     *   - the user has already dismissed this month
     *   - the user is viewing a non-current month via the budget picker
     *     (a popup tied to a back-dated month is misleading)
     */
    _maybeShowBudgetExceededPopup() {
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Tie the popup strictly to the current calendar month — past months
        // are read-only and a popup about them would be noise.
        const viewingKey = this.getBudgetMonthValue();
        if (viewingKey !== currentKey) return;

        if (this._isBudgetPopupDismissed(currentKey)) return;

        const [year, month] = currentKey.split('-').map(Number);
        const incomeData = this.getIncomeForExpenseComparison(year, month);
        const netPay = incomeData.income || 0;
        if (netPay <= 0) return;

        const needs = this.getNeedsTotal(year, month);
        const wants = this.getWantsTotal(year, month);
        const needsPct = (needs / netPay) * 100;
        const wantsPct = (wants / netPay) * 100;

        const rule = this.budgetRule;
        const breached = [];
        if (needsPct > rule.needs) breached.push({ label: 'Needs', pct: needsPct, cap: rule.needs });
        if (wantsPct > rule.wants) breached.push({ label: 'Wants', pct: wantsPct, cap: rule.wants });
        if (breached.length === 0) return;

        // Avoid stacking — if a previous popup is still on screen, replace it.
        this.closeBudgetExceededPopup();

        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const rows = breached.map(b => `
            <div class="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div>
                    <div class="text-sm font-bold text-red-800">${b.label}</div>
                    <div class="text-[11px] text-red-700">cap ${b.cap}%</div>
                </div>
                <div class="text-lg font-bold text-red-700">${b.pct.toFixed(1)}%</div>
            </div>
        `).join('');

        // Centred modal that pops in (see .popup-card / .popup-backdrop in
        // styles.css). A circular icon at the top replaces the old coloured
        // header bar so the card reads as one cohesive piece rather than a
        // detached banner floating at the screen edge.
        const html = `
        <div id="budget-exceeded-popup" class="popup-backdrop fixed inset-0 bg-slate-900/45 z-50 flex items-center justify-center p-5"
             style="backdrop-filter: blur(2px);"
             onclick="if(event.target===this) Dashboard.closeBudgetExceededPopup()">
            <div class="popup-card bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                <div class="p-5">
                    <div class="flex items-start gap-3 mb-3">
                        <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-xl">🚨</div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-base font-bold text-gray-900 leading-tight">Budget exceeded</h3>
                            <p class="text-xs text-gray-500 mt-0.5">${monthName}</p>
                        </div>
                        <button onclick="Dashboard.closeBudgetExceededPopup()" class="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0">×</button>
                    </div>
                    <p class="text-xs text-gray-600 leading-relaxed mb-3">
                        Your spending has crossed the budget rule. Trim non-essential spend or rebalance the rule.
                    </p>
                    <div class="space-y-2 mb-4">
                        ${rows}
                    </div>
                    <div class="flex gap-2">
                        <button onclick="Dashboard.dismissBudgetPopupForMonth('${currentKey}')"
                                class="flex-1 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors">
                            Don't show this month
                        </button>
                        <button onclick="Dashboard.closeBudgetExceededPopup()"
                                class="flex-1 px-3 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-bold rounded-lg hover:shadow-md transition-all">
                            Got it
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    /**
     * Open category configuration modal
     */
    openCategoryConfigModal() {
        // Get all expense categories
        const allCategories = window.ExpenseCategories ? window.ExpenseCategories.getAll().map(c => c.name) : [
            'Bills & Utilities', 'Groceries', 'Healthcare', 'Transportation',
            'EMI', 'Loan EMI', 'Credit Card EMI', 'Rent', 'Insurance',
            'Education', 'Personal & Family', 'Entertainment', 'Food & Dining',
            'Shopping', 'Travel', 'Subscriptions', 'Gifts', 'Hobbies', 'Other'
        ];
        
        // Get current config
        const currentNeeds = this.needsCategories;
        const currentWants = this.wantsCategories;
        const rule = this.budgetRule;
        
        // Create or update modal
        let modal = document.getElementById('category-config-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'category-config-modal';
            document.body.appendChild(modal);
        }
        
        const categoriesHtml = allCategories.map(cat => {
            const isNeeds = currentNeeds.some(c => c.toLowerCase() === cat.toLowerCase());
            const isWants = currentWants.some(c => c.toLowerCase() === cat.toLowerCase());
            const currentType = isNeeds ? 'needs' : (isWants ? 'wants' : 'none');
            
            return `
                <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span class="text-sm text-gray-700 flex-1">${cat}</span>
                    <div class="flex gap-1">
                        <button onclick="Dashboard.setCategoryType('${cat.replace(/'/g, "\\'")}', 'needs', this)" 
                                class="px-2 py-1 text-xs rounded-lg transition-all ${currentType === 'needs' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-amber-100'}">
                            Needs
                        </button>
                        <button onclick="Dashboard.setCategoryType('${cat.replace(/'/g, "\\'")}', 'wants', this)" 
                                class="px-2 py-1 text-xs rounded-lg transition-all ${currentType === 'wants' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-pink-100'}">
                            Wants
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) this.closeCategoryConfigModal(); };
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col">
                <div class="p-4 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-gray-800">Budget Rule Settings</h3>
                            <p class="text-xs text-gray-500">Configure percentages and category assignments</p>
                        </div>
                        <button onclick="Dashboard.closeCategoryConfigModal()" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg">×</button>
                    </div>
                </div>
                
                <!-- Budget Rule Percentages -->
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-pink-50">
                    <h4 class="text-sm font-semibold text-gray-700 mb-3">Budget Rule Percentages</h4>
                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="text-xs text-amber-700 font-medium">Needs ≤</label>
                            <div class="flex items-center mt-1">
                                <input type="number" id="rule-needs" value="${rule.needs}" min="0" max="100" 
                                       class="w-full p-2 border border-amber-300 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none">
                                <span class="ml-1 text-sm text-gray-500">%</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-pink-700 font-medium">Wants ≤</label>
                            <div class="flex items-center mt-1">
                                <input type="number" id="rule-wants" value="${rule.wants}" min="0" max="100" 
                                       class="w-full p-2 border border-pink-300 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none">
                                <span class="ml-1 text-sm text-gray-500">%</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-emerald-700 font-medium">Invest ≥</label>
                            <div class="flex items-center mt-1">
                                <input type="number" id="rule-invest" value="${rule.invest}" min="0" max="100" 
                                       class="w-full p-2 border border-emerald-300 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                                <span class="ml-1 text-sm text-gray-500">%</span>
                            </div>
                        </div>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2 text-center">Default: 50/30/20 • Total should ideally be 100%</p>
                </div>
                
                <!-- Loan EMI Toggle -->
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-semibold text-gray-700">Include Loan EMIs</h4>
                            <p class="text-[10px] text-gray-500 mt-0.5">Counts home / car / personal loan EMIs in budget split</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="include-loan-emis" class="sr-only peer" ${this.includeLoanEmis ? 'checked' : ''} onchange="Dashboard.toggleLoanEmis(this.checked)">
                            <div class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                    <p class="text-[10px] text-amber-600 mt-2">💡 Credit card EMIs are always included — only loan EMIs can be excluded.</p>
                </div>
                
                <!-- Category Assignments -->
                <div class="p-4 border-b border-gray-200">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">Category Assignments</h4>
                </div>
                <div class="flex-1 overflow-y-auto px-4 pb-4" id="category-config-list">
                    ${categoriesHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex gap-3">
                        <button onclick="Dashboard.resetCategoryConfig()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors text-sm">
                            Reset All
                        </button>
                        <button onclick="Dashboard.saveBudgetConfig()" class="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg transition-all text-sm">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Close category config modal
     */
    closeCategoryConfigModal() {
        const modal = document.getElementById('category-config-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Refresh budget cards
        const container = document.getElementById('budget-rule-container');
        if (container) {
            container.innerHTML = this.renderBudgetRuleContent();
        }
    },
    
    /**
     * Set category type (needs/wants)
     */
    setCategoryType(category, type, buttonEl) {
        // Initialize config if not exists
        if (!window.DB.budgetCategoryConfig) {
            window.DB.budgetCategoryConfig = {
                needs: [...this.defaultNeedsCategories],
                wants: [...this.defaultWantsCategories]
            };
        }
        
        const config = window.DB.budgetCategoryConfig;
        
        // Remove from both arrays first
        config.needs = config.needs.filter(c => c.toLowerCase() !== category.toLowerCase());
        config.wants = config.wants.filter(c => c.toLowerCase() !== category.toLowerCase());
        
        // Add to the selected type
        if (type === 'needs') {
            config.needs.push(category);
        } else if (type === 'wants') {
            config.wants.push(category);
        }
        
        // Save to storage
        window.Storage.save();
        
        // Update button styles in the row
        const row = buttonEl.parentElement;
        const needsBtn = row.querySelector('button:first-child');
        const wantsBtn = row.querySelector('button:last-child');
        
        // Reset both buttons
        needsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-gray-100 text-gray-600 hover:bg-amber-100';
        wantsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-gray-100 text-gray-600 hover:bg-pink-100';
        
        // Highlight selected
        if (type === 'needs') {
            needsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-amber-500 text-white';
        } else if (type === 'wants') {
            wantsBtn.className = 'px-2 py-1 text-xs rounded-lg transition-all bg-pink-500 text-white';
        }
    },
    
    /**
     * Toggle loan EMI inclusion in budget calculation
     */
    toggleLoanEmis(include) {
        window.DB.budgetIncludeLoanEmis = include;
        window.Storage.save();
        
        if (window.Utils) {
            Utils.showSuccess(include ? 'Loan EMIs included in budget' : 'Loan EMIs excluded from budget');
        }
    },
    
    /**
     * Save budget config (rule percentages)
     */
    saveBudgetConfig() {
        const needsInput = document.getElementById('rule-needs');
        const wantsInput = document.getElementById('rule-wants');
        const investInput = document.getElementById('rule-invest');
        
        if (needsInput && wantsInput && investInput) {
            const needs = parseInt(needsInput.value) || 50;
            const wants = parseInt(wantsInput.value) || 30;
            const invest = parseInt(investInput.value) || 20;
            
            window.DB.budgetRuleConfig = { needs, wants, invest };
            window.Storage.save();
            
            if (window.Utils) {
                Utils.showSuccess(`Budget rule updated to ${needs}/${wants}/${invest}`);
            }
        }
        
        this.closeCategoryConfigModal();
    },
    
    /**
     * Reset category config to defaults
     */
    resetCategoryConfig() {
        window.DB.budgetCategoryConfig = {
            needs: [...this.defaultNeedsCategories],
            wants: [...this.defaultWantsCategories]
        };
        window.DB.budgetRuleConfig = { ...this.defaultBudgetRule };
        window.DB.budgetIncludeLoanEmis = false; // Default: exclude loan EMIs
        window.Storage.save();
        
        // Refresh the modal
        this.openCategoryConfigModal();
        
        if (window.Utils) {
            Utils.showSuccess('Budget settings reset to defaults');
        }
    },
    
    // Track grouped view state for budget breakdown modal
    budgetBreakdownGrouped: false,
    // Track which groups are expanded in budget breakdown modal
    budgetBreakdownExpandedGroups: {},
    
    /**
     * Show budget breakdown modal
     */
    showBudgetBreakdown(type) {
        const budgetMonth = this.getBudgetMonthValue();
        const [year, month] = budgetMonth.split('-').map(Number);
        
        let items = [];
        let title = '';
        let color = '';
        let total = 0;
        
        if (type === 'needs') {
            items = this.getNeedsItems(year, month);
            title = '🏠 Needs (Essential)';
            color = 'amber';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'wants') {
            items = this.getWantsItems(year, month);
            title = '🎯 Wants (Lifestyle)';
            color = 'pink';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'investments') {
            items = this.getInvestmentItems(year, month);
            title = '📈 Investments';
            color = 'emerald';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        }
        
        // Store current items and type for re-rendering
        this._currentBudgetBreakdownItems = items;
        this._currentBudgetBreakdownType = type;
        this._currentBudgetBreakdownColor = color;
        this._currentBudgetBreakdownTitle = title;
        this._currentBudgetBreakdownTotal = total;
        
        // Create or update modal
        let modal = document.getElementById('budget-breakdown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'budget-breakdown-modal';
            document.body.appendChild(modal);
        }
        
        const monthLabel = this.getFormattedMonth(budgetMonth);
        this._currentBudgetBreakdownMonthLabel = monthLabel;
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        this.renderBudgetBreakdownModalContent(modal);
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Render budget breakdown modal content (supports grouped view toggle)
     */
    renderBudgetBreakdownModalContent(modal) {
        const items = this._currentBudgetBreakdownItems;
        const color = this._currentBudgetBreakdownColor;
        const title = this._currentBudgetBreakdownTitle;
        const total = this._currentBudgetBreakdownTotal;
        const monthLabel = this._currentBudgetBreakdownMonthLabel;
        const isGrouped = this.budgetBreakdownGrouped;
        
        let itemsHtml = '';
        
        if (items.length === 0) {
            itemsHtml = `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        } else if (isGrouped) {
            // Group items by title
            const grouped = this.groupItemsByName(items);
            itemsHtml = grouped.map(group => {
                const isExpanded = this.budgetBreakdownExpandedGroups[group.name] || false;
                const hasMultiple = group.items.length > 1;
                
                if (!hasMultiple) {
                    // Single item - show normally
                    const item = group.items[0];
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `;
                } else {
                    // Multiple items - show as expandable group
                    const expandedItems = isExpanded ? group.items.map(item => `
                        <div class="flex justify-between items-center py-2 pl-4 border-b border-gray-50 last:border-0 bg-gray-50">
                            <div class="flex-1 min-w-0">
                                <p class="text-xs text-gray-600 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-400">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-xs font-medium text-gray-600 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `).join('') : '';
                    
                    return `
                        <div class="border-b border-gray-100 last:border-0">
                            <div class="flex justify-between items-center py-2 cursor-pointer hover:bg-gray-50 transition-colors" onclick="Dashboard.toggleBudgetBreakdownGroup('${Utils.escapeHtml(group.name).replace(/'/g, "\\'")}')">
                                <div class="flex-1 min-w-0 flex items-center gap-2">
                                    <span class="text-xs text-${color}-500 font-semibold transform transition-transform ${isExpanded ? 'rotate-90' : ''}">${isExpanded ? '▼' : '▶'}</span>
                                    <div>
                                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(group.name)}</p>
                                        <p class="text-xs text-gray-500">${group.items.length} items • ${group.items[0].category}</p>
                                    </div>
                                </div>
                                <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(group.total)}</span>
                            </div>
                            ${isExpanded ? `<div class="border-t border-gray-100">${expandedItems}</div>` : ''}
                        </div>
                    `;
                }
            }).join('');
        } else {
            // Default individual items view
            itemsHtml = items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('');
        }
        
        // Count display - show unique groups if grouped
        const countDisplay = isGrouped 
            ? `${this.groupItemsByName(items).length} groups (${items.length} items)`
            : `${items.length} items`;
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${title}</h3>
                            <p class="text-xs text-white/80">${monthLabel}</p>
                        </div>
                        <button onclick="document.getElementById('budget-breakdown-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <!-- Group Toggle -->
                <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span class="text-xs text-gray-600">Group by name</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" ${isGrouped ? 'checked' : ''} onchange="Dashboard.toggleBudgetBreakdownGroupView(this.checked)">
                        <div class="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-${color}-500"></div>
                    </label>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${countDisplay})</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Group items by name for budget breakdown modal
     */
    groupItemsByName(items) {
        const groups = {};
        
        items.forEach(item => {
            const name = item.title.trim().toLowerCase();
            if (!groups[name]) {
                groups[name] = {
                    name: item.title,
                    items: [],
                    total: 0
                };
            }
            groups[name].items.push(item);
            groups[name].total += item.amount;
        });
        
        // Convert to array and sort by total (highest first)
        return Object.values(groups).sort((a, b) => b.total - a.total);
    },
    
    /**
     * Toggle grouped view for budget breakdown modal
     */
    toggleBudgetBreakdownGroupView(isGrouped) {
        this.budgetBreakdownGrouped = isGrouped;
        // Reset expanded groups when toggling
        this.budgetBreakdownExpandedGroups = {};
        
        const modal = document.getElementById('budget-breakdown-modal');
        if (modal) {
            this.renderBudgetBreakdownModalContent(modal);
        }
    },
    
    /**
     * Toggle expanded state for a group in budget breakdown modal
     */
    toggleBudgetBreakdownGroup(groupName) {
        this.budgetBreakdownExpandedGroups[groupName] = !this.budgetBreakdownExpandedGroups[groupName];
        
        const modal = document.getElementById('budget-breakdown-modal');
        if (modal) {
            this.renderBudgetBreakdownModalContent(modal);
        }
    },
    
    // Track grouped view state for monthly breakdown modal
    monthlyBreakdownGrouped: false,
    // Track which groups are expanded in monthly breakdown modal
    monthlyBreakdownExpandedGroups: {},
    
    /**
     * Show monthly breakdown list (for Monthly Breakdown cards)
     */
    showMonthlyBreakdownList(type) {
        const filterMonth = this.getFilterMonthValue();
        
        let items = [];
        let title = '';
        let color = '';
        let total = 0;
        
        if (type === 'expenses') {
            items = this.getMonthExpenseItems(filterMonth);
            title = '💸 Monthly Expenses';
            color = 'red';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'investments') {
            items = this.getMonthInvestmentItems(filterMonth);
            title = '📈 Monthly Investments';
            color = 'amber';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        }
        
        // Store current items and type for re-rendering
        this._currentMonthlyBreakdownItems = items;
        this._currentMonthlyBreakdownType = type;
        this._currentMonthlyBreakdownColor = color;
        this._currentMonthlyBreakdownTitle = title;
        this._currentMonthlyBreakdownTotal = total;
        
        // Create or update modal
        let modal = document.getElementById('monthly-breakdown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'monthly-breakdown-modal';
            document.body.appendChild(modal);
        }
        
        const monthLabel = this.getFormattedMonth(filterMonth);
        this._currentMonthlyBreakdownMonthLabel = monthLabel;
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        this.renderMonthlyBreakdownModalContent(modal);
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Render monthly breakdown modal content (supports grouped view toggle)
     */
    renderMonthlyBreakdownModalContent(modal) {
        const items = this._currentMonthlyBreakdownItems;
        const color = this._currentMonthlyBreakdownColor;
        const title = this._currentMonthlyBreakdownTitle;
        const total = this._currentMonthlyBreakdownTotal;
        const monthLabel = this._currentMonthlyBreakdownMonthLabel;
        const isGrouped = this.monthlyBreakdownGrouped;
        
        let itemsHtml = '';
        
        if (items.length === 0) {
            itemsHtml = `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        } else if (isGrouped) {
            // Group items by title
            const grouped = this.groupItemsByName(items);
            itemsHtml = grouped.map(group => {
                const isExpanded = this.monthlyBreakdownExpandedGroups[group.name] || false;
                const hasMultiple = group.items.length > 1;
                
                if (!hasMultiple) {
                    // Single item - show normally
                    const item = group.items[0];
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `;
                } else {
                    // Multiple items - show as expandable group
                    const expandedItems = isExpanded ? group.items.map(item => `
                        <div class="flex justify-between items-center py-2 pl-4 border-b border-gray-50 last:border-0 bg-gray-50">
                            <div class="flex-1 min-w-0">
                                <p class="text-xs text-gray-600 truncate">${Utils.escapeHtml(item.title)}</p>
                                <p class="text-xs text-gray-400">${item.category} • ${item.date}</p>
                            </div>
                            <span class="text-xs font-medium text-gray-600 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                        </div>
                    `).join('') : '';
                    
                    return `
                        <div class="border-b border-gray-100 last:border-0">
                            <div class="flex justify-between items-center py-2 cursor-pointer hover:bg-gray-50 transition-colors" onclick="Dashboard.toggleMonthlyBreakdownGroup('${Utils.escapeHtml(group.name).replace(/'/g, "\\'")}')">
                                <div class="flex-1 min-w-0 flex items-center gap-2">
                                    <span class="text-xs text-${color}-500 font-semibold transform transition-transform ${isExpanded ? 'rotate-90' : ''}">${isExpanded ? '▼' : '▶'}</span>
                                    <div>
                                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(group.name)}</p>
                                        <p class="text-xs text-gray-500">${group.items.length} items • ${group.items[0].category}</p>
                                    </div>
                                </div>
                                <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(group.total)}</span>
                            </div>
                            ${isExpanded ? `<div class="border-t border-gray-100">${expandedItems}</div>` : ''}
                        </div>
                    `;
                }
            }).join('');
        } else {
            // Default individual items view
            itemsHtml = items.map(item => `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                        <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                    </div>
                    <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                </div>
            `).join('');
        }
        
        // Count display - show unique groups if grouped
        const countDisplay = isGrouped 
            ? `${this.groupItemsByName(items).length} groups (${items.length} items)`
            : `${items.length} items`;
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${title}</h3>
                            <p class="text-xs text-white/80">${monthLabel}</p>
                        </div>
                        <button onclick="document.getElementById('monthly-breakdown-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <!-- Group Toggle -->
                <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span class="text-xs text-gray-600">Group by name</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" ${isGrouped ? 'checked' : ''} onchange="Dashboard.toggleMonthlyBreakdownGroupView(this.checked)">
                        <div class="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-${color}-500"></div>
                    </label>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${countDisplay})</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Toggle grouped view for monthly breakdown modal
     */
    toggleMonthlyBreakdownGroupView(isGrouped) {
        this.monthlyBreakdownGrouped = isGrouped;
        // Reset expanded groups when toggling
        this.monthlyBreakdownExpandedGroups = {};
        
        const modal = document.getElementById('monthly-breakdown-modal');
        if (modal) {
            this.renderMonthlyBreakdownModalContent(modal);
        }
    },
    
    /**
     * Toggle expanded state for a group in monthly breakdown modal
     */
    toggleMonthlyBreakdownGroup(groupName) {
        this.monthlyBreakdownExpandedGroups[groupName] = !this.monthlyBreakdownExpandedGroups[groupName];
        
        const modal = document.getElementById('monthly-breakdown-modal');
        if (modal) {
            this.renderMonthlyBreakdownModalContent(modal);
        }
    },
    
    /**
     * Get "Needs" expense items for a month
     * Optionally excludes loan EMIs based on setting
     * Uses budget month if available, falls back to expense date
     */
    getNeedsItems(year, month) {
        const expenses = window.DB.expenses || [];
        const includeLoanEmis = this.includeLoanEmis;
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    if (exp.needWant === 'need') {
                        // Check loan EMI exclusion
                        if (!includeLoanEmis) {
                            const category = exp.category || 'Other';
                            if (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi') {
                                if (this.isLoanEmi(exp)) {
                                    return false; // Exclude loan EMIs
                                }
                            }
                        }
                        return true;
                    } else {
                        return false; // Explicitly marked as 'want'
                    }
                }
                
                // Fallback to category-based classification
                const category = exp.category || 'Other';
                
                // Check if this is a Needs category
                if (!this.needsCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
                    return false;
                }
                
                // If loan EMIs are excluded, filter out expenses that are loan EMIs
                if (!includeLoanEmis && (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi')) {
                    // Check if this expense matches any loan in the database
                    if (this.isLoanEmi(exp)) {
                        return false; // Exclude loan EMIs
                    }
                }
                
                return true;
            })
            .map(exp => ({
                title: exp.title,
                category: exp.category || 'Other',
                amount: parseFloat(exp.amount) || 0,
                date: new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sortDate: new Date(exp.date).getTime()
            }))
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Get "Wants" expense items for a month
     * Uses budget month if available, falls back to expense date
     */
    getWantsItems(year, month) {
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    return exp.needWant === 'want';
                }
                
                // Fallback to category-based classification
                const category = exp.category || 'Other';
                return this.wantsCategories.some(c => c.toLowerCase() === category.toLowerCase());
            })
            .map(exp => ({
                title: exp.title,
                category: exp.category || 'Other',
                amount: parseFloat(exp.amount) || 0,
                date: new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sortDate: new Date(exp.date).getTime()
            }))
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Get investment items for a month
     * Uses incomeMonth/incomeYear if available for proper income attribution
     */
    getInvestmentItems(year, month) {
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const exchangeRate = (window.Investments && window.Investments.getExchangeRate) ? window.Investments.getExchangeRate() : (typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : (window.DB.exchangeRate?.rate || 89));
        
        return monthlyInvestments
            .filter(inv => {
                // Use incomeMonth/incomeYear if available
                if (inv.incomeMonth && inv.incomeYear) {
                    return inv.incomeYear === year && inv.incomeMonth === month;
                }
                // Fallback: use investment date (backward compatibility)
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && (invDate.getMonth() + 1) === month;
            })
            .map(inv => {
                let amount = 0;
                if (inv.type === 'SHARES') {
                    amount = inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                } else if (inv.type === 'MF') {
                    // MFs are INR-only; price stored is the historical NAV.
                    amount = inv.price * inv.quantity;
                } else if (inv.type === 'GOLD') {
                    amount = inv.price * inv.quantity;
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    amount = inv.amount || 0;
                }

                return {
                    title: inv.name || inv.type,
                    category: inv.type,
                    amount: amount,
                    date: new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                    sortDate: new Date(inv.date).getTime()
                };
            })
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Check if an expense is a loan EMI (matches any loan in database)
     */
    isLoanEmi(expense) {
        const loans = window.DB.loans || [];
        const expenseTitle = (expense.title || '').toLowerCase();
        
        // Check if the expense title matches any loan's EMI pattern
        for (const loan of loans) {
            const loanEmiTitle = `${loan.bankName} ${loan.loanType || 'Loan'} EMI`.toLowerCase();
            if (expenseTitle === loanEmiTitle || expenseTitle.includes(loan.bankName.toLowerCase())) {
                return true;
            }
        }
        
        return false;
    },
    
    /**
     * Get total "Needs" expenses for a month
     * Optionally excludes loan EMIs based on setting
     */
    getNeedsTotal(year, month) {
        const expenses = window.DB.expenses || [];
        const includeLoanEmis = this.includeLoanEmis;
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    if (exp.needWant === 'need') {
                        // Check loan EMI exclusion
                        if (!includeLoanEmis) {
                            const category = exp.category || 'Other';
                            if (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi') {
                                if (this.isLoanEmi(exp)) {
                                    return false; // Exclude loan EMIs
                                }
                            }
                        }
                        return true;
                    } else {
                        return false; // Explicitly marked as 'want'
                    }
                }
                
                // Fallback to category-based classification
                const category = exp.category || 'Other';
                
                // Check if this is a Needs category
                if (!this.needsCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
                    return false;
                }
                
                // If loan EMIs are excluded, filter out expenses that are loan EMIs
                if (!includeLoanEmis && (category.toLowerCase() === 'loan emi' || category.toLowerCase() === 'emi')) {
                    // Check if this expense matches any loan in the database
                    if (this.isLoanEmi(exp)) {
                        return false; // Exclude loan EMIs
                    }
                }
                
                return true;
            })
            .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    },
    
    /**
     * Get total "Wants" expenses for a month
     * Uses budget month if available, falls back to expense date
     */
    getWantsTotal(year, month) {
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                // Use budget month if available, fallback to expense date
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                if (expYear !== year || expMonth !== month) {
                    return false;
                }
                
                // Check needWant first (if set), then fallback to category
                if (exp.needWant) {
                    return exp.needWant === 'want';
                }
                
                // Fallback to category-based classification
                const category = exp.category || 'Other';
                return this.wantsCategories.some(c => c.toLowerCase() === category.toLowerCase());
            })
            .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    },
    
    /**
     * Get investment range label
     */
    getInvestmentRangeLabel() {
        if (!this.selectedInvestmentRange) {
            return 'Last 6 months';
        }
        const start = this.getFormattedMonth(this.selectedInvestmentRange.start);
        const end = this.getFormattedMonth(this.selectedInvestmentRange.end);
        return `${start} - ${end}`;
    },
    
    /**
     * Open investment range modal
     */
    openInvestmentRangeModal() {
        const modal = document.getElementById('investment-range-modal');
        if (modal) {
            const now = new Date();
            const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (this.selectedInvestmentRange) {
                document.getElementById('investment-range-start').value = this.selectedInvestmentRange.start;
                document.getElementById('investment-range-end').value = this.selectedInvestmentRange.end;
            } else {
                document.getElementById('investment-range-start').value = startMonth;
                document.getElementById('investment-range-end').value = endMonth;
            }
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close investment range modal
     */
    closeInvestmentRangeModal() {
        const modal = document.getElementById('investment-range-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Apply investment range selection
     */
    applyInvestmentRange() {
        const start = document.getElementById('investment-range-start').value;
        const end = document.getElementById('investment-range-end').value;
        
        if (!start || !end) {
            alert('Please select both start and end months');
            return;
        }
        
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        
        if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
            alert('Start month must be before or equal to end month');
            return;
        }
        
        const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        if (months > 24) {
            alert('Maximum range is 24 months');
            return;
        }
        
        this.selectedInvestmentRange = { start, end };
        this.closeInvestmentRangeModal();
        
        // Update label
        const label = document.getElementById('investment-range-label');
        if (label) {
            label.textContent = this.getInvestmentRangeLabel();
        }
        
        // Re-render chart
        this.renderInvestmentsTrendChart();
    },
    
    /**
     * Reset investment range to default
     */
    resetInvestmentRange() {
        this.selectedInvestmentRange = null;
        this.closeInvestmentRangeModal();
        
        // Update label
        const label = document.getElementById('investment-range-label');
        if (label) {
            label.textContent = 'Last 6 months';
        }
        
        // Re-render chart
        this.renderInvestmentsTrendChart();
    },
    
    /**
     * Get monthly investments data for chart (last N months or custom range)
     * Uses incomeMonth/incomeYear if available for proper income attribution
     */
    getInvestmentsDataForChart(monthsCount = 6) {
        const monthsData = [];
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const goldRate = (window.Investments && window.Investments.getGoldRate) ? window.Investments.getGoldRate() : (typeof window.DB.goldRatePerGram === 'number' ? window.DB.goldRatePerGram : (window.DB.goldRatePerGram?.rate || 10000));
        const exchangeRate = (window.Investments && window.Investments.getExchangeRate) ? window.Investments.getExchangeRate() : (typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : (window.DB.exchangeRate?.rate || 89));
        
        /**
         * Helper to filter investments by income month (or fall back to investment date)
         */
        const filterByIncomeMonth = (inv, targetYear, targetMonth) => {
            // Use incomeMonth/incomeYear if available
            if (inv.incomeMonth && inv.incomeYear) {
                return inv.incomeYear === targetYear && inv.incomeMonth === targetMonth;
            }
            // Fallback: use investment date (backward compatibility)
            const invDate = new Date(inv.date);
            return invDate.getFullYear() === targetYear && invDate.getMonth() + 1 === targetMonth;
        };
        
        // Use investment-specific range if selected
        if (this.selectedInvestmentRange) {
            const [startYear, startMonth] = this.selectedInvestmentRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedInvestmentRange.end.split('-').map(Number);
            
            let currentYear = startYear;
            let currentMonth = startMonth;
            
            while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
                const date = new Date(currentYear, currentMonth - 1, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                
                // Get investments for this month using income attribution
                const monthInvs = monthlyInvestments.filter(inv => 
                    filterByIncomeMonth(inv, currentYear, currentMonth)
                );
                
                // Calculate totals by type. MF gets its own bucket so the
                // trend chart can show stocks vs mutual funds separately.
                let shares = 0, mf = 0, gold = 0, epfFd = 0;
                monthInvs.forEach(inv => {
                    if (inv.type === 'SHARES') {
                        shares += inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                    } else if (inv.type === 'MF') {
                        mf += inv.price * inv.quantity;
                    } else if (inv.type === 'GOLD') {
                        gold += inv.price * inv.quantity;
                    } else if (inv.type === 'EPF' || inv.type === 'FD') {
                        epfFd += inv.amount || 0;
                    }
                });

                monthsData.push({
                    label: monthName,
                    shares: shares,
                    mf: mf,
                    gold: gold,
                    epfFd: epfFd,
                    total: shares + mf + gold + epfFd
                });

                // Move to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }

            return monthsData;
        }

        // Default: last N months
        const now = new Date();
        for (let i = monthsCount - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();
            const month = date.getMonth() + 1;

            // Get investments for this month using income attribution
            const monthInvs = monthlyInvestments.filter(inv =>
                filterByIncomeMonth(inv, year, month)
            );

            // Calculate totals by type
            let shares = 0, mf = 0, gold = 0, epfFd = 0;
            monthInvs.forEach(inv => {
                if (inv.type === 'SHARES') {
                    shares += inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                } else if (inv.type === 'MF') {
                    mf += inv.price * inv.quantity;
                } else if (inv.type === 'GOLD') {
                    gold += inv.price * inv.quantity;
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    epfFd += inv.amount || 0;
                }
            });

            monthsData.push({
                label: monthName,
                shares: shares,
                mf: mf,
                gold: gold,
                epfFd: epfFd,
                total: shares + mf + gold + epfFd
            });
        }

        return monthsData;
    },
    
    /**
     * Render Investments Trend Chart
     */
    renderInvestmentsTrendChart() {
        const canvas = document.getElementById('investments-trend-chart');
        if (!canvas) {
            console.warn('Investments trend chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from investments trend chart canvas');
            return;
        }
        
        // Use investment-specific range or default 6 months
        let monthsCount = 6;
        if (this.selectedInvestmentRange) {
            const [startYear, startMonth] = this.selectedInvestmentRange.start.split('-').map(Number);
            const [endYear, endMonth] = this.selectedInvestmentRange.end.split('-').map(Number);
            monthsCount = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        }
        
        const data = this.getInvestmentsDataForChart(monthsCount);
        
        // Destroy existing chart
        if (this.investmentChartInstance) {
            try {
                this.investmentChartInstance.destroy();
                this.investmentChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing investment chart:', e);
            }
        }
        
        // Build datasets based on view mode
        let datasets = [];
        const isTotal = this.investmentsChartView === 'total';
        
        if (isTotal) {
            // Total view: single line with a soft gradient area fill.
            datasets = [{
                label: 'Total',
                data: data.map(d => d.total),
                borderColor: '#6366f1',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                backgroundColor: (c) => this._chartGradient(c, 'rgba(99,102,241,0.30)', 'rgba(99,102,241,0)'),
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#6366f1',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            }];
        } else {
            // By-type view: clean multi-coloured smooth lines (no fill so they
            // don't muddy each other). MF is split from Shares so the equity vs
            // mutual-fund mix is visible at a glance.
            const line = (label, values, color) => ({
                label,
                data: values,
                borderColor: color,
                borderWidth: 2.5,
                tension: 0.4,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: color,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            });
            datasets = [
                line('Shares', data.map(d => d.shares), '#6366f1'),
                line('Mutual Funds', data.map(d => d.mf || 0), '#8b5cf6'),
                line('Gold', data.map(d => d.gold), '#f59e0b'),
                line('EPF/FD', data.map(d => d.epfFd), '#ec4899'),
            ];
        }
        
        this.investmentChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: this._chartAnimation(),
                plugins: {
                    legend: this._chartLegend(!isTotal),
                    datalabels: { display: false },
                    tooltip: this._chartTooltip(),
                },
                // Totals grow over time — let the y-axis frame the trend rather
                // than forcing zero, so movement is visible. By-type starts at 0.
                scales: this._chartScales({ beginAtZero: !isTotal }),
            }
        });
    },
    
    /**
     * Render income vs expense chart
     */
    renderIncomeExpenseChart() {
        const canvas = document.getElementById('income-expense-chart');
        if (!canvas) {
            console.warn('Income/Expense chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from income/expense chart canvas');
            return;
        }
        
        // Get number of months
        const monthsInput = document.getElementById('months-selector');
        const monthsCount = monthsInput ? parseInt(monthsInput.value) || 6 : 6;
        
        const expensesData = this.getExpensesData(monthsCount);
        const incomeData = this.getIncomeData(monthsCount);
        
        // Destroy existing chart
        if (this.incomeExpenseChartInstance) {
            try {
                this.incomeExpenseChartInstance.destroy();
                this.incomeExpenseChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing income/expense chart:', e);
            }
        }
        
        this.incomeExpenseChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: expensesData.map(d => d.label),
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData.map(d => d.income),
                        borderColor: '#10b981',
                        borderWidth: 2.5,
                        tension: 0.45,
                        fill: true,
                        backgroundColor: (c) => this._chartGradient(c, 'rgba(16,185,129,0.28)', 'rgba(16,185,129,0)'),
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#10b981',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                    },
                    {
                        label: 'Expenses',
                        data: expensesData.map(d => d.withLoans),
                        borderColor: '#f43f5e',
                        borderWidth: 2.5,
                        tension: 0.45,
                        fill: true,
                        backgroundColor: (c) => this._chartGradient(c, 'rgba(244,63,94,0.22)', 'rgba(244,63,94,0)'),
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#f43f5e',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: this._chartAnimation(),
                plugins: {
                    // Legend is intentionally off — the #ie-trend-summary strip above the
                    // chart already labels Income (emerald) / Expenses (rose) with totals,
                    // so a legend just duplicates it and steals plot height from the lines.
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: this._chartTooltip(),
                },
                scales: this._chartScales(),
            }
        });

        // Trend summary above the chart: period totals + average monthly savings.
        this._renderIncomeExpenseTrend(incomeData, expensesData);
    },

    /**
     * Fill the #ie-trend-summary strip with period income/expense totals and
     * the average monthly surplus, so the chart leads with the headline numbers.
     */
    _renderIncomeExpenseTrend(incomeData, expensesData) {
        const el = document.getElementById('ie-trend-summary');
        if (!el) return;
        const totalIncome = incomeData.reduce((s, d) => s + (d.income || 0), 0);
        const totalExpense = expensesData.reduce((s, d) => s + (d.withLoans || 0), 0);
        const months = Math.max(1, incomeData.length);
        const avgSavings = Math.round((totalIncome - totalExpense) / months);
        const fmt = (n) => '₹' + this._fmtCompact(n);
        const savedPositive = avgSavings >= 0;
        const savingsChip = totalIncome > 0
            ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${savedPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                   ${savedPositive ? 'Saved' : 'Overspent'} ${fmt(Math.abs(avgSavings))}/mo avg
               </span>`
            : '';
        el.innerHTML = `
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-3 text-[11px] text-gray-500">
                    <span>Income <b class="text-emerald-600">${fmt(totalIncome)}</b></span>
                    <span>Expenses <b class="text-rose-600">${fmt(totalExpense)}</b></span>
                </div>
                ${savingsChip}
            </div>`;
    },

    /** Compact rupee for chart summaries (8.4L / 1.05Cr / 9,500). */
    _fmtCompact(n) {
        const v = Math.abs(Math.round(n));
        if (v >= 10000000) return (v / 10000000).toFixed(2).replace(/\.?0+$/, '') + 'Cr';
        if (v >= 100000)  return (v / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L';
        if (v >= 1000)    return Utils.formatIndianNumber(v);
        return String(v);
    },

    /**
     * Render loans progress chart
     */
    renderLoansChart() {
        const canvas = document.getElementById('loans-chart');
        if (!canvas) {
            // This is normal if there are no active loans
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from loans chart canvas');
            return;
        }
        
        const data = this.getLoansData();
        
        if (data.length === 0) return;
        
        // Destroy existing chart
        if (this.loansChartInstance) {
            try {
                this.loansChartInstance.destroy();
                this.loansChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing loans chart:', e);
            }
        }
        
        this.loansChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.name),
                datasets: [{
                    label: 'Remaining Months',
                    data: data.map(d => d.remaining),
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bars
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const months = context.parsed.x;
                                return 'Remaining: ' + months + ' month' + (months !== 1 ? 's' : '');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Months Remaining'
                        }
                    }
                }
            }
        });
    },
    
    /**
     * Get current month value for calendar picker (YYYY-MM format)
     */
    getCurrentMonthValue() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    
    /**
     * Get category-wise expenses for selected month
     * Uses budget month if available, falls back to expense date
     */
    getCategoryData(includeExcluded = false) {
        const selector = document.getElementById('category-month-selector');
        if (!selector) return [];
        
        const [year, month] = selector.value.split('-').map(Number);
        
        // Get all expenses for the selected month using budget month
        const expenses = window.DB.expenses.filter(exp => {
            const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
            return expYear === year && expMonth === month;
        });
        
        // Get all recurring expenses for the selected month (exclude suspended/inactive)
        const recurringExpenses = (window.DB.recurringExpenses || []).filter(rec => {
            if (!window.RecurringExpenses || !window.RecurringExpenses.isEffectivelyActive(rec)) return false;
            const scheduleDay = rec.day || rec.dayOfMonth || 1;
            const expDate = new Date(year, month - 1, scheduleDay);
            return expDate <= new Date();
        });
        
        // Group by category
        const categoryMap = {};
        
        expenses.forEach(exp => {
            const category = exp.category || 'Uncategorized';
            categoryMap[category] = (categoryMap[category] || 0) + exp.amount;
        });
        
        recurringExpenses.forEach(rec => {
            const category = rec.category || 'Uncategorized';
            categoryMap[category] = (categoryMap[category] || 0) + rec.amount;
        });
        
        // Convert to array, format category names properly, filter excluded, and sort by amount
        this.initExcludedCategories();
        return Object.entries(categoryMap)
            .map(([category, amount]) => ({ 
                category: this.formatCategoryName(category), 
                amount 
            }))
            .filter(item => includeExcluded || !this.excludedCategories.has(item.category))
            .sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Format category name for display (capitalize first letter, handle special cases)
     */
    formatCategoryName(category) {
        if (!category) return 'Uncategorized';
        
        // Special cases
        if (category.toLowerCase() === 'emi') return 'EMI';
        
        // Use ExpenseCategories if available
        if (window.ExpenseCategories) {
            const cat = window.ExpenseCategories.getByName(category);
            if (cat) return cat.name;
        }
        
        // Capitalize first letter as fallback
        return category.charAt(0).toUpperCase() + category.slice(1);
    },
    
    /**
     * Render category expenses chart
     */
    renderCategoryChart() {
        const canvas = document.getElementById('category-chart');
        if (!canvas) {
            console.warn('Category chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Cannot get 2d context from category chart canvas');
            return;
        }
        
        // Get only non-excluded categories for the chart
        const data = this.getCategoryData(false);
        
        // Destroy existing chart
        if (this.categoryChartInstance) {
            try {
                this.categoryChartInstance.destroy();
                this.categoryChartInstance = null;
            } catch (e) {
                console.error('Error destroying existing category chart:', e);
            }
        }
        
        // Modern category palette — same vibrant tones used across the other
        // dashboard charts (solid hex; the doughnut adds white borders + hover).
        const colors = this._categoryColors();
        
        // If no visible categories, still show the legend so users can re-enable categories
        if (data.length === 0) {
            // Clear chart
            this.categoryChartInstance = null;
            
            // Still generate the legend with all categories (so user can click to re-enable)
            this.generateCategoryLegend(data, colors);
            
            return;
        }
        
        const grandTotal = data.reduce((s, d) => s + d.amount, 0);

        this.categoryChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.category),
                datasets: [{
                    label: 'Amount',
                    data: data.map(d => d.amount),
                    backgroundColor: data.map((_, i) => colors[i % colors.length]),
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    borderRadius: 4,
                    hoverOffset: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '66%',
                animation: this._prefersReducedMotion()
                    ? { duration: 0 }
                    : { animateRotate: true, animateScale: true, duration: 800, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },  // custom HTML legend (clickable to toggle)
                    datalabels: { display: false },  // center total + legend carry the numbers
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        titleColor: '#ffffff',
                        bodyColor: '#e2e8f0',
                        padding: 10,
                        cornerRadius: 10,
                        usePointStyle: true,
                        boxPadding: 4,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                return ' ' + (context.label || '') + ': ₹' + value.toLocaleString('en-IN') + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            },
            // Center label: total monthly spend in the doughnut hole.
            plugins: [this._doughnutCenterPlugin(this._fmtCompact(grandTotal), 'TOTAL / mo')],
        });

        // Generate HTML legend with amounts + percentages (shows all categories
        // including excluded, click to toggle).
        this.generateCategoryLegend(data, colors);
    },

    /** Modern category palette — shared vibrant tones (solid hex). */
    _categoryColors() {
        return ['#8b5cf6', '#f43f5e', '#10b981', '#3b82f6', '#f59e0b',
                '#ec4899', '#06b6d4', '#a855f7', '#eab308', '#84cc16'];
    },

    /** True if the user has asked the OS to reduce motion. */
    _prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /**
     * Chart.js plugin that paints a big value + small caption in a doughnut's
     * hole. Returns a fresh plugin object per chart (so the text is captured).
     */
    _doughnutCenterPlugin(valueText, caption) {
        return {
            id: 'doughnutCenter',
            afterDraw(chart) {
                const { ctx, chartArea } = chart;
                if (!chartArea) return;
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top + chartArea.bottom) / 2;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#0f172a';
                ctx.font = '700 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.fillText('₹' + valueText, cx, cy - 2);
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.fillText(caption, cx, cy + 13);
                ctx.restore();
            }
        };
    },
    
    /**
     * Generate HTML legend for category chart with gray percentages and click toggle
     */
    generateCategoryLegend(visibleData, colors) {
        const legendContainer = document.getElementById('category-chart-legend');
        if (!legendContainer) return;
        
        // Get all categories (including excluded ones)
        const allData = this.getCategoryData(true);
        
        // Calculate total from only visible (non-excluded) categories
        const visibleTotal = allData
            .filter(item => !this.excludedCategories.has(item.category))
            .reduce((sum, d) => sum + d.amount, 0);
        
        // Build a map of visible categories to their chart color index
        // This ensures legend colors match chart colors exactly
        const visibleCategories = allData.filter(item => !this.excludedCategories.has(item.category));
        const categoryColorMap = {};
        visibleCategories.forEach((item, idx) => {
            categoryColorMap[item.category] = colors[idx % colors.length];
        });
        
        let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
        
        // No expenses at all for the selected month — the pie canvas renders
        // nothing, so surface a one-line placeholder in the legend slot.
        if (allData.length === 0) {
            legendContainer.innerHTML = '<div style="color: #9ca3af; font-size: 11px; font-style: italic; padding: 8px 4px; text-align: center;">No expenses this month yet</div>';
            return;
        }
        
        // Show message if no categories are visible
        if (visibleTotal === 0 && allData.length > 0) {
            html += `
                <div style="color: #9ca3af; font-size: 10px; font-style: italic; margin-bottom: 6px; text-align: center;">
                    Click on a category below to show it
                </div>
            `;
        }
        
        allData.forEach((item, i) => {
            const isExcluded = this.excludedCategories.has(item.category);
            
            // Calculate percentage relative to visible categories only
            const percentage = visibleTotal > 0 && !isExcluded 
                ? ((item.amount / visibleTotal) * 100).toFixed(1)
                : '0.0';
            
            // Use the color from chart for visible categories, or a gray color for excluded ones
            const color = isExcluded 
                ? 'rgba(156, 163, 175, 0.5)' // Gray for excluded categories
                : categoryColorMap[item.category];
            
            const dim = isExcluded ? 'text-decoration: line-through; opacity: 0.5;' : '';
            const amt = this._fmtCompact(item.amount);
            html += `
                <div onclick="Dashboard.toggleCategoryExclusion('${item.category.replace(/'/g, "\\'")}')"
                     style="display: flex; align-items: center; gap: 6px; font-size: 10px; cursor: pointer; user-select: none; padding: 3px 4px; border-radius: 5px; transition: background-color 0.2s;"
                     onmouseover="this.style.backgroundColor='rgba(0,0,0,0.05)'"
                     onmouseout="this.style.backgroundColor='transparent'"
                     title="Click to ${isExcluded ? 'include' : 'exclude'} from chart">
                    <div style="width: 9px; height: 9px; border-radius: 3px; background-color: ${color}; flex-shrink: 0;"></div>
                    <span style="color: #334155; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${dim}">${item.category}</span>
                    <span style="color: #0f172a; font-weight: 700; ${dim}">₹${amt}</span>
                    <span style="color: #94a3b8; font-weight: 500; width: 30px; text-align: right; ${dim}">${percentage}%</span>
                </div>
            `;
        });
        html += '</div>';
        
        legendContainer.innerHTML = html;
    },
    
    /**
     * Get minimum net pay across all 12 months of payslips
     */
    getMinimumNetPay() {
        const income = window.DB.income;
        
        if (!income || !income.ctc) {
            return 0;
        }
        
        const { ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent } = income;
        
        const yearlyPayslips = window.Income.generateYearlyPayslips(ctc, bonusPercent, esppPercentCycle1, esppPercentCycle2, pfPercent);
        
        if (yearlyPayslips.length === 0) {
            return 0;
        }
        
        const minNetPay = Math.min(...yearlyPayslips.map(p => p.totalNetPay));
        return minNetPay;
    },
    
    /**
     * Get total recurring expenses for current month (excluding Loan EMI and Credit Card EMI)
     */
    getTotalRecurringExpenses() {
        
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        if (!window.RecurringExpenses) {
            return 0;
        }
        
        // Get all recurring expenses due this month using the same logic as Recurring page
        const allRecurring = window.RecurringExpenses.getAll();
        
        let total = 0;
        let excludedTotal = 0;
        
        allRecurring.forEach((recurring, i) => {
            
            // Skip inactive or suspended
            if (!window.RecurringExpenses.isEffectivelyActive(recurring)) {
                return;
            }
            
            // Skip if end date is before this month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(currentYear, currentMonth - 1, 1);
                if (checkDate > endDate) {
                    return;
                }
            }
            
            // Check if due in this month (reusing RecurringExpenses.isDueInMonth)
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, currentYear, currentMonth);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category === 'Loan EMI' || category === 'Credit Card EMI') {
                    excludedTotal += recurring.amount;
                } else {
                    total += recurring.amount;
                }
            }
        });
        
        return total;
    },
    
    /**
     * Get total EMIs for current month (loans + credit cards)
     * Shows all EMIs scheduled for this month, regardless of the day
     */
    getTotalEmis() {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11
        let total = 0;
        
        // Add active loan EMIs
        loans.forEach((loan, i) => {
            
            // Check if loan has started before or during this month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const currentMonthStart = new Date(currentYear, currentMonth, 1);
            
            if (firstEmiMonth > currentMonthStart) {
                return;
            }
            
            // Calculate remaining EMIs and EMI amount
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                // Calculate EMI amount if not stored
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    total += parseFloat(emiAmount);
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach((card, i) => {
            // Skip debit cards
            if (card.cardType === 'debit') {
                return;
            }
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach((emi, j) => {
                    
                    // Check if EMI has started before or during this month
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const currentMonthStart = new Date(currentYear, currentMonth, 1);
                        
                        if (emiFirstMonth > currentMonthStart) {
                            return;
                        }
                    }
                    
                    // Check if completed (using correct field names)
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        total += parseFloat(emi.emiAmount);
                    }
                });
            }
        });
        
        return total;
    },
    
    /**
     * Get total recurring expenses for a specific month (excluding Loan EMI and Credit Card EMI)
     */
    getTotalRecurringExpensesForMonth(year, month) {
        if (!window.RecurringExpenses) {
            return 0;
        }
        
        const allRecurring = window.RecurringExpenses.getAll();
        let total = 0;
        
        allRecurring.forEach(recurring => {
            // Skip inactive or suspended
            if (!window.RecurringExpenses.isEffectivelyActive(recurring)) {
                return;
            }
            
            // Skip if end date is before the target month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(year, month - 1, 1);
                if (checkDate > endDate) {
                    return;
                }
            }
            
            // Check if due in the target month
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, year, month);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category !== 'Loan EMI' && category !== 'Credit Card EMI') {
                    total += recurring.amount;
                }
            }
        });
        
        return total;
    },
    
    /**
     * Get total EMIs for a specific month (loans + credit cards)
     */
    getTotalEmisForMonth(year, month) {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const targetMonth = month - 1; // Convert to 0-indexed
        let total = 0;
        
        // Add active loan EMIs
        loans.forEach(loan => {
            // Check if loan has started before or during target month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const targetMonthStart = new Date(year, targetMonth, 1);
            
            if (firstEmiMonth > targetMonthStart) {
                return;
            }
            
            // Calculate remaining EMIs
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    total += parseFloat(emiAmount);
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const targetMonthStart = new Date(year, targetMonth, 1);
                        
                        if (emiFirstMonth > targetMonthStart) {
                            return;
                        }
                    }
                    
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        total += parseFloat(emi.emiAmount);
                    }
                });
            }
        });
        
        return total;
    },
    
    /**
     * Show month list modal for a specific month
     */
    showMonthList(type, year, month) {
        // Get the date for the target month
        const targetDate = new Date(year, month - 1, 15);
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Check if this is a future month
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const targetMonthStart = new Date(year, month - 1, 1);
        const isFutureMonth = targetMonthStart > currentMonthStart;
        
        let items = [];
        let title = '';
        let total = 0;
        let isProjected = false;
        let projectionNote = '';
        let projectionDetail = null;  // populated for "Other spend" projections
        let color = 'gray';
        let icon = '📋';
        
        if (type === 'recurring') {
            title = `Recurring`;
            icon = '🔄';
            color = 'purple';
            items = this.getRecurringExpenseItemsForMonth(year, month);
            total = items.reduce((sum, item) => sum + item.amount, 0);
        } else if (type === 'emis') {
            title = `Loans & EMIs`;
            icon = '🏦';
            color = 'blue';
            items = this.getEmiItemsForMonth(year, month);
            total = items.reduce((sum, item) => sum + item.amount, 0);
        } else if (type === 'regular') {
            icon = '💵';
            color = 'emerald';
            if (isFutureMonth) {
                // For future months, show projection explanation
                title = `Other spend (estimate)`;
                isProjected = true;
                const projectionData = this.getProjectedRegularExpensesWithDetails(3);
                total = projectionData.projection || projectionData.average;
                items = projectionData.monthlyData;
                // Carry the rich breakdown into the render below.
                projectionDetail = projectionData;
                projectionNote = 'Frequent items (seen ≥2 of 3 months) + 50% of one-off spend as a buffer. Outliers like one-time flights/hospital bills don\'t bloat the estimate.';
            } else {
                title = `Other spend`;
                items = this.getRegularExpenseItemsForMonth(year, month);
                total = items.reduce((sum, item) => sum + item.amount, 0);
            }
        }
        
        // Create/show modal
        let modal = document.getElementById('month-list-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'month-list-modal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
            document.body.appendChild(modal);
        }
        
        let contentHtml = '';
        if (isProjected) {
            const detail = projectionDetail || {};
            const frequent = detail.frequentItems || [];
            const occasional = detail.occasionalItems || [];
            const hasData = items.length > 0 || frequent.length > 0 || occasional.length > 0;

            const trendChip = (t) => t === 'rising'
                ? '<span class="text-[9px] px-1 py-0.5 bg-rose-100 text-rose-700 rounded font-semibold">↗ rising</span>'
                : t === 'falling' ? '<span class="text-[9px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">↘ falling</span>'
                : '';

            // Group frequent items by category. The table now leads with the
            // category total (the number the user actually budgets against),
            // and each category row expands to show the items inside. We drop
            // the "3-mo total" column — only ₹/mo and seen-count matter for
            // budgeting next month.
            const groupByCategory = (items) => {
                const map = new Map();
                items.forEach(it => {
                    const cat = it.category || 'Other';
                    if (!map.has(cat)) map.set(cat, { items: [], monthlyTotal: 0, monthsSeenMax: 0 });
                    const g = map.get(cat);
                    g.items.push(it);
                    g.monthlyTotal += it.monthlyAvg || 0;
                    g.monthsSeenMax = Math.max(g.monthsSeenMax, it.monthsSeen || 0);
                });
                return Array.from(map.entries())
                    .map(([category, g]) => ({ category, ...g }))
                    .sort((a, b) => b.monthlyTotal - a.monthlyTotal);
            };

            const frequentByCategory = groupByCategory(frequent);

            const frequentCategoryRows = frequentByCategory.map((group, idx) => {
                const childItems = group.items.map(it => `
                    <div class="flex items-center justify-between py-1.5 px-3 text-xs border-b border-emerald-50 last:border-b-0">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-gray-700 truncate" title="${Utils.escapeHtml(it.title)}">${Utils.escapeHtml(it.title)}</span>
                            ${trendChip(it.trend)}
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <span class="text-[10px] text-gray-500 tabular-nums">${it.monthsSeen}/3</span>
                            <span class="font-semibold text-emerald-700 tabular-nums">₹${Utils.formatIndianNumber(it.monthlyAvg)}</span>
                        </div>
                    </div>
                `).join('');

                // All categories start collapsed (no default-open) so the table
                // reads as a tidy list of category totals; the chevron signals
                // each row expands to its items.
                return `
                    <details class="border-b border-emerald-50 last:border-b-0">
                        <summary class="flex items-center justify-between px-3 py-3 cursor-pointer hover:bg-emerald-50/30 transition-colors list-none">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-emerald-500 text-xs details-arrow flex-shrink-0">▾</span>
                                <span class="text-sm font-semibold text-gray-800 truncate">${Utils.escapeHtml(group.category)}</span>
                                <span class="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-semibold flex-shrink-0">${group.items.length}</span>
                            </div>
                            <span class="text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap flex-shrink-0">₹${Utils.formatIndianNumber(Math.round(group.monthlyTotal))}<span class="text-[10px] font-normal text-emerald-600">/mo</span></span>
                        </summary>
                        <div class="bg-emerald-50/30">
                            ${childItems}
                        </div>
                    </details>
                `;
            }).join('');

            // One-offs: don't list every transaction. The user said the long
            // list felt noisy and was sweeping in tiny amounts. Show one
            // summary card with count, avg per month, and the buffer applied.
            // Top 3 biggest one-offs are kept inline as quick context (these
            // are usually the items people remember and want to verify).
            const topOccasional = occasional.slice(0, 3);
            const topOccasionalChips = topOccasional.length > 0
                ? topOccasional.map(it => `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-medium">
                        ${Utils.escapeHtml(it.title)} · ₹${Utils.formatIndianNumber(it.amount)}
                    </span>
                `).join('')
                : '';

            contentHtml = `
                <div class="py-1">
                    <p class="text-[11px] text-gray-500 mb-3 leading-relaxed">${projectionNote}</p>

                    ${!hasData ? `
                        <div class="text-center py-4 text-gray-500">
                            <p>No spending data available — log a few months of expenses to see a projection.</p>
                        </div>
                    ` : `
                        ${frequent.length > 0 ? `
                            <div class="mb-5">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">By category · ${frequentByCategory.length}</div>
                                    <div class="text-[10px] text-gray-500">tap to expand items</div>
                                </div>
                                <div class="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
                                    ${frequentCategoryRows}
                                    <div class="bg-emerald-50 border-t-2 border-emerald-300 px-3 py-2.5 flex justify-between items-center">
                                        <span class="text-sm font-bold text-emerald-900">Subtotal → projection</span>
                                        <span class="text-base font-bold text-emerald-700 tabular-nums whitespace-nowrap">₹${Utils.formatIndianNumber(detail.frequentProjection || 0)}<span class="text-[10px] font-normal text-emerald-600">/mo</span></span>
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        ${occasional.length > 0 ? `
                            <div class="mb-5">
                                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">One-off buffer</div>
                                <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                                    <div class="flex items-center justify-between text-xs text-amber-800">
                                        <span>${occasional.length} one-off item${occasional.length === 1 ? '' : 's'} (last 3 mo)</span>
                                        <span class="tabular-nums">avg ₹${Utils.formatIndianNumber(detail.occasionalAveragePerMonth || 0)}/mo</span>
                                    </div>
                                    ${topOccasionalChips ? `
                                        <div class="flex flex-wrap gap-1">${topOccasionalChips}${occasional.length > 3 ? `<span class="text-[10px] text-amber-700 self-center">+${occasional.length - 3} more</span>` : ''}</div>
                                    ` : ''}
                                    <div class="flex items-center justify-between pt-2 border-t border-amber-300">
                                        <span class="text-sm font-bold text-amber-900">Buffer (${Math.round((detail.occasionalWeight || 0.5) * 100)}% of avg)</span>
                                        <span class="text-base font-bold text-amber-700 tabular-nums whitespace-nowrap">₹${Utils.formatIndianNumber(detail.occasionalBuffer || 0)}<span class="text-[10px] font-normal text-amber-600">/mo</span></span>
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <div class="mb-4">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Calculation</div>
                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-0.5 font-mono">
                                <div class="flex justify-between">
                                    <span>Frequent (categories)</span>
                                    <span>₹${Utils.formatIndianNumber(detail.frequentProjection || 0)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>+ One-off buffer (${Math.round((detail.occasionalWeight || 0.5) * 100)}%)</span>
                                    <span>₹${Utils.formatIndianNumber(detail.occasionalBuffer || 0)}</span>
                                </div>
                                <div class="flex justify-between font-bold pt-1 mt-1 border-t border-blue-200">
                                    <span>Projection</span>
                                    <span>₹${Utils.formatIndianNumber(total)}</span>
                                </div>
                            </div>
                        </div>
                    `}

                    <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                        <div class="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1">Estimated for ${monthName.split(' ')[0]}</div>
                        <div class="text-2xl font-bold text-emerald-700">~₹${Utils.formatIndianNumber(total)}</div>
                    </div>
                </div>
            `;
        } else {
            // Check if this is EMI list (type === 'emis')
            const isEmiList = type === 'emis';
            
            contentHtml = `
                    ${items.length > 0 ? items.map(item => {
                        // Enhanced display for EMI items
                        if (isEmiList && item.paidCount !== undefined && item.totalCount !== undefined) {
                            const progressColor = item.type === 'loan' ? 'blue' : 'purple';
                            return `
                                <div class="py-3 border-b border-gray-100 last:border-0">
                                    <!-- Title and Amount -->
                                    <div class="flex justify-between items-start mb-2">
                                        <div class="font-semibold text-gray-800 text-sm">${Utils.escapeHtml(item.name)}</div>
                                        <div class="text-sm font-bold text-${progressColor}-600">₹${Utils.formatIndianNumber(item.amount)}</div>
                                    </div>
                                    
                                    <!-- Progress Bar -->
                                    <div class="mb-2">
                                        <div class="flex justify-between items-center text-xs text-gray-600 mb-1">
                                            <span class="font-medium">${item.paidCount}/${item.totalCount} EMIs paid</span>
                                            <span>${item.progress}%</span>
                                        </div>
                                        <div class="w-full bg-gray-200 rounded-full h-1.5">
                                            <div class="bg-${progressColor}-500 h-1.5 rounded-full transition-all" style="width: ${item.progress}%"></div>
                                        </div>
                                    </div>
                                    
                                    <!-- Date and Description -->
                                    <div class="flex items-center gap-2 text-xs text-gray-500">
                                        <span>📅 ${item.date}</span>
                                        ${item.description ? `<span>•</span><span class="italic">${Utils.escapeHtml(item.description)}</span>` : ''}
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Default display for non-EMI items
                        return `
                            <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                <div class="flex-1">
                                    <div class="font-medium text-gray-800 text-sm">${Utils.escapeHtml(item.name)}</div>
                                    <div class="flex items-center gap-2 text-xs text-gray-500">
                                        ${item.category ? `<span>${Utils.escapeHtml(item.category)}</span>` : ''}
                                        ${item.category && item.date ? '<span>•</span>' : ''}
                                        ${item.date ? `<span>${item.date}</span>` : ''}
                                    </div>
                                </div>
                                <div class="text-sm font-semibold text-gray-700">₹${Utils.formatIndianNumber(item.amount)}</div>
                            </div>
                        `;
                    }).join('') : '<p class="text-gray-500 text-center py-4">No items found</p>'}
            `;
        }
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${icon} ${title}</h3>
                            <p class="text-xs text-white/80">${monthName}</p>
                        </div>
                        <button onclick="document.getElementById('month-list-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${contentHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${items.length} items)</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Get AI insights actions HTML (button)
     */
    getAIInsightsActions(year, month) {
        if (this.aiInsightsLoading) {
            return `<span class="text-[10px] text-gray-400">Loading…</span>`;
        }
        
        return `
            <button onclick="Dashboard.fetchAIInsights(${year}, ${month})" 
                    class="flex items-center gap-1 px-2 py-1 text-[10px] bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded transition-all shadow-sm">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                Get suggestions
            </button>
        `;
    },
    
    /**
     * Get AI insights content HTML
     */
    getAIInsightsContent(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const cached = this.aiExpenseInsightsCache[monthKey];
        
        if (this.aiInsightsLoading) {
            return `
                <div class="bg-purple-50 rounded-lg p-3 flex items-center gap-3">
                    <div class="flex-shrink-0 px-3 py-3 bg-purple-100 rounded-lg">
                        <div class="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p class="text-[11px] text-purple-600 leading-relaxed">Analyzing your spending — this takes ~10 seconds…</p>
                </div>
            `;
        }
        
        if (cached) {
            return `
                <div class="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center shadow-sm">
                            <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div>
                            <span class="text-xs font-medium text-purple-700">AI Insights</span>
                            <span class="text-[10px] text-gray-400 ml-2">${this.formatRelativeTime(cached.timestamp)}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="Dashboard.reloadAIInsights(${cached.year || new Date().getFullYear()}, ${cached.month || new Date().getMonth() + 2})" 
                                aria-label="Refresh AI insights" title="Refresh AI insights"
                                class="flex items-center gap-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-colors">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                        </button>
                        <button onclick="Dashboard.showAIInsightsModal(${cached.year || new Date().getFullYear()}, ${cached.month || new Date().getMonth() + 2})" 
                                class="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-sm">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                            View
                        </button>
                    </div>
                </div>
            `;
        }
        
        // Use passed year/month or fallback to next month
        const targetYear = year || this.getNextMonthYear();
        const targetMonth = month || this.getNextMonth();
        
        return `
            <div class="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                <div id="ai-insights-actions" class="flex-shrink-0">
                    <button onclick="Dashboard.fetchAIInsights(${targetYear}, ${targetMonth})" 
                            class="flex items-center gap-1.5 px-3 py-3 text-xs bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-lg transition-all shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        Get suggestions
                    </button>
                </div>
                <p class="text-[11px] text-gray-500 leading-relaxed">Get AI suggestions on where to cut spending next month.</p>
            </div>
        `;
    },
    
    /**
     * Show AI insights in a modal
     */
    showAIInsightsModal(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const cached = this.aiExpenseInsightsCache[monthKey];
        
        if (!cached) return;
        
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const formattedInsights = this.formatAIInsightsCollapsible(cached.insights);
        
        // Create or update modal
        let modal = document.getElementById('ai-insights-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-insights-modal';
            document.body.appendChild(modal);
        }
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10000] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden relative">
                <!-- Header -->
                <div class="p-5 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-xl">AI Financial Insights</h3>
                            <p class="text-xs text-white/90 mt-0.5">${monthName} • ${this.formatRelativeTime(cached.timestamp)}</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('ai-insights-modal').classList.add('hidden')" 
                            aria-label="Close" title="Close"
                            class="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white text-xl transition-all hover:scale-110">
                        ×
                    </button>
                </div>
                
                <!-- Content -->
                <div class="flex-1 overflow-y-auto px-3 py-5 bg-gray-50 pb-20">
                    ${this._renderInsightsSummary(cached.summary, monthName)}
                    <div class="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                        <div class="flex items-start gap-2">
                            <span class="text-blue-500 text-sm">ℹ️</span>
                            <div class="text-xs text-blue-700 leading-relaxed">
                                <span class="font-semibold">Variable est.</span> uses last-3-month frequent items (seen in ≥2 months) + half of one-off spend as a buffer — outliers don't bloat the projection. AI insights below are advisory only.
                            </div>
                        </div>
                    </div>
                    <div class="ai-insights-text">
                        ${formattedInsights}
                    </div>
                </div>
                
                <!-- Floating Refresh Button -->
                <button onclick="document.getElementById('ai-insights-modal').classList.add('hidden'); Dashboard.reloadAIInsights(${year}, ${month})" 
                        class="absolute bottom-4 right-4 w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-10 hover:scale-110"
                        aria-label="Refresh Insights" title="Refresh Insights">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                </button>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Build a small JSON summary out of the analysis data so the modal can
     * render a deterministic cash-flow card. Keeping it minimal ensures the
     * stored cache stays small.
     */
    _buildInsightsSummary(data) {
        const fc = data.targetMonthForecast || {};
        const fh = data.financialHealth || null;
        return {
            expectedIncome: fc.expectedIncome || 0,
            fixedObligations: fc.fullFixed || fc.fixedObligations || 0,
            recurring: fc.recurring?.total || 0,
            emis: fc.emis?.total || 0,
            sips: fc.sipsCommitment || 0,
            unpaidBills: fc.unpaidBillsTotal || 0,
            upcomingBills: fc.upcomingBillsTotal || 0,
            projectedVariable: fc.projectedVariable || 0,
            // Top-up above SIPs needed to hit the budget rule's invest %.
            // NOT advice to add a new SIP — it's the gap shown in the cash-
            // flow tile so the surplus math is honest. If SIPs already meet
            // the target, this is 0 and the line drops out of the tile.
            investmentTargetGap: fc.investmentTargetGap || 0,
            investmentTargetTotal: fc.investmentTargetTotal || 0,
            plansTotal: fc.targetPlansTotal || 0,
            projectedTotal: fc.projectedTotal || 0,
            projectedSurplus: fc.projectedSurplus || 0,
            isCashTight: !!fc.isCashTight,
            netWorth: fh?.netWorth ?? null,
            cashSavings: fh?.cashSavings ?? null,
            efMonths: fh?.emergencyFund?.months ?? null,
            efStatus: fh?.emergencyFund?.status ?? null,
            efShortfall: fh?.emergencyFund?.shortfall ?? null,
            riskPercent: fh?.riskPercent ?? null,
        };
    },

    /**
     * Render the deterministic cash-flow summary card. Always shown at the
     * top of the AI Insights modal so the user sees the structured numbers
     * regardless of what the AI text emits.
     */
    _renderInsightsSummary(summary, monthName) {
        if (!summary) return '';
        const fmt = (n) => `₹${Utils.formatIndianNumber(Math.round(n || 0))}`;

        const surplus = summary.projectedSurplus;
        const isShortfall = surplus < 0;
        const surplusColor = isShortfall ? 'rose' : 'emerald';
        const surplusLabel = isShortfall ? 'Shortfall' : 'Surplus';

        const efBadge = (() => {
            if (summary.efStatus === 'critical') return '<span class="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded font-semibold">Critical</span>';
            if (summary.efStatus === 'low') return '<span class="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-semibold">Low</span>';
            if (summary.efStatus === 'good') return '<span class="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-semibold">Healthy</span>';
            return '';
        })();

        // Cash-flow line items — only show non-zero entries to reduce noise.
        const lineItems = [
            { label: 'Recurring',         value: summary.recurring },
            { label: 'Loan / Card EMIs',  value: summary.emis },
            { label: 'SIPs',              value: summary.sips },
            { label: 'Card bills due',    value: summary.upcomingBills },
            { label: 'Past-due bills',    value: summary.unpaidBills, alert: true },
            { label: 'Variable est.',     value: summary.projectedVariable },
            { label: 'Plans due',         value: summary.plansTotal },
            // Top-up above SIPs needed to reach the invest % target. We label
            // it "Top-up above SIPs" so the user doesn't read it as a new
            // recommendation — it's a benchmark gap, and the row is hidden
            // entirely when SIPs already meet/exceed the target.
            { label: 'Top-up above SIPs', value: summary.investmentTargetGap },
        ].filter(li => li.value > 0);

        const lineHtml = lineItems.map(li => `
            <div class="flex justify-between text-[11px] py-0.5">
                <span class="${li.alert ? 'text-rose-700 font-semibold' : 'text-gray-600'}">− ${li.label}</span>
                <span class="${li.alert ? 'text-rose-700 font-semibold' : 'text-gray-800'}">${fmt(li.value)}</span>
            </div>
        `).join('');

        const monthShort = monthName.split(' ')[0];

        return `
            <div class="mb-3 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">
                    ${monthShort} cash-flow forecast
                </div>
                <div class="p-3 space-y-2">
                    <!-- Income vs surplus -->
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-[10px] uppercase tracking-wide text-gray-500">Expected Income</div>
                            <div class="text-base font-bold text-gray-800">${fmt(summary.expectedIncome)}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[10px] uppercase tracking-wide text-${surplusColor}-600">${surplusLabel}</div>
                            <div class="text-base font-bold text-${surplusColor}-700">${fmt(Math.abs(surplus))}</div>
                        </div>
                    </div>
                    ${summary.isCashTight ? `
                        <div class="bg-rose-50 border border-rose-200 rounded p-1.5 text-[10px] text-rose-700 font-semibold flex items-center gap-1">
                            ⚠️ Cash tight: known commitments exceed income.
                        </div>
                    ` : ''}

                    <!-- Outflows -->
                    ${lineItems.length > 0 ? `
                        <div class="border-t border-gray-100 pt-2">
                            ${lineHtml}
                            <div class="border-t border-gray-200 mt-1 pt-1 flex justify-between text-[11px] font-semibold">
                                <span class="text-gray-700">Total claimed</span>
                                <span class="text-gray-900">${fmt(summary.projectedTotal)}</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Health snapshot row -->
                    ${summary.netWorth !== null ? `
                        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center">
                            <div>
                                <div class="text-[9px] uppercase tracking-wide text-gray-500">Net Worth</div>
                                <div class="text-xs font-bold text-gray-800">${fmt(summary.netWorth)}</div>
                            </div>
                            <div>
                                <div class="text-[9px] uppercase tracking-wide text-gray-500">Cash & Savings</div>
                                <div class="text-xs font-bold text-gray-800">${fmt(summary.cashSavings)}</div>
                            </div>
                            <div>
                                <div class="text-[9px] uppercase tracking-wide text-gray-500 flex items-center justify-center gap-1">EF ${efBadge}</div>
                                <div class="text-xs font-bold text-gray-800">${summary.efMonths !== null ? `${summary.efMonths}mo` : '—'}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Format AI insights text with beautiful, structured HTML
     */
    formatAIInsightsCollapsible(text) {
        if (!text) return '';
        
        // Split by section headers — recognise the six locked-format emojis
        // (📊 outlook, 💸 expenses, 📈 investments, 🏦 debt, 🔮 predictions,
        // 🎯 actions) plus legacy ones still in old cached responses.
        const headerPattern = /(\*\*[📊💡🔄🏦📈✅🎂💸🔮🎯].*?\*\*)/g;
        const sections = text.split(headerPattern).filter(s => s.trim());
        
        let html = '';
        
        sections.forEach((section, sectionIndex) => {
            // Check if this is a header (starts with ** and contains emoji)
            if (section.match(/^\*\*[📊💡🔄🏦📈✅🎂💸🔮🎯]/)) {
                const header = section.replace(/\*\*/g, '').trim();
                // Extract emoji - check if first character is an emoji
                let emoji = '';
                let title = header;
                
                // Try to extract emoji by checking first character
                // Common emojis used in headers
                const emojiChars = ['📊', '💡', '🔄', '🏦', '📈', '✅', '🎂', '💸', '🔮', '🎯'];
                for (const emojiChar of emojiChars) {
                    if (header.startsWith(emojiChar)) {
                        emoji = emojiChar;
                        title = header.substring(emojiChar.length).trim();
                        break;
                    }
                }
                
                // If no emoji found, try regex approach
                if (!emoji) {
                    const emojiRegex = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u;
                    const match = header.match(emojiRegex);
                    if (match) {
                        emoji = match[1];
                        title = header.substring(match[0].length).trim();
                    }
                }
                
                // Determine card color based on section type
                let cardColor = 'purple';
                let bgGradient = 'from-purple-50 to-purple-100';
                let borderColor = 'border-purple-200';
                
                if (header.includes('OUTLOOK') || header.includes('HEALTH')) {
                    cardColor = 'blue';
                    bgGradient = 'from-blue-50 to-blue-100';
                    borderColor = 'border-blue-200';
                } else if (header.includes('EXPENSE') || header.includes('EXPECTED')) {
                    cardColor = 'orange';
                    bgGradient = 'from-orange-50 to-orange-100';
                    borderColor = 'border-orange-200';
                } else if (header.includes('SUBSCRIPTION') || header.includes('LIFESTYLE')) {
                    cardColor = 'pink';
                    bgGradient = 'from-pink-50 to-pink-100';
                    borderColor = 'border-pink-200';
                } else if (header.includes('DEBT') || header.includes('LOAN') || header.includes('EMI')) {
                    cardColor = 'indigo';
                    bgGradient = 'from-indigo-50 to-indigo-100';
                    borderColor = 'border-indigo-200';
                } else if (header.includes('INVESTMENT')) {
                    cardColor = 'emerald';
                    bgGradient = 'from-emerald-50 to-emerald-100';
                    borderColor = 'border-emerald-200';
                } else if (header.includes('PREDICTION') || header.includes('RISK') || header.includes('FORECAST')) {
                    cardColor = 'cyan';
                    bgGradient = 'from-cyan-50 to-cyan-100';
                    borderColor = 'border-cyan-200';
                } else if (header.includes('PRIORITY') || header.includes('ACTION')) {
                    cardColor = 'green';
                    bgGradient = 'from-green-50 to-green-100';
                    borderColor = 'border-green-200';
                }
                
                // Clean title - remove any remaining emoji characters
                const cleanTitle = title.replace(/[📊💡🔄🏦📈✅🎂💸🔮🎯]/g, '').trim();
                
                html += `
                    <div class="mt-4 mb-3 bg-gradient-to-r ${bgGradient} border ${borderColor} rounded-xl px-3 py-2.5 shadow-sm">
                        <div class="flex items-center gap-2 mb-2">
                            ${emoji ? `<span class="text-xl" aria-hidden="true">${emoji}</span>` : ''}
                            <h3 class="font-bold text-${cardColor}-800 text-sm">${this.formatInlineText(cleanTitle)}</h3>
                        </div>
                `;
            } else {
                // Content body of a section. If the unified renderer is available
                // we delegate the entire body to it — gives consistent markdown
                // rendering with the same look as chat/benefits. The legacy
                // hand-rolled parser below is kept as a fallback.
                if (window.AIRenderer) {
                    // Strip directive lines (IF / ELSE conditional logic in the prompt)
                    // before rendering — they're internal scaffolding, not user content.
                    const cleanedSection = section
                        .split(/\n/)
                        .filter(line => !line.trim().match(/^(IF|ELSE|IF ALL|IF PROBLEMS|IF BELOW|IF AT|IF HIGH|IF LOANS)/i))
                        .join('\n')
                        .trim();
                    if (cleanedSection) {
                        html += window.AIRenderer.toHtml(cleanedSection, { compact: true });
                    }
                    html += `</div>`; // Close the colored section card
                    return;
                }

                // Legacy fallback parser (used only if AIRenderer is missing)
                const lines = section
                    .trim()
                    .split(/\n/)
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.match(/^(IF|ELSE|IF ALL|IF PROBLEMS|IF BELOW|IF AT|IF HIGH|IF LOANS)/i));

                if (lines.length > 0) {
                    html += `<div class="space-y-2.5">`;

                    let i = 0;
                    while (i < lines.length) {
                        const line = lines[i];
                        const originalLine = line; // Keep original for fallback

                        // Check for numbered items (1., 2., etc.) with full content
                        const numberedMatch = line.match(/^(\d+)\.\s*\*\*(.+?)\*\*\s*:\s*(.+)/);
                        const numberedSimple = line.match(/^(\d+)\.\s*(.+)/);

                        // Check for bullet with bold title - but capture the ENTIRE line content
                        const bulletWithBold = line.match(/^•\s*\*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*(.*)/);

                        // Check for arrow sub-items (→)
                        const arrowMatch = line.match(/^\s*→\s*(.+)/);

                        // Check for key: value format (like "Needs: 55% actual vs 50% target")
                        const keyValueMatch = line.match(/^•\s*\*\*(.+?)\*\*\s*:\s*(.+)/);
                        const simpleKeyValue = line.match(/^•\s*(.+?):\s*(.+)/);

                        if (numberedMatch) {
                            // Numbered action item with title and description
                            const formattedDesc = this.formatInlineText(numberedMatch[3]);
                            html += `
                                <div class="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                    <div class="flex items-start gap-3">
                                        <span class="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">${numberedMatch[1]}</span>
                                        <div class="flex-1">
                                            <div class="font-semibold text-gray-800 text-sm mb-1">${this.formatInlineText(numberedMatch[2])}</div>
                                            <div class="text-xs text-gray-600 leading-relaxed">${formattedDesc}</div>
                                        </div>
                                    </div>
                                </div>
                            `;
                            i++;
                        } else if (numberedSimple && !numberedMatch) {
                            // Simple numbered item - preserve full content
                            const formattedContent = this.formatInlineText(numberedSimple[2]);
                            html += `
                                <div class="flex items-start gap-2 pl-1">
                                    <span class="bg-purple-100 text-purple-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">${numberedSimple[1]}</span>
                                    <span class="text-xs text-gray-700 leading-relaxed flex-1">${formattedContent}</span>
                                </div>
                            `;
                            i++;
                        } else if (keyValueMatch) {
                            // Bullet with bold key and value (like "**Needs**: 55% actual vs 50% target")
                            const key = this.formatInlineText(keyValueMatch[1]);
                            const value = this.formatInlineText(keyValueMatch[2]);
                            html += `
                                <div class="flex items-start gap-2 text-xs text-gray-700 bg-white rounded-lg p-2 border border-gray-100">
                                    <span class="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                    <div class="flex-1">
                                        <span class="font-semibold text-gray-800">${key}:</span>
                                        <span class="ml-1">${value}</span>
                                    </div>
                                </div>
                            `;
                            i++;
                        } else if (simpleKeyValue) {
                            // Simple key: value format
                            const key = this.formatInlineText(simpleKeyValue[1]);
                            const value = this.formatInlineText(simpleKeyValue[2]);
                            html += `
                                <div class="flex items-start gap-2 text-xs text-gray-700 bg-white rounded-lg p-2 border border-gray-100">
                                    <span class="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                    <div class="flex-1">
                                        <span class="font-semibold text-gray-800">${key}:</span>
                                        <span class="ml-1">${value}</span>
                                    </div>
                                </div>
                            `;
                            i++;
                        } else if (bulletWithBold) {
                            // Main category/item - capture title, subtitle, AND any remaining content on same line
                            const mainTitle = this.formatInlineText(bulletWithBold[1]);
                            const subtitle = bulletWithBold[2] ? `(${bulletWithBold[2]})` : '';
                            const remainingContent = bulletWithBold[3] ? bulletWithBold[3].trim() : '';
                            
                            html += `
                                <div class="bg-white rounded-lg p-2.5 border border-gray-200">
                                    <div class="font-semibold text-gray-800 text-sm mb-1.5">
                                        <span class="text-purple-500 mr-1.5">•</span>
                                        ${mainTitle}
                                        ${subtitle ? `<span class="text-gray-500 text-xs font-normal ml-1">${subtitle}</span>` : ''}
                                        ${remainingContent ? `<span class="text-gray-600 text-xs font-normal ml-1">${this.formatInlineText(remainingContent)}</span>` : ''}
                                    </div>
                            `;
                            
                            // Collect sub-items (lines starting with →)
                            let subItems = [];
                            i++;
                            while (i < lines.length) {
                                const nextLine = lines[i];
                                if (nextLine.match(/^\s*→/)) {
                                    subItems.push(nextLine.trim());
                                    i++;
                                } else if (nextLine.match(/^•/) || nextLine.match(/^\d+\./)) {
                                    // Next main item
                                    break;
                                } else if (nextLine.trim().length === 0) {
                                    // Empty line
                                    i++;
                                } else {
                                    // Continuation or other content - include it
                                    subItems.push(nextLine);
                                    i++;
                                }
                            }
                            
                            if (subItems.length > 0) {
                                html += `<div class="ml-4 space-y-1.5 mt-1.5">`;
                                subItems.forEach(subItem => {
                                    const isArrow = subItem.match(/^→\s*(.+)/);
                                    const content = isArrow ? isArrow[1] : subItem.replace(/^→\s*/, '').trim();
                                    if (content) {
                                        const formattedContent = this.formatInlineText(content);
                                        html += `
                                            <div class="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5">
                                                <span class="text-blue-500 mt-0.5 flex-shrink-0">→</span>
                                                <span class="flex-1">${formattedContent}</span>
                                            </div>
                                        `;
                                    }
                                });
                                html += `</div>`;
                            }
                            html += `</div>`;
                        } else if (arrowMatch && i > 0) {
                            // Standalone arrow item
                            const formattedContent = this.formatInlineText(arrowMatch[1]);
                            html += `
                                <div class="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5 ml-4">
                                    <span class="text-blue-500 mt-0.5 flex-shrink-0">→</span>
                                    <span class="flex-1">${formattedContent}</span>
                                </div>
                            `;
                            i++;
                        } else {
                            // Regular bullet point or any other line - preserve ALL content
                            // Remove bullet marker but keep everything else
                            const cleanLine = line.replace(/^[-•]\s*/, '').trim();
                            if (cleanLine) {
                                const formattedLine = this.formatInlineText(cleanLine);
                                html += `
                                    <div class="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                                        <span class="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                        <span class="flex-1">${formattedLine}</span>
                                    </div>
                                `;
                            }
                            i++;
                        }
                    }
                    
                    html += `</div></div>`; // Close content div and card div
                } else {
                    html += `</div>`; // Close card if no content
                }
            }
        });
        
        return html || this.formatAIInsights(text);
    },
    
    /**
     * Format inline text with proper styling while preserving all content
     */
    formatInlineText(text) {
        if (!text) return '';
        
        // First handle markdown formatting (before HTML escaping)
        // Format bold text (**text**)
        text = text.replace(/\*\*(.*?)\*\*/g, '___BOLD_START___$1___BOLD_END___');
        
        // Now escape HTML to prevent XSS
        text = Utils.escapeHtml(text);
        
        // Restore bold formatting with HTML tags
        text = text.replace(/___BOLD_START___/g, '<strong class="text-gray-800 font-semibold">');
        text = text.replace(/___BOLD_END___/g, '</strong>');
        
        // Format currency (₹ followed by numbers) - after escaping
        text = text.replace(/₹(\d[\d,]*)/g, '<span class="text-green-600 font-bold">₹$1</span>');
        
        // Format arrows (→) - preserve the actual arrow character
        text = text.replace(/→/g, '<span class="text-blue-500 mx-0.5">→</span>');
        
        // Format percentages
        text = text.replace(/(\d+)%/g, '<span class="font-semibold">$1%</span>');
        
        // Emojis will display correctly as Unicode characters
        
        return text;
    },
    
    /**
     * Format AI insights text with proper HTML (fallback)
     */
    formatAIInsights(text) {
        if (!text) return '';
        
        // Convert markdown-style formatting to HTML
        return text
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Bullet points
            .replace(/^[-•]\s+(.*)$/gm, '<li class="ml-4">$1</li>')
            // Numbered lists
            .replace(/^(\d+)\.\s+(.*)$/gm, '<li class="ml-4"><span class="font-semibold">$1.</span> $2</li>')
            // Line breaks
            .replace(/\n\n/g, '</p><p class="mt-2">')
            .replace(/\n/g, '<br>')
            // Wrap in paragraph
            .replace(/^(.*)$/, '<p>$1</p>');
    },
    
    /**
     * Get next month's year
     */
    getNextMonthYear() {
        const now = new Date();
        return now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    },
    
    /**
     * Get next month (1-12)
     */
    getNextMonth() {
        const now = new Date();
        return now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    },
    
    /**
     * Format relative time
     */
    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    },
    
    /**
     * Fetch AI insights for expense reduction
     */
    async fetchAIInsights(year, month, forceReload = false) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        
        // Check cache unless force reload
        if (!forceReload && this.aiExpenseInsightsCache[monthKey]) {
            return;
        }
        
        // Check if AI is configured
        if (!window.AIProvider || !window.AIProvider.isConfigured()) {
            Utils.showError('Please configure AI provider in settings first');
            return;
        }
        
        this.aiInsightsLoading = true;
        this.updateAIInsightsUI(year, month);
        
        // Suppress AI provider info messages
        const previousSuppressState = window.AIProvider.suppressInfoMessages;
        window.AIProvider.suppressInfoMessages = true;
        
        try {
            // Prepare comprehensive expense data
            const analysisData = this.prepareExpenseAnalysisData(year, month);
            
            // Build the prompt
            const prompt = this.buildExpenseInsightsPrompt(analysisData, year, month);
            
            // Call AI
            const response = await window.AIProvider.call(prompt, null);
            
            // Cache the response with the deterministic summary numbers we
            // already computed, so the modal can render a fixed-format
            // cash-flow card without recomputing on every open.
            this.aiExpenseInsightsCache[monthKey] = {
                insights: response,
                timestamp: Date.now(),
                year: year,
                month: month,
                summary: this._buildInsightsSummary(analysisData)
            };
            window.Storage.save(); // Persist to storage
            
        } catch (error) {
            console.error('AI Insights error:', error);
            // Surface the message so the user can tell apart prompt-build
            // failures (our bug) from API failures (rate limit, key missing,
            // network). Truncated to keep the toast readable.
            const msg = (error && (error.message || error.toString())) || '';
            const detail = msg ? `: ${msg.slice(0, 120)}` : '';
            Utils.showError(`Failed to get AI insights${detail}. Please try again.`);
        } finally {
            // Restore AI provider info messages state
            window.AIProvider.suppressInfoMessages = previousSuppressState;
            this.aiInsightsLoading = false;
            this.updateAIInsightsUI(year, month);
        }
    },
    
    /**
     * Reload AI insights (force refresh)
     */
    reloadAIInsights(year, month) {
        this.fetchAIInsights(year, month, true);
    },
    
    /**
     * Update the AI insights UI in the modal
     */
    updateAIInsightsUI(year, month) {
        const actionsEl = document.getElementById('ai-insights-actions');
        const contentEl = document.getElementById('ai-insights-content');
        
        if (actionsEl) {
            actionsEl.innerHTML = this.getAIInsightsActions(year, month);
        }
        if (contentEl) {
            contentEl.innerHTML = this.getAIInsightsContent(year, month);
        }
    },
    
    /**
     * Mask sensitive data for AI (remove personal identifiers)
     */
    maskSensitiveData(text) {
        if (!text) return text;
        // Mask phone numbers, emails, account numbers
        return text
            .replace(/\b\d{10,}\b/g, '***')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***')
            .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '****-****-****-****');
    },
    
    /**
     * Prepare comprehensive expense analysis data for AI (with masking)
     */
    prepareExpenseAnalysisData(targetYear, targetMonth) {
        const data = {
            targetMonth: { year: targetYear, month: targetMonth },
            historicalExpenses: [],
            recurringPayments: [],
            loans: [],
            emis: [],
            categoryBreakdown: {},
            topExpenses: [],
            investments: [],
            insights: {}
        };
        
        // Categories to exclude (occasional, not continuous)
        const excludeCategories = ['Gifts', 'Gift', 'Gifting'];
        
        // Configuration: Number of months for analysis
        const ANALYSIS_MONTHS = 6;
        
        // Get last 6 months of expenses for recent trend
        const projectionData = this.getProjectedRegularExpensesWithDetails(ANALYSIS_MONTHS);
        data.historicalExpenses = projectionData.monthlyData || [];
        data.projectedAverage = projectionData.average;
        data.analysisMonths = ANALYSIS_MONTHS;

        // Frequent vs occasional breakdown (3-month window) — drives the
        // projection and gives AI raw signal to advise on growth/anomalies.
        data.variableSpendBreakdown = {
            projection: projectionData.projection,
            frequentProjection: projectionData.frequentProjection,
            occasionalBuffer: projectionData.occasionalBuffer,
            occasionalAveragePerMonth: projectionData.occasionalAveragePerMonth,
            occasionalWeight: projectionData.occasionalWeight,
            // Top 12 frequent items by amount (full pool for the prompt;
            // UI separately shows fewer).
            frequentItems: (projectionData.frequentItems || []).slice(0, 12),
            // Notable occasional items (top 8 by ₹) — useful for AI to call
            // out big one-offs that inflated last month.
            occasionalItems: (projectionData.occasionalItems || []).slice(0, 8),
        };
        
        // Get detailed expenses by category for last 6 months
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const analysisStartDate = new Date(today.getFullYear(), today.getMonth() - ANALYSIS_MONTHS, 1);
        
        const recentExpenses = expenses.filter(exp => {
            const expDate = new Date(exp.date);
            const cat = (exp.category || '').toLowerCase();
            // Exclude gift-related expenses
            const isGift = excludeCategories.some(g => cat.includes(g.toLowerCase()));
            return expDate >= analysisStartDate && expDate < new Date(today.getFullYear(), today.getMonth(), 1) && !isGift;
        });
        
        // Category breakdown with individual expense items
        const expensesByTitle = {}; // Group by title for detailed breakdown
        
        recentExpenses.forEach(exp => {
            const cat = exp.category || 'Other';
            const title = exp.title || 'Untitled';
            
            if (!data.categoryBreakdown[cat]) {
                data.categoryBreakdown[cat] = { total: 0, count: 0, avgPerTransaction: 0, items: {} };
            }
            data.categoryBreakdown[cat].total += parseFloat(exp.amount) || 0;
            data.categoryBreakdown[cat].count++;
            
            // Track individual items within each category
            if (!data.categoryBreakdown[cat].items[title]) {
                data.categoryBreakdown[cat].items[title] = { total: 0, count: 0 };
            }
            data.categoryBreakdown[cat].items[title].total += parseFloat(exp.amount) || 0;
            data.categoryBreakdown[cat].items[title].count++;
            
            // Also track overall by title
            if (!expensesByTitle[title]) {
                expensesByTitle[title] = { total: 0, count: 0, category: cat };
            }
            expensesByTitle[title].total += parseFloat(exp.amount) || 0;
            expensesByTitle[title].count++;
        });
        
        // Calculate averages
        Object.keys(data.categoryBreakdown).forEach(cat => {
            const info = data.categoryBreakdown[cat];
            info.avgPerTransaction = Math.round(info.total / info.count);
            info.monthlyAvg = Math.round(info.total / ANALYSIS_MONTHS);
            
            // Calculate averages for individual items
            Object.keys(info.items).forEach(title => {
                info.items[title].monthlyAvg = Math.round(info.items[title].total / ANALYSIS_MONTHS);
            });
        });
        
        // Top individual expenses (by title) for detailed breakdown
        data.topExpenses = Object.entries(expensesByTitle)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 15) // Top 15 expense titles
            .map(([title, info]) => ({
                title: title,
                category: info.category,
                total: info.total,
                count: info.count,
                monthlyAvg: Math.round(info.total / ANALYSIS_MONTHS)
            }));
        
        // Top expense categories with their top items
        data.topCategories = Object.entries(data.categoryBreakdown)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 8)
            .map(([cat, info]) => {
                // Get top items in this category
                const topItems = Object.entries(info.items || {})
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 5) // Top 5 items per category
                    .map(([title, itemInfo]) => ({
                        title: title,
                        total: itemInfo.total,
                        count: itemInfo.count,
                        monthlyAvg: itemInfo.monthlyAvg
                    }));
                
                return {
                    category: cat,
                    total: info.total,
                    count: info.count,
                    monthlyAvg: info.monthlyAvg,
                    topItems: topItems
                };
            });
        
        // Recurring payments with actual names (exclude suspended)
        if (window.RecurringExpenses) {
            const recurring = window.RecurringExpenses.getAll();
            data.recurringPayments = recurring
                .filter(r => window.RecurringExpenses.isEffectivelyActive(r))
                .filter(r => !excludeCategories.some(g => (r.category || '').toLowerCase().includes(g.toLowerCase())))
                .map(r => ({
                    name: r.title || r.name || 'Subscription',
                    category: r.category || 'Other',
                    amount: parseFloat(r.amount) || 0,
                    frequency: r.frequency
                }));
        }
        
        // Loans with actual names
        if (window.DB.loans && window.DB.loans.length > 0) {
            data.loans = window.DB.loans.map((loan) => {
                // Calculate EMI amount using the Loans module
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure && window.Loans) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                emiAmount = parseFloat(emiAmount) || 0;
                
                // Calculate remaining balance and months
                let remainingAmount = 0;
                let remainingMonths = 0;
                let paidEmis = 0;
                if (window.Loans && loan.firstEmiDate && loan.amount && loan.interestRate && loan.tenure) {
                    const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                    remainingAmount = remaining.remainingBalance || 0;
                    remainingMonths = remaining.emisRemaining || 0;
                    paidEmis = remaining.emisPaid || 0;
                }
                
                // Use actual loan name: "BankName LoanType" (e.g., "HDFC Home Loan", "SBI Personal Loan")
                const loanTypeDisplay = loan.loanType === 'Other' && loan.customLoanType 
                    ? loan.customLoanType 
                    : (loan.loanType || 'Loan');
                const loanName = `${loan.bankName || 'Unknown'} ${loanTypeDisplay}`;
                
                // Determine if this is a high-interest loan (bad loan)
                // Home loans: avg 8-9%, Personal: avg 12-15%, Credit Card: 15-24%
                const interestRate = parseFloat(loan.interestRate) || 0;
                let loanCategory = 'normal';
                if (loanTypeDisplay.toLowerCase().includes('personal') && interestRate > 15) {
                    loanCategory = 'high-interest';
                } else if (loanTypeDisplay.toLowerCase().includes('home') && interestRate > 10) {
                    loanCategory = 'high-interest';
                } else if (interestRate > 18) {
                    loanCategory = 'high-interest';
                }
                
                return {
                    name: loanName,
                    loanType: loanTypeDisplay,
                    reason: loan.reason || '',
                    emiAmount: Math.round(emiAmount),
                    remainingAmount: Math.round(remainingAmount),
                    totalAmount: Math.round(parseFloat(loan.amount) || 0),
                    totalTenure: loan.tenure || 0,
                    paidEmis: paidEmis,
                    remainingMonths: remainingMonths,
                    interestRate: interestRate,
                    loanCategory: loanCategory // 'normal' or 'high-interest'
                };
            }).filter(loan => loan.remainingMonths > 0); // Only include active loans
        }
        
        // EMIs from cards with actual names
        if (window.DB.cards) {
            window.DB.cards.forEach(card => {
                if (card.cardType === 'debit') return; // Skip debit cards
                if (card.emis && card.emis.length > 0) {
                    card.emis.forEach(emi => {
                        // Auto-update EMI progress
                        if (window.Cards && window.Cards.updateEMIProgress) {
                            window.Cards.updateEMIProgress(emi);
                        }
                        
                        const totalCount = emi.totalCount || emi.totalEmis || 0;
                        const paidCount = emi.paidCount || 0;
                        const remainingEmis = totalCount - paidCount;
                        
                        // Only include active EMIs with remaining payments
                        if (!emi.completed && remainingEmis > 0 && emi.emiAmount) {
                            // Use actual card and EMI name: "CardName - EMI Reason"
                            const emiName = `${card.nickname || card.name || 'Card'}: ${emi.reason || 'EMI'}`;
                            
                            data.emis.push({
                                name: emiName,
                                cardName: card.nickname || card.name || 'Card',
                                reason: emi.reason || '',
                                description: emi.description || '',
                                emiAmount: Math.round(parseFloat(emi.emiAmount) || 0),
                                paidEmis: paidCount,
                                remainingEmis: remainingEmis,
                                totalEmis: totalCount,
                                totalAmount: Math.round(parseFloat(emi.emiAmount) * totalCount)
                            });
                        }
                    });
                }
            });
        }
        
        // Investments data for the same period
        // Use getMonthInvestments which properly handles incomeMonth/incomeYear attribution
        const investmentsByMonth = {};
        const goldRate = (window.Investments && window.Investments.getGoldRate) ? window.Investments.getGoldRate() : (typeof window.DB.goldRatePerGram === 'number' ? window.DB.goldRatePerGram : (window.DB.goldRatePerGram?.rate || 10000));
        const exchangeRate = (window.Investments && window.Investments.getExchangeRate) ? window.Investments.getExchangeRate() : (typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : (window.DB.exchangeRate?.rate || 89));
        
        for (let i = 1; i <= ANALYSIS_MONTHS; i++) {
            const analysisDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const invYear = analysisDate.getFullYear();
            const invMonth = analysisDate.getMonth() + 1;
            const monthKey = analysisDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const monthValue = `${invYear}-${String(invMonth).padStart(2, '0')}`;
            
            // Use the existing getMonthInvestments function
            const monthTotal = this.getMonthInvestments(monthValue);
            
            // Get investment items for type breakdown
            const monthItems = this.getMonthInvestmentItems ? this.getMonthInvestmentItems(monthValue) : [];
            const types = {};
            monthItems.forEach(item => {
                // Only include non-zero values with valid type
                if (item.amount && item.amount > 0 && item.type) {
                    const typeKey = item.type || 'Other';
                    types[typeKey] = (types[typeKey] || 0) + item.amount;
                }
            });
            
            // Only include month if there are actual investments
            if (monthTotal > 0) {
                investmentsByMonth[monthKey] = { 
                    total: Math.round(monthTotal), 
                    count: monthItems.filter(i => i.amount > 0).length, 
                    types: types 
                };
            }
        }
        
        // Calculate investment fluctuations and deviations
        const investmentMonths = Object.entries(investmentsByMonth)
            .map(([month, info]) => ({ month, amount: info.total, types: info.types }))
            .sort((a, b) => a.month.localeCompare(b.month));
        
        // Calculate fluctuations (month-to-month changes)
        const fluctuations = [];
        for (let i = 1; i < investmentMonths.length; i++) {
            const prev = investmentMonths[i - 1];
            const curr = investmentMonths[i];
            const change = curr.amount - prev.amount;
            const changePercent = prev.amount > 0 ? Math.round((change / prev.amount) * 100) : 0;
            fluctuations.push({
                from: prev.month,
                to: curr.month,
                change: change,
                changePercent: changePercent,
                trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
            });
        }
        
        // Find highest and lowest months
        const amounts = investmentMonths.map(m => m.amount);
        const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
        const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
        const maxMonth = investmentMonths.find(m => m.amount === maxAmount);
        const minMonth = investmentMonths.find(m => m.amount === minAmount);
        const variation = maxAmount - minAmount;
        const variationPercent = minAmount > 0 ? Math.round((variation / minAmount) * 100) : 0;
        
        // Create investments object with fluctuation data
        const totalInvestments = Object.values(investmentsByMonth).reduce((sum, m) => sum + (m.total || 0), 0);
        const monthlyAvg = ANALYSIS_MONTHS > 0 ? Math.round(totalInvestments / ANALYSIS_MONTHS) : 0;
        
        data.investments = {
            byMonth: investmentsByMonth,
            totalLastMonths: totalInvestments,
            monthlyAvg: monthlyAvg,
            // Fluctuation analysis
            fluctuations: fluctuations || [],
            highestMonth: maxMonth && maxAmount > 0 ? { month: maxMonth.month, amount: maxAmount } : null,
            lowestMonth: minMonth && minAmount > 0 ? { month: minMonth.month, amount: minAmount } : null,
            variation: variation || 0,
            variationPercent: variationPercent || 0,
            monthlyBreakdown: investmentMonths || []
        };
        
        // Budget Rule Analysis (Needs/Wants/Invest) for last 6 months
        const budgetRule = this.budgetRule; // User's target: e.g., 50/30/20
        data.budgetAnalysis = {
            targetRule: budgetRule,
            monthlyBreakdown: []
        };
        
        // Analyze each of the last 6 months
        for (let i = 1; i <= ANALYSIS_MONTHS; i++) {
            const analysisDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthYear = analysisDate.getFullYear();
            const monthNum = analysisDate.getMonth() + 1;
            const monthLabel = analysisDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            
            // Get income for this month using the correct function
            const incomeResult = this.getIncomeForExpenseComparison(monthYear, monthNum);
            const monthlyIncome = incomeResult.income || 0;
            
            // Get needs, wants for this month
            const needsTotal = this.getNeedsTotal(monthYear, monthNum);
            const wantsTotal = this.getWantsTotal(monthYear, monthNum);
            const monthInvestments = this.getMonthInvestments(`${monthYear}-${String(monthNum).padStart(2, '0')}`);
            
            // Calculate percentages
            const needsPercent = monthlyIncome > 0 ? Math.round((needsTotal / monthlyIncome) * 100) : 0;
            const wantsPercent = monthlyIncome > 0 ? Math.round((wantsTotal / monthlyIncome) * 100) : 0;
            const investPercent = monthlyIncome > 0 ? Math.round((monthInvestments / monthlyIncome) * 100) : 0;
            
            data.budgetAnalysis.monthlyBreakdown.push({
                month: monthLabel,
                income: monthlyIncome,
                needs: { amount: needsTotal, percent: needsPercent, target: budgetRule.needs },
                wants: { amount: wantsTotal, percent: wantsPercent, target: budgetRule.wants },
                invest: { amount: monthInvestments, percent: investPercent, target: budgetRule.invest },
                // Deviations from target
                needsDeviation: needsPercent - budgetRule.needs,
                wantsDeviation: wantsPercent - budgetRule.wants,
                investDeviation: investPercent - budgetRule.invest
            });
        }
        
        // Calculate averages for budget analysis
        const monthCount = data.budgetAnalysis.monthlyBreakdown.length || 1;
        const avgNeeds = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.needs.percent, 0) / monthCount);
        const avgWants = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.wants.percent, 0) / monthCount);
        const avgInvest = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.invest.percent, 0) / monthCount);
        const avgIncome = Math.round(data.budgetAnalysis.monthlyBreakdown.reduce((s, m) => s + m.income, 0) / monthCount);
        
        data.budgetAnalysis.averages = {
            income: avgIncome,
            needsPercent: avgNeeds,
            wantsPercent: avgWants,
            investPercent: avgInvest,
            needsDeviation: avgNeeds - budgetRule.needs,
            wantsDeviation: avgWants - budgetRule.wants,
            investDeviation: avgInvest - budgetRule.invest
        };
        
        // Calculate target comparison for investments (AFTER budgetAnalysis is created)
        const investTargetPercent = budgetRule.invest; // e.g., 20%
        const targetComparisons = [];
        let targetMisses = 0;
        let targetHits = 0;
        
        // Match investment months with budget analysis months for target comparison
        if (data.budgetAnalysis && data.budgetAnalysis.monthlyBreakdown) {
            data.budgetAnalysis.monthlyBreakdown.forEach(monthData => {
                const investData = investmentMonths.find(m => m.month === monthData.month);
                const actualInvest = investData ? investData.amount : 0;
                const actualPercent = monthData.invest.percent;
                const targetAmount = monthData.income > 0 ? Math.round((monthData.income * investTargetPercent) / 100) : 0;
                const missedTarget = actualPercent < investTargetPercent;
                
                if (missedTarget) targetMisses++;
                else if (actualPercent >= investTargetPercent) targetHits++;
                
                targetComparisons.push({
                    month: monthData.month,
                    income: monthData.income,
                    actualAmount: actualInvest,
                    actualPercent: actualPercent,
                    targetAmount: targetAmount,
                    targetPercent: investTargetPercent,
                    missedTarget: missedTarget,
                    deviation: actualPercent - investTargetPercent,
                    gapAmount: Math.max(0, targetAmount - actualInvest)
                });
            });
        }
        
        // Calculate severity metrics
        const totalMonths = targetComparisons.length;
        const missRate = totalMonths > 0 ? (targetMisses / totalMonths) * 100 : 0;
        const severity = missRate >= 50 ? 'critical' : missRate >= 30 ? 'serious' : missRate > 0 ? 'moderate' : 'none';
        
        // Add target comparison to investments object (ensure it exists first)
        if (!data.investments) {
            data.investments = {};
        }
        data.investments.targetPercent = investTargetPercent;
        data.investments.targetComparisons = targetComparisons;
        data.investments.targetMisses = targetMisses;
        data.investments.targetHits = targetHits;
        data.investments.missRate = Math.round(missRate);
        data.investments.severity = severity;
        
        // Calculate insights
        const totalRecurring = data.recurringPayments.reduce((sum, r) => sum + r.amount, 0);
        const totalLoans = data.loans.reduce((sum, l) => sum + l.emiAmount, 0);
        const totalEmis = data.emis.reduce((sum, e) => sum + e.emiAmount, 0);
        const totalFixed = totalRecurring + totalLoans + totalEmis;
        
        data.insights = {
            totalRecurring,
            totalLoans,
            totalEmis,
            totalFixed,
            variableExpenses: data.projectedAverage,
            totalProjected: totalFixed + data.projectedAverage,
            investmentRate: data.investments.monthlyAvg,
            avgMonthlyIncome: avgIncome,
            savingsAfterExpenses: data.projectedAverage > 0 ? Math.round((data.investments.monthlyAvg / data.projectedAverage) * 100) : 0
        };
        
        // Add Year-over-Year comparison data
        // Use the passed targetMonth parameter (the month we're analyzing for)
        data.yearOverYear = this.getYearOverYearData(targetMonth);

        // Add detected annual patterns
        data.annualPatterns = this.detectAnnualPatterns(targetMonth);

        // ===== TARGET MONTH SPECIFIC DATA (for forward-looking insights) =====
        // What's actually scheduled / known for the upcoming month?
        const upcomingRecurring = this.getRecurringExpenseItemsForMonth(targetYear, targetMonth) || [];
        const upcomingEmis = (this.getEmiItemsForMonth(targetYear, targetMonth) || []).filter(e => e.type === 'loan' || e.type === 'card');
        const upcomingIncomeData = this.getIncomeForExpenseComparison(targetYear, targetMonth);

        const upcomingRecurringTotal = upcomingRecurring.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        const upcomingEmiTotal = upcomingEmis.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

        // Pending plans with planByDate in or before target month
        const pendingPlans = (window.DB.plans || []).filter(p => p.status === 'pending');
        const targetMonthEnd = new Date(targetYear, targetMonth, 0);
        const targetPlans = pendingPlans.filter(p => {
            if (!p.planByDate) return false;
            return new Date(p.planByDate) <= targetMonthEnd;
        }).map(p => ({
            name: p.name,
            amount: parseFloat(p.amount) || 0,
            planByDate: p.planByDate,
            description: p.description || ''
        }));
        const targetPlansTotal = targetPlans.reduce((s, p) => s + p.amount, 0);

        // Calculate available cash for the target month
        const expectedIncome = upcomingIncomeData.income || data.insights.avgMonthlyIncome || 0;
        const fixedObligations = upcomingRecurringTotal + upcomingEmiTotal;
        const projectedVariable = data.projectedAverage || 0;
        // Absolute target — total ₹ that needs to be invested this month to
        // hit the user's budget rule (e.g. 20% of income). Used as a benchmark.
        const investmentTargetTotal = expectedIncome > 0
            ? Math.round((expectedIncome * (data.budgetAnalysis?.targetRule?.invest || 20)) / 100)
            : 0;
        // The cash-flow surplus subtracts SIPs once (via fullFixed below). So
        // the *additional* deduction needed for "extra investing" is only the
        // GAP between target and what SIPs already cover. If SIPs already meet
        // or exceed the target, this is zero — no double-counting.
        // investmentTargetGap is set after sipsCommitment is computed (below);
        // we initialize it here so the legacy projectedTotal stays defined.
        const projectedTotal = fixedObligations + projectedVariable + investmentTargetTotal + targetPlansTotal;
        const projectedSurplus = expectedIncome - projectedTotal;

        // ===== EXTRA CONTEXT: financial health, cash, SIPs, money-lent, card bills =====
        // These were missing from the AI prompt — without them the AI can't ground
        // advice in the user's actual safety net or planned investment commitments.

        // Financial health (net worth, emergency fund, risk %).
        if (window.FinancialHealth) {
            try {
                const nw = window.FinancialHealth.computeNetWorth();
                const ef = window.FinancialHealth.computeEmergencyFund();
                data.financialHealth = {
                    netWorth: Math.round(nw.total),
                    assets: Math.round(nw.assets.totalAssets),
                    liabilities: Math.round(nw.liabilities.totalLiabilities),
                    cashSavings: Math.round(nw.assets.cashSavings || 0),
                    investmentBreakdown: {
                        EPF: Math.round(nw.assets.investmentBreakdown?.EPF || 0),
                        FD: Math.round(nw.assets.investmentBreakdown?.FD || 0),
                        GOLD: Math.round(nw.assets.investmentBreakdown?.GOLD || 0),
                        SHARES: Math.round(nw.assets.investmentBreakdown?.SHARES || 0),
                        MF: Math.round(nw.assets.investmentBreakdown?.MF || 0),
                    },
                    riskAmount: Math.round(nw.risk?.amount || 0),
                    riskPercent: Math.round(nw.risk?.percentOfNetWorth || 0),
                    emergencyFund: {
                        liquid: Math.round(ef.liquid),
                        cashBalance: Math.round(ef.cashBalance || 0),
                        flaggedTotal: Math.round(ef.flaggedTotal || 0),
                        monthlyEssentials: Math.round(ef.monthlyEssentials),
                        months: parseFloat((ef.months || 0).toFixed(1)),
                        status: ef.status,                  // 'critical' | 'low' | 'good'
                        targetMonths: ef.target,
                        shortfall: Math.round(ef.shortfall || 0),
                    },
                };
            } catch (e) {
                console.warn('FinancialHealth unavailable for AI insights:', e);
            }
        }

        // Active SIPs — planned monthly investment commitments. Use the SAME
        // source the Settlement modal uses (window.Sips.getActiveForSettlement)
        // so the AI insights can never disagree with what the user sees there.
        // Earlier this read window.SIPs.getAll() (uppercase + wrong method) and
        // silently produced an empty list, so the AI was unaware of any SIPs.
        if (window.Sips && typeof window.Sips.getActiveForSettlement === 'function') {
            const activeSips = window.Sips.getActiveForSettlement().map(s => ({
                name: s.name,
                amount: Math.round(parseFloat(s.amount) || 0),
            }));
            data.sips = {
                count: activeSips.length,
                total: activeSips.reduce((sum, s) => sum + s.amount, 0),
                items: activeSips,
            };
        } else {
            data.sips = { count: 0, total: 0, items: [] };
        }

        // Money lent (receivables — cash that's "out" but still yours).
        if (window.MoneyLent && Array.isArray(window.DB.moneyLent)) {
            const lentItems = window.DB.moneyLent
                .map(rec => ({
                    name: rec.borrower || rec.name || 'Unknown',
                    outstanding: Math.round(window.MoneyLent.calculateOutstanding(rec) || 0),
                }))
                .filter(rec => rec.outstanding > 0);
            data.moneyLent = {
                count: lentItems.length,
                total: lentItems.reduce((sum, r) => sum + r.outstanding, 0),
                items: lentItems.slice(0, 5),  // top 5 only
            };
        }

        // Past-due credit-card bills (unpaid). These are a hidden obligation
        // the cash-flow forecast doesn't otherwise capture.
        const allBills = window.DB.cardBills || [];
        const today2 = new Date();
        const targetMonthStart = new Date(targetYear, targetMonth - 1, 1);
        const targetMonthEnd2 = new Date(targetYear, targetMonth, 0);

        const unpaidPast = allBills
            .filter(b => !b.isPaid && b.dueDate && new Date(b.dueDate) < today2)
            .map(b => {
                const card = (window.DB.cards || []).find(c => String(c.id) === String(b.cardId));
                return {
                    cardName: (card?.nickname || card?.name || `Card ${b.cardLast4 || ''}`).trim(),
                    amount: Math.round(parseFloat(b.amount) || 0),
                    dueDate: b.dueDate,
                };
            })
            .filter(b => b.amount > 0);

        data.unpaidCardBills = {
            count: unpaidPast.length,
            total: unpaidPast.reduce((sum, b) => sum + b.amount, 0),
            items: unpaidPast.slice(0, 5),
        };

        // Upcoming credit-card bills due IN the target month.
        const upcomingBills = allBills
            .filter(b => !b.isPaid && b.dueDate)
            .filter(b => {
                const d = new Date(b.dueDate);
                return d >= targetMonthStart && d <= targetMonthEnd2;
            })
            .map(b => {
                const card = (window.DB.cards || []).find(c => String(c.id) === String(b.cardId));
                return {
                    cardName: (card?.nickname || card?.name || `Card ${b.cardLast4 || ''}`).trim(),
                    amount: Math.round(parseFloat(b.amount) || 0),
                    dueDate: b.dueDate,
                };
            })
            .filter(b => b.amount > 0);

        data.upcomingCardBills = {
            count: upcomingBills.length,
            total: upcomingBills.reduce((sum, b) => sum + b.amount, 0),
            items: upcomingBills,
        };

        // Recompute fixed obligations to include SIPs, unpaid card bills, and
        // upcoming card bills — these are real claims on the target month's cash.
        const sipsCommitment = data.sips?.total || 0;
        const unpaidBillsTotal = data.unpaidCardBills.total;
        const upcomingBillsTotal = data.upcomingCardBills.total;
        const fullFixed = fixedObligations + sipsCommitment + unpaidBillsTotal + upcomingBillsTotal;
        // Top-up above SIPs needed to reach the budget rule's invest %. This
        // is the "extra" the cash-flow line refers to — it's NOT advice to
        // add a new SIP, just a benchmark for how much more (if any) would
        // hit the target. Capped at zero so over-saving doesn't add a
        // negative deduction.
        const investmentTargetGap = Math.max(0, investmentTargetTotal - sipsCommitment);
        const fullProjectedTotal = fullFixed + projectedVariable + investmentTargetGap + targetPlansTotal;
        const fullSurplus = expectedIncome - fullProjectedTotal;

        data.targetMonthForecast = {
            expectedIncome,
            fixedObligations,         // recurring + EMIs (legacy)
            sipsCommitment,
            unpaidBillsTotal,
            upcomingBillsTotal,
            fullFixed,                // recurring + EMIs + SIPs + card bills (past due + upcoming)
            recurring: { total: upcomingRecurringTotal, items: upcomingRecurring },
            emis: { total: upcomingEmiTotal, items: upcomingEmis },
            projectedVariable,
            investmentTargetTotal,    // absolute ₹ to hit invest %
            investmentTargetGap,      // top-up above SIPs needed to hit it
            // Legacy alias — older prompt copy still references investmentTarget.
            // Mapped to the GAP so cash-flow math stops double-counting SIPs.
            investmentTarget: investmentTargetGap,
            targetPlans,
            targetPlansTotal,
            projectedTotal: fullProjectedTotal,
            projectedSurplus: fullSurplus,
            isCashTight: fullSurplus < 0
        };

        // ===== Multi-month outlook =====
        // Look 3 months past the target month for "heavier" months — months
        // where scheduled fixed obligations (recurring + EMIs + plans due by
        // then) outsize the target-month forecast. The AI uses this to tell
        // the user whether to PARK this month's surplus for an upcoming
        // expense crunch instead of immediately routing it to investments.
        const lookAhead = [];
        for (let i = 1; i <= 3; i++) {
            const ahead = new Date(targetYear, targetMonth - 1 + i, 1);
            const ay = ahead.getFullYear();
            const am = ahead.getMonth() + 1;
            const monthLabel = ahead.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

            const aRecurring = (this.getRecurringExpenseItemsForMonth(ay, am) || [])
                .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const aEmis = (this.getEmiItemsForMonth(ay, am) || [])
                .filter(e => e.type === 'loan' || e.type === 'card')
                .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

            const monthEnd = new Date(ay, am, 0);
            const aPlans = pendingPlans
                .filter(p => p.planByDate)
                .filter(p => {
                    const d = new Date(p.planByDate);
                    return d > targetMonthEnd && d <= monthEnd;
                })
                .map(p => ({ name: p.name, amount: parseFloat(p.amount) || 0, planByDate: p.planByDate }));
            const aPlansTotal = aPlans.reduce((s, p) => s + p.amount, 0);

            // "Fixed" here = obligations that don't depend on actual spending
            // (recurring + EMIs + SIPs as a baseline + plans dated for that
            // month). Compared against the TARGET month's same baseline so
            // we can flag heavier-than-usual months.
            const aFixed = aRecurring + aEmis + sipsCommitment + aPlansTotal;
            const targetBaseline = upcomingRecurringTotal + upcomingEmiTotal + sipsCommitment + targetPlansTotal;
            const deltaVsTarget = aFixed - targetBaseline;

            lookAhead.push({
                year: ay,
                month: am,
                monthLabel,
                recurringTotal: Math.round(aRecurring),
                emiTotal: Math.round(aEmis),
                plansTotal: Math.round(aPlansTotal),
                plans: aPlans,
                fixed: Math.round(aFixed),
                deltaVsTarget: Math.round(deltaVsTarget),
            });
        }

        // Aggregate "park-for-future" budget — sum of positive deltas across
        // the next 3 months. If everything ahead is lighter or equal, this
        // is 0 and the AI should send surplus to EF / investments instead.
        const parkForFuture = lookAhead.reduce((s, m) => s + Math.max(0, m.deltaVsTarget), 0);
        const heaviestMonth = lookAhead.reduce(
            (acc, m) => (acc == null || m.deltaVsTarget > acc.deltaVsTarget) ? m : acc,
            null
        );

        data.upcomingMonthsOutlook = {
            months: lookAhead,
            parkForFuture: Math.round(parkForFuture),
            heaviestMonth: heaviestMonth && heaviestMonth.deltaVsTarget > 0 ? heaviestMonth : null,
            // Convenience handle for the prompt — the most actionable surplus
            // worth setting aside this month for an upcoming heavier month.
            shouldParkSome: parkForFuture > 0 && fullSurplus > 0,
        };

        return data;
    },
    
    /**
     * Get Year-over-Year expense data for the same month from previous years
     * @param {number} targetMonth - Month to analyze (1-12)
     */
    getYearOverYearData(targetMonth) {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const result = {
            hasData: false,
            years: []
        };
        
        // Check last 2 years for the same month
        for (let yearsAgo = 1; yearsAgo <= 2; yearsAgo++) {
            const targetYear = currentYear - yearsAgo;
            const yearData = {
                year: targetYear,
                month: targetMonth,
                label: new Date(targetYear, targetMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                totalSpent: 0,
                expenses: [],
                categoryBreakdown: {}
            };
            
            // Filter expenses for this month/year
            const monthExpenses = expenses.filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getFullYear() === targetYear && (expDate.getMonth() + 1) === targetMonth;
            });
            
            if (monthExpenses.length > 0) {
                result.hasData = true;
                
                // Calculate totals and breakdown
                monthExpenses.forEach(exp => {
                    const amount = parseFloat(exp.amount) || 0;
                    yearData.totalSpent += amount;
                    
                    // Category breakdown
                    const cat = exp.category || 'Other';
                    if (!yearData.categoryBreakdown[cat]) {
                        yearData.categoryBreakdown[cat] = { total: 0, count: 0, items: [] };
                    }
                    yearData.categoryBreakdown[cat].total += amount;
                    yearData.categoryBreakdown[cat].count++;
                    yearData.categoryBreakdown[cat].items.push({
                        title: exp.title || 'Untitled',
                        amount: amount,
                        date: exp.date
                    });
                });
                
                // Get top expenses for this month
                yearData.expenses = monthExpenses
                    .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
                    .slice(0, 10)
                    .map(exp => ({
                        title: exp.title || 'Untitled',
                        category: exp.category || 'Other',
                        amount: parseFloat(exp.amount) || 0,
                        date: exp.date
                    }));
                
                // Sort categories by total spend
                yearData.topCategories = Object.entries(yearData.categoryBreakdown)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 5)
                    .map(([cat, info]) => ({
                        category: cat,
                        total: Math.round(info.total),
                        count: info.count
                    }));
                
                yearData.totalSpent = Math.round(yearData.totalSpent);
                result.years.push(yearData);
            }
        }
        
        return result;
    },
    
    /**
     * Detect recurring annual patterns for a specific month
     * Analyzes expenses across multiple years to find patterns
     * @param {number} targetMonth - Month to analyze (1-12)
     */
    detectAnnualPatterns(targetMonth) {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const result = {
            hasPatterns: false,
            patterns: [],
            monthName: new Date(2024, targetMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' })
        };
        
        // Collect expenses for this month across all available years
        const yearlyData = {};
        const categoryYearlySpend = {};
        const titleYearlySpend = {};
        
        expenses.forEach(exp => {
            const expDate = new Date(exp.date);
            const expMonth = expDate.getMonth() + 1;
            const expYear = expDate.getFullYear();
            
            // Only consider this specific month
            if (expMonth !== targetMonth) return;
            
            // Only look at data from previous years (not current year)
            if (expYear >= currentYear) return;
            
            const amount = parseFloat(exp.amount) || 0;
            const category = exp.category || 'Other';
            const title = exp.title || 'Untitled';
            
            // Track by year
            if (!yearlyData[expYear]) {
                yearlyData[expYear] = { total: 0, count: 0 };
            }
            yearlyData[expYear].total += amount;
            yearlyData[expYear].count++;
            
            // Track category spending per year
            if (!categoryYearlySpend[category]) {
                categoryYearlySpend[category] = {};
            }
            if (!categoryYearlySpend[category][expYear]) {
                categoryYearlySpend[category][expYear] = { total: 0, count: 0, items: [] };
            }
            categoryYearlySpend[category][expYear].total += amount;
            categoryYearlySpend[category][expYear].count++;
            categoryYearlySpend[category][expYear].items.push({ title, amount });
            
            // Track specific expense titles per year
            if (!titleYearlySpend[title]) {
                titleYearlySpend[title] = { category, years: {} };
            }
            if (!titleYearlySpend[title].years[expYear]) {
                titleYearlySpend[title].years[expYear] = 0;
            }
            titleYearlySpend[title].years[expYear] += amount;
        });
        
        const yearsWithData = Object.keys(yearlyData).length;
        
        // Need at least 1 year of historical data for the same month
        if (yearsWithData < 1) {
            return result;
        }
        
        result.hasPatterns = true;
        result.yearsAnalyzed = yearsWithData;
        
        // Detect category patterns (categories that spike in this month)
        Object.entries(categoryYearlySpend).forEach(([category, yearData]) => {
            const yearsPresent = Object.keys(yearData).length;
            
            // Pattern: Category appears in this month across multiple years
            if (yearsPresent >= 1) {
                const totalAcrossYears = Object.values(yearData).reduce((s, y) => s + y.total, 0);
                const avgSpend = Math.round(totalAcrossYears / yearsPresent);
                const countAcrossYears = Object.values(yearData).reduce((s, y) => s + y.count, 0);
                
                // Get most common items in this category for this month
                const allItems = {};
                Object.values(yearData).forEach(y => {
                    y.items.forEach(item => {
                        if (!allItems[item.title]) {
                            allItems[item.title] = { total: 0, count: 0 };
                        }
                        allItems[item.title].total += item.amount;
                        allItems[item.title].count++;
                    });
                });
                
                const topItems = Object.entries(allItems)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 3)
                    .map(([title, info]) => ({
                        title,
                        avgAmount: Math.round(info.total / yearsPresent)
                    }));
                
                // Only include significant patterns (above ₹500 average)
                if (avgSpend > 500) {
                    result.patterns.push({
                        type: 'category',
                        category: category,
                        yearsDetected: yearsPresent,
                        avgSpend: avgSpend,
                        totalTransactions: countAcrossYears,
                        topItems: topItems,
                        confidence: yearsPresent >= 2 ? 'high' : 'medium',
                        description: `${category} spending typically increases in ${result.monthName}`
                    });
                }
            }
        });
        
        // Detect specific recurring expense titles (same expense every year)
        Object.entries(titleYearlySpend).forEach(([title, data]) => {
            const yearsPresent = Object.keys(data.years).length;
            
            // Strong pattern: Same expense title appears in multiple years
            if (yearsPresent >= 2) {
                const totalAcrossYears = Object.values(data.years).reduce((s, amt) => s + amt, 0);
                const avgAmount = Math.round(totalAcrossYears / yearsPresent);
                
                // Only include significant patterns
                if (avgAmount > 1000) {
                    result.patterns.push({
                        type: 'recurring_expense',
                        title: title,
                        category: data.category,
                        yearsDetected: yearsPresent,
                        avgAmount: avgAmount,
                        yearlyAmounts: data.years,
                        confidence: 'high',
                        description: `"${title}" is a recurring annual expense in ${result.monthName}`
                    });
                }
            }
        });
        
        // Sort patterns by average spend (highest first)
        result.patterns.sort((a, b) => (b.avgSpend || b.avgAmount || 0) - (a.avgSpend || a.avgAmount || 0));
        
        // Keep top 10 patterns
        result.patterns = result.patterns.slice(0, 10);
        
        return result;
    },
    
    /**
     * Build the prompt for expense insights
     */
    buildExpenseInsightsPrompt(data, year, month) {
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Build detailed category breakdown with individual items
        let categoryDetailText = data.topCategories.map(c => {
            let text = `\n**${c.category}** - ₹${Math.round(c.monthlyAvg).toLocaleString()}/month (${c.count} transactions):`;
            if (c.topItems && c.topItems.length > 0) {
                c.topItems.forEach(item => {
                    text += `\n  - ${item.title}: ₹${Math.round(item.monthlyAvg).toLocaleString()}/month (${item.count} times)`;
                });
            }
            return text;
        }).join('\n');
        
        // Build top individual expenses list
        const analysisMonths = data.analysisMonths || 6;
        let topExpensesText = '';
        if (data.topExpenses && data.topExpenses.length > 0) {
            topExpensesText = data.topExpenses.map(e => 
                `• ${e.title} (${e.category}): ₹${Math.round(e.monthlyAvg).toLocaleString()}/month - ${e.count} times in ${analysisMonths} months`
            ).join('\n');
        }
        
        // Build recurring payments with actual names
        let recurringText = '';
        if (data.recurringPayments.length > 0) {
            // Sort by amount descending and list each subscription by name
            recurringText = data.recurringPayments
                .sort((a, b) => b.amount - a.amount)
                .map(r => `• ${r.name} (${r.category}): ₹${Math.round(r.amount).toLocaleString()}/${r.frequency || 'month'}`)
                .join('\n');
        }
        
        // Build loans summary — every loan is listed with its rate (see below).
        
        let loansText = '';
        if (data.loans.length > 0) {
            // Quick summary line
            loansText = `**Summary**: ${data.loans.length} active loan(s), Total EMI: ₹${Math.round(data.insights.totalLoans).toLocaleString()}/month\n\n`;

            // List EVERY loan with its interest rate, EMI, balance and progress.
            // Previously the rate was only printed for high-interest loans (and
            // for healthy ones only when there were zero problem loans), so a
            // mixed portfolio reached the AI with EMIs but no rates — making it
            // say "interest rates aren't mentioned". Now each loan always shows
            // its rate; the high-interest ones additionally get a flag.
            loansText += `All loans (rate · EMI · balance · progress):\n`;
            loansText += data.loans.map(l => {
                const flag = l.loanCategory === 'high-interest' ? ' ⚠️ HIGH-INTEREST — consider pre-closure' : '';
                const endingSoon = (l.remainingMonths <= 3 && l.remainingMonths > 0) ? ` 🎉 only ${l.remainingMonths} EMI(s) left` : '';
                return `• ${l.name}: **${l.interestRate}%** · ₹${Math.round(l.emiAmount).toLocaleString()}/mo · balance ₹${Math.round(l.remainingAmount).toLocaleString()} · ${l.paidEmis}/${l.totalTenure} paid${flag}${endingSoon}`;
            }).join('\n');
        } else {
            loansText = 'No active loans ✓';
        }
        
        // Build EMIs summary - similar approach
        const endingSoonEmis = data.emis.filter(e => e.remainingEmis <= 2 && e.remainingEmis > 0);
        
        let emisText = '';
        if (data.emis.length > 0) {
            emisText = `**Summary**: ${data.emis.length} active EMI(s), Total: ₹${Math.round(data.insights.totalEmis).toLocaleString()}/month\n\n`;
            
            // Show EMIs ending soon
            if (endingSoonEmis.length > 0) {
                emisText += `🎉 **ENDING SOON**:\n`;
                emisText += endingSoonEmis.map(e => 
                    `• ${e.name}: ${e.remainingEmis} EMI(s) left`
                ).join('\n');
                emisText += '\n\n';
            }
            
            // Brief list of ongoing EMIs
            const ongoingEmis = data.emis.filter(e => e.remainingEmis > 2);
            if (ongoingEmis.length > 0) {
                emisText += `📋 **Ongoing**: `;
                emisText += ongoingEmis.map(e => `${e.name} (${e.paidEmis}/${e.totalEmis})`).join(', ');
            }
        } else {
            emisText = 'No active card EMIs ✓';
        }
        
        // Build investments summary - only show months with actual investments
        let investText = '';
        if (data.investments && data.investments.byMonth) {
            const months = Object.entries(data.investments.byMonth).filter(([_, info]) => info.total > 0);
            if (months.length > 0) {
                investText = months.map(([month, info]) => {
                    let text = `• **${month}**: ₹${Math.round(info.total).toLocaleString()} total`;
                    if (Object.keys(info.types).length > 0) {
                        const typeBreakdown = Object.entries(info.types)
                            .filter(([t, amt]) => t && t !== 'undefined' && t !== 'null' && amt > 0)
                            .map(([t, amt]) => `  - ${t || 'Other'}: ₹${Math.round(amt).toLocaleString()}`)
                            .join('\n');
                        if (typeBreakdown) {
                            text += `\n${typeBreakdown}`;
                        }
                    }
                    return text;
                }).join('\n\n');
            } else {
                investText = 'No investments recorded in last 3 months';
            }
        }
        
        // Build budget rule analysis - only show problematic categories
        let budgetText = '';
        if (data.budgetAnalysis && data.budgetAnalysis.monthlyBreakdown) {
            const rule = data.budgetAnalysis.targetRule;
            const avg = data.budgetAnalysis.averages;
            
            budgetText = `Target Budget: ${rule.needs}% Needs / ${rule.wants}% Wants / ${rule.invest}% Invest\n`;
            budgetText += `Average Income (${analysisMonths} months): ₹${Math.round(avg.income).toLocaleString()}/month\n\n`;
            
            // Only show categories that are problematic
            const problems = [];
            
            if (avg.needsDeviation > 0) {
                problems.push({
                    category: 'Needs',
                    actual: avg.needsPercent,
                    target: rule.needs,
                    deviation: avg.needsDeviation,
                    amount: Math.round((avg.needsDeviation/100) * avg.income),
                    type: 'over'
                });
            }
            
            if (avg.wantsDeviation > 0) {
                problems.push({
                    category: 'Wants',
                    actual: avg.wantsPercent,
                    target: rule.wants,
                    deviation: avg.wantsDeviation,
                    amount: Math.round((avg.wantsDeviation/100) * avg.income),
                    type: 'over'
                });
            }
            
            if (avg.investDeviation < 0) {
                problems.push({
                    category: 'Invest',
                    actual: avg.investPercent,
                    target: rule.invest,
                    deviation: Math.abs(avg.investDeviation),
                    amount: Math.round((Math.abs(avg.investDeviation)/100) * avg.income),
                    type: 'under'
                });
            }
            
            if (problems.length > 0) {
                budgetText += `⚠️ **BUDGET ISSUES DETECTED**:\n`;
                problems.forEach(p => {
                    if (p.type === 'over') {
                        budgetText += `• ${p.category}: ${p.actual}% actual vs ${p.target}% target → **OVER by ${p.deviation}%** (₹${p.amount.toLocaleString()}/month)\n`;
                    } else {
                        budgetText += `• ${p.category}: ${p.actual}% actual vs ${p.target}% target → **UNDER by ${p.deviation}%** (₹${p.amount.toLocaleString()}/month gap)\n`;
                    }
                });
            } else {
                budgetText += `✓ **All categories within budget** - Great job!\n`;
            }
            
            // Show investment appreciation if above target
            if (avg.investDeviation > 0) {
                budgetText += `\n🎉 **Investment**: ${avg.investPercent}% actual vs ${rule.invest}% target → **EXCEEDING by ${avg.investDeviation}%** (₹${Math.round((avg.investDeviation/100) * avg.income).toLocaleString()}/month extra) - Excellent!\n`;
            }
        }
        
        // Build Year-over-Year comparison text
        let yoyText = '';
        if (data.yearOverYear && data.yearOverYear.hasData) {
            yoyText = data.yearOverYear.years.map(yearData => {
                let text = `**${yearData.label}**: Total spent ₹${yearData.totalSpent.toLocaleString()}\n`;
                
                // Top categories for that month
                if (yearData.topCategories && yearData.topCategories.length > 0) {
                    text += '  Top spending categories:\n';
                    yearData.topCategories.forEach(cat => {
                        text += `  • ${cat.category}: ₹${cat.total.toLocaleString()} (${cat.count} transactions)\n`;
                    });
                }
                
                // Notable high expenses
                if (yearData.expenses && yearData.expenses.length > 0) {
                    const highExpenses = yearData.expenses.filter(e => e.amount > 2000).slice(0, 5);
                    if (highExpenses.length > 0) {
                        text += '  Notable expenses:\n';
                        highExpenses.forEach(exp => {
                            text += `  • ${exp.title} (${exp.category}): ₹${Math.round(exp.amount).toLocaleString()}\n`;
                        });
                    }
                }
                
                return text;
            }).join('\n');
        } else {
            yoyText = 'No historical data available for this month from previous years.';
        }
        
        // Build Annual Patterns text
        let patternsText = '';
        if (data.annualPatterns && data.annualPatterns.hasPatterns) {
            const patterns = data.annualPatterns.patterns;
            if (patterns.length > 0) {
                patternsText = patterns.map(p => {
                    if (p.type === 'recurring_expense') {
                        return `• **RECURRING ANNUAL**: "${p.title}" (${p.category})\n  - Detected in ${p.yearsDetected} years\n  - Average amount: ₹${p.avgAmount.toLocaleString()}\n  - Confidence: ${p.confidence.toUpperCase()}\n  - ${p.description}`;
                    } else {
                        let text = `• **CATEGORY SPIKE**: ${p.category}\n  - Detected in ${p.yearsDetected} year(s)\n  - Average spend: ₹${p.avgSpend.toLocaleString()}\n  - Confidence: ${p.confidence.toUpperCase()}`;
                        if (p.topItems && p.topItems.length > 0) {
                            text += '\n  - Typical expenses:';
                            p.topItems.forEach(item => {
                                text += `\n    · ${item.title}: ~₹${item.avgAmount.toLocaleString()}`;
                            });
                        }
                        return text;
                    }
                }).join('\n\n');
            }
        } else {
            patternsText = 'No recurring annual patterns detected for this month (need more historical data).';
        }
        
        // Forward-looking data for target month
        const fc = data.targetMonthForecast || {};
        const inv = data.investments || {};
        const monthShort = monthName.split(' ')[0];

        // Top 5 spending areas with their leading items
        const topAreasText = data.topCategories.slice(0, 5).map(c => {
            const top = (c.topItems || []).slice(0, 2).map(i => `${i.title} ₹${Math.round(i.monthlyAvg).toLocaleString()}`).join(', ');
            return `• ${c.category}: ₹${Math.round(c.monthlyAvg).toLocaleString()}/mo${top ? ` (top: ${top})` : ''}`;
        }).join('\n');

        // Top 8 individual recurring expenses (already discretionary candidates)
        const topItemsText = data.topExpenses.slice(0, 8).map(e =>
            `• ${e.title} (${e.category}): ₹${Math.round(e.monthlyAvg).toLocaleString()}/mo`
        ).join('\n');

        // Investment trajectory
        const invTrendText = inv.targetComparisons && inv.targetComparisons.length > 0
            ? inv.targetComparisons.slice(-Math.min(6, inv.targetComparisons.length)).map(tc =>
                `${tc.month.split(' ')[0]}: ${tc.actualPercent}% (₹${Math.round(tc.actualAmount).toLocaleString()}) ${tc.missedTarget ? '❌ short ₹' + Math.round(tc.gapAmount).toLocaleString() : '✅'}`
            ).join(' | ')
            : 'No data';

        // Pre-render financial-health summary block.
        const fh = data.financialHealth || null;
        let fhText = '';
        if (fh) {
            const ef = fh.emergencyFund || {};
            const efBadge = ef.status === 'critical' ? '🚨 CRITICAL'
                : ef.status === 'low' ? '⚠ LOW'
                : '✅ HEALTHY';
            // Current EF balance MUST be stated explicitly. The TOP 3 ACTIONS
            // format asks for "current ₹X → target ₹Y"; without the current ₹
            // here the model fabricates "current 0" even when cash/flagged
            // investments cover it. liquid = cash balance + flagged EF holdings.
            const efTarget = Math.round((ef.targetMonths || 0) * (ef.monthlyEssentials || 0));
            const efComposition = `cash ₹${(ef.cashBalance || 0).toLocaleString()}${(ef.flaggedTotal || 0) > 0 ? ` + flagged investments ₹${ef.flaggedTotal.toLocaleString()}` : ''}`;
            fhText = `**Net Worth**: ₹${fh.netWorth.toLocaleString()}  (assets ₹${fh.assets.toLocaleString()} − liabilities ₹${fh.liabilities.toLocaleString()})
**Cash & Savings**: ₹${fh.cashSavings.toLocaleString()}
**Market Risk**: ₹${fh.riskAmount.toLocaleString()} (${fh.riskPercent}% of net worth)
**Emergency Fund**: current balance **₹${(ef.liquid || 0).toLocaleString()}** (${efComposition}) = ${ef.months}mo of ₹${ef.monthlyEssentials.toLocaleString()}/mo essentials → ${efBadge}${ef.shortfall > 0 ? ` — shortfall ₹${ef.shortfall.toLocaleString()} to reach ${ef.targetMonths}mo target (₹${efTarget.toLocaleString()})` : ` (target ${ef.targetMonths}mo = ₹${efTarget.toLocaleString()} already met ✓)`}`;
        } else {
            fhText = '_(financial health not computed)_';
        }

        // SIPs / moneyLent / card-bill obligations
        const sipsBlock = data.sips && data.sips.count > 0
            ? `**Active SIPs**: ${data.sips.count} totalling ₹${data.sips.total.toLocaleString()}/month\n${data.sips.items.map(s => `  • ${s.name}: ₹${s.amount.toLocaleString()}`).join('\n')}`
            : '_No active SIPs._';

        const lentBlock = data.moneyLent && data.moneyLent.count > 0
            ? `**Money Lent (receivable)**: ₹${data.moneyLent.total.toLocaleString()} across ${data.moneyLent.count} record${data.moneyLent.count === 1 ? '' : 's'}\n${data.moneyLent.items.map(r => `  • ${r.name}: ₹${r.outstanding.toLocaleString()}`).join('\n')}`
            : '_No outstanding money lent._';

        const unpaidBlock = data.unpaidCardBills && data.unpaidCardBills.count > 0
            ? `⚠ **Past-due card bills**: ₹${data.unpaidCardBills.total.toLocaleString()} across ${data.unpaidCardBills.count} bill${data.unpaidCardBills.count === 1 ? '' : 's'}\n${data.unpaidCardBills.items.map(b => `  • ${b.cardName}: ₹${b.amount.toLocaleString()} (due ${b.dueDate})`).join('\n')}`
            : '_No past-due card bills._';

        const upcomingBillsBlock = data.upcomingCardBills && data.upcomingCardBills.count > 0
            ? `${data.upcomingCardBills.count} bill${data.upcomingCardBills.count === 1 ? '' : 's'} totalling ₹${data.upcomingCardBills.total.toLocaleString()}\n${data.upcomingCardBills.items.map(b => `      - ${b.cardName}: ₹${b.amount.toLocaleString()} (due ${b.dueDate})`).join('\n')}`
            : '_None_';

        // Frequent vs occasional breakdown — the new projection methodology.
        const vsb = data.variableSpendBreakdown || {};
        const frequentText = (vsb.frequentItems && vsb.frequentItems.length > 0)
            ? vsb.frequentItems.map(it => {
                const trendChip = it.trend === 'rising' ? ' ↗ rising'
                    : it.trend === 'falling' ? ' ↘ falling'
                    : '';
                return `  • ${it.title} (${it.category}) — ₹${it.monthlyAvg.toLocaleString()}/mo across ${it.monthsSeen}/3 months${trendChip}`;
            }).join('\n')
            : '_None_';
        const occasionalText = (vsb.occasionalItems && vsb.occasionalItems.length > 0)
            ? vsb.occasionalItems.map(it => `  • ${it.title} (${it.category}): ₹${it.amount.toLocaleString()} in ${it.month}`).join('\n')
            : '_None_';

        return `You are a personal finance advisor analyzing data for **${monthName}** (the upcoming month). Provide insights grounded in the EXACT data below. Do not invent numbers.

═══════════════════════════════════════════════════════════════
## SECTION A: FINANCIAL HEALTH (current snapshot)

${fhText}

${sipsBlock}

${lentBlock}

═══════════════════════════════════════════════════════════════
## SECTION B: HISTORICAL CONTEXT (last ${analysisMonths} months)

**Avg Monthly Income**: ₹${Math.round(data.insights.avgMonthlyIncome || 0).toLocaleString()}
**Budget Rule**: ${data.budgetAnalysis?.targetRule?.needs || 50}% Needs / ${data.budgetAnalysis?.targetRule?.wants || 30}% Wants / ${data.budgetAnalysis?.targetRule?.invest || 20}% Invest

**"Other spend" projection for next month**: **₹${Math.round(vsb.projection || data.projectedAverage || 0).toLocaleString()}/mo** = frequent items ₹${(vsb.frequentProjection || 0).toLocaleString()} + one-off buffer ₹${(vsb.occasionalBuffer || 0).toLocaleString()} (${Math.round((vsb.occasionalWeight || 0) * 100)}% of last-3-mo avg one-off ₹${(vsb.occasionalAveragePerMonth || 0).toLocaleString()})

**Frequent items (≥2 of last 3 months)** — these reliably recur:
${frequentText}

**Notable one-offs (last 3 months)** — surface anomalies, won't be projected forward:
${occasionalText}

**Budget Health (${analysisMonths}-month average)**:
${budgetText || 'Within targets'}

**Top Spending Categories**:
${topAreasText || '(none)'}

**Top Individual Recurring Items**:
${topItemsText || '(none)'}

═══════════════════════════════════════════════════════════════
## SECTION C: ${monthName.toUpperCase()} FORECAST (forward-looking)

**Expected Income**: ₹${Math.round(fc.expectedIncome || 0).toLocaleString()}

**Already-Committed Outflows**:
  • Recurring payments: ₹${Math.round(fc.recurring?.total || 0).toLocaleString()} (${fc.recurring?.items?.length || 0} items)
${(fc.recurring?.items || []).slice(0, 5).map(r => `      - ${r.name}: ₹${Math.round(r.amount).toLocaleString()}`).join('\n')}
  • Loan / Card EMIs: ₹${Math.round(fc.emis?.total || 0).toLocaleString()} (${fc.emis?.items?.length || 0} items)
${(fc.emis?.items || []).slice(0, 5).map(e => `      - ${e.name}: ₹${Math.round(e.amount).toLocaleString()}`).join('\n')}
  • SIP commitments: ₹${Math.round(fc.sipsCommitment || 0).toLocaleString()}
  • Past-due card bills: ₹${Math.round(fc.unpaidBillsTotal || 0).toLocaleString()}
  • Card bills due in ${monthShort}: ₹${Math.round(fc.upcomingBillsTotal || 0).toLocaleString()}
${upcomingBillsBlock !== '_None_' ? upcomingBillsBlock : ''}
  • **Fixed total: ₹${Math.round(fc.fullFixed || 0).toLocaleString()}**

**Planned Items Due By ${monthShort}**: ${fc.targetPlans?.length > 0 ? `₹${Math.round(fc.targetPlansTotal || 0).toLocaleString()}` : 'None'}
${(fc.targetPlans || []).map(p => `  • ${p.name}: ₹${Math.round(p.amount).toLocaleString()} (by ${p.planByDate})`).join('\n')}

**Projected Variable Spend**: ₹${Math.round(fc.projectedVariable || 0).toLocaleString()} (based on ${analysisMonths}-month avg)
**Investment Target (${data.budgetAnalysis?.targetRule?.invest || 20}% of income)**: ₹${Math.round(fc.investmentTargetTotal || 0).toLocaleString()} total
  • Already covered by planned SIPs: ₹${Math.round(fc.sipsCommitment || 0).toLocaleString()}
  • **Top-up needed above SIPs**: ₹${Math.round(fc.investmentTargetGap || 0).toLocaleString()} ${(fc.investmentTargetGap || 0) === 0 ? '(SIPs already meet target ✓)' : ''}

**📊 Cash-Flow Summary for ${monthShort}**:
  Income (₹${Math.round(fc.expectedIncome || 0).toLocaleString()})
  − Fixed obligations incl. SIPs (₹${Math.round(fc.fullFixed || 0).toLocaleString()})
  − Variable est. (₹${Math.round(fc.projectedVariable || 0).toLocaleString()})
  − Plans due (₹${Math.round(fc.targetPlansTotal || 0).toLocaleString()})
  − Investment top-up above SIPs (₹${Math.round(fc.investmentTargetGap || 0).toLocaleString()})
  = **${fc.projectedSurplus >= 0 ? 'Surplus' : 'SHORTFALL'}: ₹${Math.round(Math.abs(fc.projectedSurplus || 0)).toLocaleString()}**${fc.isCashTight ? '  ⚠️ CASH TIGHT' : ''}

  Note: SIPs are deducted ONCE — inside "Fixed obligations incl. SIPs". The
  "top-up above SIPs" line is the *additional* ₹ that would need to be
  invested this month to hit the budget rule's invest %, beyond what your
  existing SIPs already cover. If SIPs already meet the target, this is ₹0.

═══════════════════════════════════════════════════════════════
## SECTION D: INVESTMENT HEALTH

  • **Planned SIP commitment** (auto-deducted in Settlement): ₹${(data.sips?.total || 0).toLocaleString()}/month across ${data.sips?.count || 0} SIP(s)
  • **Target** for ${monthShort}: ${inv.targetPercent || 20}% of income = ₹${Math.round(fc.investmentTargetTotal || 0).toLocaleString()}/month total
  • **${analysisMonths}-month REALIZED invested** (actual purchases, not SIP plan): ₹${Math.round(inv.monthlyAvg || 0).toLocaleString()}/month
  • Months hit target: ${inv.targetHits || 0} / ${inv.targetComparisons?.length || 0}
  • Miss rate: ${inv.missRate || 0}% — Severity: **${(inv.severity || 'unknown').toUpperCase()}**
  • Range: ₹${Math.round(inv.lowestMonth?.amount || 0).toLocaleString()} (${inv.lowestMonth?.month || '-'}) → ₹${Math.round(inv.highestMonth?.amount || 0).toLocaleString()} (${inv.highestMonth?.month || '-'})
  • Month-by-month: ${invTrendText}
  • **Plan-vs-realized gap**: planned ₹${(data.sips?.total || 0).toLocaleString()}/mo, ${analysisMonths}-mo realized avg ₹${Math.round(inv.monthlyAvg || 0).toLocaleString()}/mo — ${(data.sips?.total || 0) > Math.round(inv.monthlyAvg || 0) ? 'realized is BELOW plan (some SIPs may be paused or not getting executed)' : (data.sips?.total || 0) < Math.round(inv.monthlyAvg || 0) ? 'realized is ABOVE plan (good — extra discretionary investing on top of SIPs)' : 'realized matches plan'}

═══════════════════════════════════════════════════════════════
## SECTION E: LOANS, EMIs, & CARD BILLS

${data.loans.length > 0 ? `Active loans (${data.loans.length}, EMI ₹${Math.round(data.insights.totalLoans).toLocaleString()}/mo):\n${loansText}` : 'No active loans ✓'}

${data.emis.length > 0 ? `\nCard EMIs (${data.emis.length}, ₹${Math.round(data.insights.totalEmis).toLocaleString()}/mo):\n${emisText}` : ''}

${unpaidBlock}

═══════════════════════════════════════════════════════════════
## SECTION F: HISTORICAL PATTERNS FOR ${monthShort.toUpperCase()}

${data.annualPatterns?.hasPatterns ? `**Recurring annual patterns**:\n${patternsText}` : 'No recurring annual patterns detected.'}

${data.yearOverYear?.hasData ? `\n**Last year same month**:\n${yoyText.split('\n').slice(0, 3).join('\n')}` : ''}

═══════════════════════════════════════════════════════════════
## ${monthName.toUpperCase()} — UPCOMING MONTHS LOOKAHEAD

${(() => {
    const lk = data.upcomingMonthsOutlook;
    if (!lk || !lk.months?.length) return '_(no lookahead data)_';
    // sipsCommitment lives on the forecast object — not the build-prompt scope.
    // Earlier this referenced a bare `sipsCommitment` variable that only exists
    // in prepareExpenseAnalysisData, which threw a ReferenceError and bubbled
    // up as "Failed to get AI insights".
    const sipsTotal = Math.round(fc.sipsCommitment || 0);
    const rows = lk.months.map(m => {
        const arrow = m.deltaVsTarget > 0 ? `🔺 +₹${Math.abs(m.deltaVsTarget).toLocaleString()} heavier` : (m.deltaVsTarget < 0 ? `🔻 -₹${Math.abs(m.deltaVsTarget).toLocaleString()} lighter` : '— same');
        return `  • **${m.monthLabel}**: fixed ₹${m.fixed.toLocaleString()} (recurring ₹${m.recurringTotal.toLocaleString()} + EMIs ₹${m.emiTotal.toLocaleString()} + SIPs ₹${sipsTotal.toLocaleString()}${m.plansTotal > 0 ? ` + plans ₹${m.plansTotal.toLocaleString()}` : ''})  vs ${monthShort} ${arrow}`;
    }).join('\n');
    const heavy = lk.heaviestMonth
        ? `\n\n**Heaviest upcoming month**: ${lk.heaviestMonth.monthLabel} (+₹${Math.abs(lk.heaviestMonth.deltaVsTarget).toLocaleString()} vs ${monthShort}).`
        : '';
    const park = lk.parkForFuture > 0
        ? `\n\n**Total extra needed across the next 3 months**: ₹${lk.parkForFuture.toLocaleString()}. If ${monthShort} ends with a surplus, parking up to this amount avoids forcing borrowing/SIP-pause later.`
        : `\n\n**Next 3 months are equal or lighter** than ${monthShort}. No need to park surplus for upcoming obligations — direct it to emergency fund or investments instead.`;
    return rows + heavy + park;
})()}

═══════════════════════════════════════════════════════════════
## YOUR RESPONSE — STRICT FORMAT (mandatory)

You MUST output ALL SEVEN headers below in this exact order. If a header has
nothing notable, write a one-line "all good" status — do NOT skip the header.
Bullet points only — NO tables. Aim for 400–600 words total.

Write directly to the user. Do NOT mention "Section A", "Section B", or any
section letters in your response — the user is reading bullets, not a report
template. Cite specific item names and ₹ amounts instead of source labels.

**📊 ${monthShort.toUpperCase()} OUTLOOK**
2–3 bullets:
• Cash-flow status — surplus or shortfall in ₹ for ${monthShort}.
• Net-worth + emergency-fund status (one line; flag if EF is critical/low).
• Budget-split status (one line; flag if any category deviates from target).

**💸 EXPENSE PLAN — where ${monthShort} cash will go**
3–4 bullets:
• Already-committed total (fixed obligations) and % of income.
• Variable spend headroom remaining: ₹${Math.round((fc.expectedIncome || 0) - (fc.fullFixed || 0) - (fc.targetPlansTotal || 0) - (fc.investmentTargetGap || 0)).toLocaleString()}.
• Top 2–3 spending categories with their leading items.
• Plans due in ${monthShort} — cite item names + ₹ if any.

**📈 INVESTMENT PLAN**
3 bullets — must distinguish PLANNED (SIPs auto-deducted) from REALIZED
(actual purchases logged). The two are independent numbers — cite both:
• ${analysisMonths}-mo realized avg ₹${Math.round(inv.monthlyAvg || 0).toLocaleString()}/mo vs target ₹${Math.round(fc.investmentTargetTotal || 0).toLocaleString()}/mo (severity: "${inv.severity || 'unknown'}"). State the gap in ₹.
• Planned SIP commitment ₹${(data.sips?.total || 0).toLocaleString()}/mo (${data.sips?.count || 0} SIP${(data.sips?.count || 0) === 1 ? '' : 's'}). Does the plan alone clear the target? If not, what's the top-up?
• Emergency fund — if status is critical/low, EF top-up MUST come before any new SIP recommendation.

**💰 SURPLUS PLAN — what to do with the leftover ₹${Math.max(0, Math.round(fc.projectedSurplus || 0)).toLocaleString()}**
Required when there's a positive surplus this month. Pick ONE primary destination using this priority order:
${(() => {
    const lk = data.upcomingMonthsOutlook || {};
    const surplus = Math.max(0, Math.round(fc.projectedSurplus || 0));
    const ef = data.financialHealth?.emergencyFund || {};
    const efShortfall = Math.round(ef.shortfall || 0);
    const efStatus = ef.status || 'unknown';
    return `1. **PARK FOR UPCOMING HEAVY MONTHS** — if the lookahead shows any month heavier than ${monthShort} (parkForFuture = ₹${(lk.parkForFuture || 0).toLocaleString()}). Suggest moving up to that amount into a savings/sweep account so the heavy month doesn't force borrowing or pausing SIPs. Name the specific upcoming month and the ₹.
2. **TOP UP EMERGENCY FUND** — if EF status is "${efStatus}" and shortfall is ₹${efShortfall.toLocaleString()}. Suggest moving the smaller of (remaining surplus, EF shortfall) into the EF.
3. **EXTRA INVESTING** — only if (a) no heavy upcoming month and (b) EF is healthy. Suggest topping up the SIP target gap (₹${Math.round(fc.investmentTargetGap || 0).toLocaleString()}) or one-time MF/FD allocation.

You MUST split the ₹${surplus.toLocaleString()} surplus across these in priority order. Do not skip a higher priority to recommend a lower one.`;
})()}

**🏦 DEBT STATUS**
2–3 bullets:
• Loans: ${data.loans.length === 0 ? 'none' : `${data.loans.length} active, ₹${Math.round(data.insights.totalLoans).toLocaleString()}/mo`}. Flag any high-interest loan (personal >12%, home >9%) for prepayment if cash allows.
• Card EMIs: ${data.emis.length === 0 ? 'none' : `${data.emis.length} active, ₹${Math.round(data.insights.totalEmis).toLocaleString()}/mo`}.
• Past-due card bills — if any, this is the #1 priority before anything else.

**🔮 PREDICTIONS & RISKS**
2–3 bullets:
• Annual patterns (cite specific year + ₹ as evidence; e.g. "Mar 2024 spent ₹X on tax-saving").
• Risk factors: market exposure, upcoming-bill spike, EF shortfall.
• Cash-tight months ahead — name them by month label and the ₹ delta.

**🎯 TOP 3 ACTIONS** (highest impact first)
Each action MUST: (a) name a real item/category, (b) include the ₹ delta, (c) explain HOW (one specific behaviour) and WHY (which data point you're tying to — describe it, don't just label it).

1. **[Exact item / lever]** — current ₹X → target ₹Y (saves ₹Z/mo)
   → How: [one specific change]
   → Why: [evidence in plain English — e.g. "this category has been ₹X over budget for 3 of last 6 months"]

2. **[…]** — same shape

3. **[…]** — same shape

**Total potential improvement: ₹X/month**

═══════════════════════════════════════════════════════════════
## CRITICAL RULES

### Numeric discipline (read this BEFORE writing the response):
• **Every ₹ amount in your response must be copy-pasted verbatim from the data above.** No rounding, no estimating, no "approximately". If the data says ₹13,847 you write ₹13,847, not "~₹14k".
• **Do not multiply or sum numbers in your head.** Only use totals that are already computed for you (full fixed total, projected surplus, monthly avg, etc.). Never compute a new total like "12 × monthly = annual" — that's a guess.
• **Never confuse PLANNED with REALIZED.** Planned SIPs are the monthly auto-deduct commitment. Realized investments are actual purchases logged. They are independent numbers — do not substitute one for the other or add them together.
• **If a number is ₹0 in the data, treat it as zero — do not infer it must be "missing".** When the data says "_No active SIPs._", do not assume there are SIPs you can't see.
• **No tables. No code blocks. No long parenthetical math.** Keep each bullet to one line of plain English with one or two ₹ citations.
• **Do not manually bold ₹ amounts** — the app already highlights them. Bold percentages and labels instead. Put a blank line before each **header** so it renders cleanly.

### Recommendation rules:
• **Use ONLY numbers and item names from the data above.** No invented amounts, no generic advice.
• **NEVER suggest reducing**: rent, mortgage, utilities, health insurance, education, basic groceries, mandatory EMIs, SIPs into core goals.
• **DO suggest reducing**: food delivery, online shopping, lifestyle subscriptions, entertainment, dining out, impulse upgrades.
• **Emergency fund first**: if EF status is critical/low (<3 / <6 months), DO NOT recommend new long-term investments — recommend topping up the EF instead (after parking for heavier upcoming months, if any).
• **Past-due card bills first**: if there are past-due bills, the very first action must be clearing them (interest is typically 36–48% APR).
• **Loan flagging threshold**: personal >12%, home >9%, ≤3 months remaining = ending-soon redirect.
• **Every recommendation needs a ₹ amount AND a plain-English reason.**

### Surplus allocation rules:
• If a future month is heavier than ${monthShort}, recommend parking BEFORE recommending EF top-up or new investments. Otherwise the user is forced to scramble next month.
• If EF is critical/low, EF top-up beats new SIPs every time.
• Suggest "extra investing" only when nothing else needs the surplus — over-investing while EF is critical is a real risk.
• Never tell the user to "save more" without naming WHICH bucket and HOW MUCH.

### Self-check before submitting:
For each ₹ amount you wrote, ask: can a reader find this exact number in the data above? If not, delete the bullet and rewrite it with a number you CAN ground. Make sure no "Section A/B/C/..." text leaks into the output — write directly to the user.`;
    },
    
    /**
     * Get recurring expense items for a specific month
     */
    getRecurringExpenseItemsForMonth(year, month) {
        if (!window.RecurringExpenses) return [];
        
        const allRecurring = window.RecurringExpenses.getAll();
        const items = [];
        
        allRecurring.forEach(recurring => {
            if (!window.RecurringExpenses.isEffectivelyActive(recurring)) return;
            
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(year, month - 1, 1);
                if (checkDate > endDate) return;
            }
            
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, year, month);
            
            if (isDue) {
                const category = recurring.category || '';
                if (category !== 'Loan EMI' && category !== 'Credit Card EMI') {
                    // Determine due date for this month
                    const dayOfMonth = recurring.day || recurring.dayOfMonth || 1;
                    const dueDate = new Date(year, month - 1, dayOfMonth);
                    items.push({
                        name: recurring.name,
                        category: recurring.category,
                        amount: recurring.amount,
                        date: dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: dueDate.getTime()
                    });
                }
            }
        });
        
        // Sort by date ascending
        return items.sort((a, b) => a.sortDate - b.sortDate);
    },
    
    /**
     * Get EMI items for a specific month
     */
    getEmiItemsForMonth(year, month) {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const targetMonth = month - 1;
        const items = [];
        
        loans.forEach(loan => {
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const targetMonthStart = new Date(year, targetMonth, 1);
            
            if (firstEmiMonth > targetMonthStart) return;
            
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    // EMI due date is same day of month as first EMI
                    const emiDueDay = firstDate.getDate();
                    const emiDueDate = new Date(year, targetMonth, emiDueDay);
                    
                    // Format: BankName: LoanType
                    const loanTypeDisplay = loan.loanType === 'Other' && loan.customLoanType 
                        ? loan.customLoanType 
                        : (loan.loanType || 'Loan');
                    const displayName = `${loan.bankName}: ${loanTypeDisplay}`;
                    
                    items.push({
                        name: displayName,
                        category: 'Loan EMI',
                        amount: parseFloat(emiAmount),
                        date: emiDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: emiDueDate.getTime(),
                        // Additional fields for enhanced display
                        type: 'loan',
                        paidCount: remaining.emisPaid,
                        totalCount: loan.tenure,
                        description: loan.reason || null,
                        progress: Math.round((remaining.emisPaid / loan.tenure) * 100)
                    });
                }
            }
        });
        
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    // Auto-update EMI progress
                    if (window.Cards && window.Cards.updateEMIProgress) {
                        window.Cards.updateEMIProgress(emi);
                    }
                    
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const targetMonthStart = new Date(year, targetMonth, 1);
                        
                        if (emiFirstMonth > targetMonthStart) return;
                    }
                    
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        // Card EMI due date - use first EMI date's day or default to card bill due date
                        const emiFirstDate = emi.firstEmiDate ? new Date(emi.firstEmiDate) : null;
                        const emiDueDay = emiFirstDate ? emiFirstDate.getDate() : (card.billDueDate || 1);
                        const emiDueDate = new Date(year, targetMonth, emiDueDay);
                        
                        // Format: CardName: EMI Reason
                        const displayName = `${card.nickname || card.name}: ${emi.reason || 'EMI'}`;
                        
                        items.push({
                            name: displayName,
                            category: 'Card EMI',
                            amount: parseFloat(emi.emiAmount),
                            date: emiDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                            sortDate: emiDueDate.getTime(),
                            // Additional fields for enhanced display
                            type: 'card',
                            paidCount: paidCount,
                            totalCount: totalCount,
                            description: emi.description || null,
                            progress: Math.round((paidCount / totalCount) * 100)
                        });
                    }
                });
            }
        });
        
        // Sort by date ascending
        return items.sort((a, b) => a.sortDate - b.sortDate);
    },
    
    /**
     * Get regular expense items for a specific month
     */
    getRegularExpenseItemsForMonth(year, month) {
        const expenses = window.DB.expenses || [];
        const items = [];
        
        expenses.forEach(expense => {
            // Use budget month if available
            const { month: expenseMonth, year: expenseYear } = this.getExpenseBudgetMonth(expense);
            
            if (expenseYear === year && expenseMonth === month) {
                // Use the same filtering logic as other regular expense functions
                if (this.isRegularExpense(expense)) {
                    const expDate = new Date(expense.date);
                    items.push({
                        name: expense.title || expense.description || 'Expense',
                        category: expense.category,
                        amount: parseFloat(expense.amount) || 0,
                        date: expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        sortDate: expDate.getTime()
                    });
                }
            }
        });
        
        // Sort by date ascending
        return items.sort((a, b) => a.sortDate - b.sortDate);
    },
    
    /**
     * Check if an expense is a regular expense (not EMI, not recurring)
     * Reuses Expenses module's isAutoRecurringExpense for consistency
     */
    isRegularExpense(expense) {
        return !window.Expenses.isAutoRecurringExpense(expense);
    },
    
    /**
     * Get budget month/year for an expense
     * Uses budgetMonth/budgetYear if set, otherwise falls back to expense date
     */
    getExpenseBudgetMonth(expense) {
        if (expense.budgetMonth && expense.budgetYear) {
            return { month: expense.budgetMonth, year: expense.budgetYear };
        }
        const expenseDate = new Date(expense.date);
        return {
            month: expenseDate.getMonth() + 1,
            year: expenseDate.getFullYear()
        };
    },
    
    /**
     * Get regular expenses for current month (excluding EMI, loans, recurring categories)
     */
    getRegularExpenses() {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        // Get only regular expenses (non-recurring, non-EMI) for current month
        let regularTotal = 0;
        expenses.forEach(expense => {
            // Use budget month if available, otherwise fall back to expense date
            const { month: expenseMonth, year: expenseYear } = this.getExpenseBudgetMonth(expense);
            
            // Only count expenses in current month that are regular expenses
            if (expenseYear === currentYear && expenseMonth === currentMonth) {
                if (this.isRegularExpense(expense)) {
                    regularTotal += parseFloat(expense.amount) || 0;
                }
            }
        });
        
        return regularTotal;
    },
    
    /**
     * Get projected "other spend" for the next month.
     *
     * Algorithm: look at last 3 complete months of regular expenses (those
     * already excluded from recurring + EMIs). Group expenses by normalized
     * title (case- and whitespace-insensitive). An item is "frequent" if it
     * appeared in ≥2 of the last 3 months. Project = sum-of-amounts / 3
     * for every frequent item. Single-month items are flagged "occasional"
     * and excluded from the projection (we don't expect them again).
     *
     * Why this beats a flat 6-month average:
     *   - new spend habits (baby products, new gym) get caught after 2 months
     *     instead of being diluted across the full 6
     *   - one-off ₹15k flights / hospital bills don't bloat the projection
     *   - real recurring patterns naturally emerge by frequency
     */
    getProjectedRegularExpenses() {
        return this.getFrequentVariableSpend().projection;
    },

    /**
     * Compute "frequent vs occasional" breakdown for the last 3 months.
     * Returns:
     *   {
     *     projection,                    // ₹/mo to budget for next month
     *     frequentItems: [{title, category, monthsSeen, totalAmount, monthlyAvg, trend}],
     *     occasionalItems: [{title, category, amount, month}],
     *     monthlyData: [{ year, month, label, amount }],
     *     monthsAnalyzed,
     *   }
     *
     * @param {object} [opts]
     * @param {number} [opts.minMonthsSeen=2] threshold for "frequent"
     * @param {number} [opts.lookback=3]      months to scan back
     */
    getFrequentVariableSpend({ minMonthsSeen = 2, lookback = 3 } = {}) {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        // Build the list of (year, month) windows we're scanning.
        const windows = [];
        for (let i = 1; i <= lookback; i++) {
            let m = currentMonth - i;
            let y = currentYear;
            if (m <= 0) { m += 12; y -= 1; }
            windows.push({ year: y, month: m });
        }

        // Normalize a free-text title for grouping (case + whitespace).
        const norm = (t) => (t || 'Untitled').trim().toLowerCase().replace(/\s+/g, ' ');

        // Bucket by normalized title; keep monthly totals so we can both
        // count distinct months seen AND compute the per-month projection.
        // Shape: bucket[normTitle] = {
        //   displayTitle, category, byMonth: { 'YYYY-MM': totalForMonth }
        // }
        const buckets = new Map();
        const monthlyTotals = new Map();  // 'YYYY-MM' → total regular spend

        expenses.forEach(exp => {
            const { month, year } = this.getExpenseBudgetMonth(exp);
            const key = `${year}-${String(month).padStart(2, '0')}`;
            const inWindow = windows.some(w => w.year === year && w.month === month);
            if (!inWindow) return;
            if (!this.isRegularExpense(exp)) return;

            const amount = parseFloat(exp.amount) || 0;
            if (amount <= 0) return;

            const titleNorm = norm(exp.title);
            if (!buckets.has(titleNorm)) {
                buckets.set(titleNorm, {
                    displayTitle: (exp.title || 'Untitled').trim(),
                    category: exp.category || 'Other',
                    byMonth: new Map(),
                });
            }
            const b = buckets.get(titleNorm);
            b.byMonth.set(key, (b.byMonth.get(key) || 0) + amount);

            monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + amount);
        });

        const frequentItems = [];
        const occasionalItems = [];

        buckets.forEach((b) => {
            const monthsSeen = b.byMonth.size;
            const totalAmount = Array.from(b.byMonth.values()).reduce((s, v) => s + v, 0);
            const monthlyAvg = totalAmount / lookback;  // sum ÷ 3 (treat missing months as 0)

            if (monthsSeen >= minMonthsSeen) {
                // Trend signal: compare oldest-month value to newest-month value
                // among the months this item appeared in. Used by AI advisory only.
                const sortedKeys = Array.from(b.byMonth.keys()).sort();
                const first = b.byMonth.get(sortedKeys[0]);
                const last = b.byMonth.get(sortedKeys[sortedKeys.length - 1]);
                let trend = 'flat';
                if (sortedKeys.length >= 2) {
                    if (last > first * 1.25) trend = 'rising';
                    else if (last < first * 0.75) trend = 'falling';
                }

                frequentItems.push({
                    title: b.displayTitle,
                    category: b.category,
                    monthsSeen,
                    totalAmount: Math.round(totalAmount),
                    monthlyAvg: Math.round(monthlyAvg),
                    trend,
                });
            } else {
                // Single-month item — list it as occasional with the month it
                // appeared in for AI advisory.
                const onlyKey = Array.from(b.byMonth.keys())[0];
                occasionalItems.push({
                    title: b.displayTitle,
                    category: b.category,
                    amount: Math.round(b.byMonth.get(onlyKey)),
                    month: onlyKey,
                });
            }
        });

        // Sort by amount descending so the prompt + UI lead with the biggest items.
        frequentItems.sort((a, b) => b.monthlyAvg - a.monthlyAvg);
        occasionalItems.sort((a, b) => b.amount - a.amount);

        // Frequent items contribute their full per-month average.
        const frequentProjection = frequentItems.reduce((s, item) => s + item.monthlyAvg, 0);

        // Occasional items: a flat 0-weight would underestimate (people DO
        // have one-offs every month, just not the same ones). A flat 1.0
        // weight would over-budget. We use 0.5 — half the average occasional
        // pool gets carried into the projection as a "surge buffer".
        const OCCASIONAL_WEIGHT = 0.5;
        const occasionalTotal = occasionalItems.reduce((s, item) => s + item.amount, 0);
        const occasionalAveragePerMonth = occasionalTotal / lookback;
        const occasionalBuffer = OCCASIONAL_WEIGHT * occasionalAveragePerMonth;

        const projection = Math.round(frequentProjection + occasionalBuffer);

        // Per-month roll-up so the existing modal projection-detail view still
        // has data to show ("last 3 months totals").
        const monthlyData = windows
            .map(w => {
                const key = `${w.year}-${String(w.month).padStart(2, '0')}`;
                const amount = Math.round(monthlyTotals.get(key) || 0);
                if (amount === 0) return null;
                const monthDate = new Date(w.year, w.month - 1, 1);
                return {
                    year: w.year,
                    month: w.month,
                    label: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                    amount,
                };
            })
            .filter(Boolean)
            .sort((a, b) => (a.year - b.year) || (a.month - b.month));

        return {
            projection,
            frequentProjection: Math.round(frequentProjection),
            occasionalBuffer: Math.round(occasionalBuffer),
            occasionalTotal: Math.round(occasionalTotal),
            occasionalAveragePerMonth: Math.round(occasionalAveragePerMonth),
            occasionalWeight: OCCASIONAL_WEIGHT,
            frequentItems,
            occasionalItems,
            monthlyData,
            monthsAnalyzed: windows.length,
        };
    },
    
    /**
     * Projected "other spend" for the next month, with breakdown.
     *
     * Backwards-compatible shape (keeps `average` + `monthlyData` for old
     * callers) but the projection number is now produced by
     * `getFrequentVariableSpend` — frequent items + 0.5 × occasional buffer
     * over a 3-month window. The numMonths arg is ignored for the projection
     * itself (we use 3 always — newer trends matter more) but still controls
     * how many months of historical totals the breakdown view shows.
     *
     * @param {number} numMonths - months of history to include in monthlyData
     */
    getProjectedRegularExpensesWithDetails(numMonths = 3) {
        const detail = this.getFrequentVariableSpend({ lookback: 3 });

        // For modal/breakdown views asking for more than 3 months of history,
        // backfill the older months from the raw expenses (frequency analysis
        // still uses 3 months — only the displayed history extends).
        let monthlyData = detail.monthlyData;
        if (numMonths > 3) {
            const expenses = window.DB.expenses || [];
            const today = new Date();
            const extra = [];
            for (let i = 4; i <= numMonths; i++) {
                let m = today.getMonth() + 1 - i;
                let y = today.getFullYear();
                while (m <= 0) { m += 12; y -= 1; }
                let total = 0;
                expenses.forEach(exp => {
                    const { month, year } = this.getExpenseBudgetMonth(exp);
                    if (year === y && month === m && this.isRegularExpense(exp)) {
                        total += parseFloat(exp.amount) || 0;
                    }
                });
                if (total > 0) {
                    const d = new Date(y, m - 1, 1);
                    extra.push({
                        year: y, month: m,
                        label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                        amount: Math.round(total),
                    });
                }
            }
            monthlyData = [...extra.reverse(), ...detail.monthlyData];
        }

        return {
            average: detail.projection,        // legacy field name → new projection
            projection: detail.projection,
            frequentProjection: detail.frequentProjection,
            occasionalBuffer: detail.occasionalBuffer,
            occasionalTotal: detail.occasionalTotal,
            occasionalAveragePerMonth: detail.occasionalAveragePerMonth,
            occasionalWeight: detail.occasionalWeight,
            frequentItems: detail.frequentItems,
            occasionalItems: detail.occasionalItems,
            monthlyData,
            monthCount: monthlyData.length,
            totalSum: monthlyData.reduce((s, m) => s + m.amount, 0),
        };
    },
    
    /**
     * Get recurring expense items for current month (excluding Loan EMI and Credit Card EMI)
     */
    getRecurringExpenseItems() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        if (!window.RecurringExpenses) {
            return [];
        }
        
        const allRecurring = window.RecurringExpenses.getAll();
        const items = [];
        
        allRecurring.forEach(recurring => {
            // Skip inactive or suspended
            if (!window.RecurringExpenses.isEffectivelyActive(recurring)) {
                return;
            }
            
            // Skip if end date is before this month
            if (recurring.endDate) {
                const endDate = new Date(recurring.endDate);
                const checkDate = new Date(currentYear, currentMonth - 1, 1);
                if (checkDate > endDate) {
                    return;
                }
            }
            
            // Check if due in this month
            const isDue = window.RecurringExpenses.isDueInMonth(recurring, currentYear, currentMonth);
            
            if (isDue) {
                const category = recurring.category || '';
                // Exclude Loan EMI and Credit Card EMI
                if (category !== 'Loan EMI' && category !== 'Credit Card EMI') {
                    items.push({
                        title: recurring.title || recurring.name || 'Recurring',
                        category: category || 'Other',
                        amount: parseFloat(recurring.amount) || 0,
                        date: `Day ${recurring.day || recurring.dayOfMonth || '-'}`
                    });
                }
            }
        });
        
        return items.sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Get EMI items for current month (loans + credit cards)
     */
    getEmiItems() {
        const loans = window.DB.loans || [];
        const cards = window.DB.cards || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11
        const items = [];
        
        // Add active loan EMIs
        loans.forEach(loan => {
            // Check if loan has started before or during this month
            const firstDate = new Date(loan.firstEmiDate);
            const firstEmiMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
            const currentMonthStart = new Date(currentYear, currentMonth, 1);
            
            if (firstEmiMonth > currentMonthStart) {
                return;
            }
            
            if (window.Loans) {
                const remaining = window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure);
                
                let emiAmount = loan.emi;
                if (!emiAmount && loan.amount && loan.interestRate && loan.tenure) {
                    emiAmount = window.Loans.calculateEMI(loan.amount, loan.interestRate, loan.tenure);
                }
                
                if (remaining.emisRemaining > 0 && emiAmount) {
                    const emiDay = firstDate.getDate();
                    
                    // Format: BankName: LoanType
                    const loanTypeDisplay = loan.loanType === 'Other' && loan.customLoanType 
                        ? loan.customLoanType 
                        : (loan.loanType || 'Loan');
                    const displayName = `${loan.bankName}: ${loanTypeDisplay}`;
                    
                    items.push({
                        title: displayName,
                        category: 'Loan EMI',
                        amount: parseFloat(emiAmount),
                        date: `Day ${emiDay}`,
                        type: 'loan',
                        paidCount: remaining.emisPaid,
                        totalCount: loan.tenure,
                        description: loan.reason || null,
                        progress: Math.round((remaining.emisPaid / loan.tenure) * 100)
                    });
                }
            }
        });
        
        // Add active credit card EMIs
        cards.forEach(card => {
            if (card.cardType === 'debit') return;
            
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    // Auto-update EMI progress
                    if (window.Cards && window.Cards.updateEMIProgress) {
                        window.Cards.updateEMIProgress(emi);
                    }
                    
                    if (emi.firstEmiDate) {
                        const emiFirstDate = new Date(emi.firstEmiDate);
                        const emiFirstMonth = new Date(emiFirstDate.getFullYear(), emiFirstDate.getMonth(), 1);
                        const currentMonthStart = new Date(currentYear, currentMonth, 1);
                        
                        if (emiFirstMonth > currentMonthStart) {
                            return;
                        }
                    }
                    
                    const paidCount = emi.paidCount || 0;
                    const totalCount = emi.totalCount || emi.totalEmis || 0;
                    const remaining = totalCount - paidCount;
                    
                    if (!emi.completed && remaining > 0 && emi.emiAmount) {
                        // Format: CardName: EMI Reason
                        const displayName = `${card.nickname || card.name}: ${emi.reason || 'EMI'}`;
                        
                        items.push({
                            title: displayName,
                            category: 'Credit Card EMI',
                            amount: parseFloat(emi.emiAmount),
                            date: `${paidCount}/${totalCount} paid`,
                            type: 'card',
                            paidCount: paidCount,
                            totalCount: totalCount,
                            description: emi.description || null,
                            progress: Math.round((paidCount / totalCount) * 100)
                        });
                    }
                });
            }
        });
        
        return items.sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Get regular expense items for current month (excluding EMI category)
     */
    getRegularExpenseItems() {
        const expenses = window.DB.expenses || [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        return expenses
            .filter(expense => {
                const expenseDate = new Date(expense.date);
                const expenseYear = expenseDate.getFullYear();
                const expenseMonth = expenseDate.getMonth() + 1;
                
                if (expenseYear !== currentYear || expenseMonth !== currentMonth) {
                    return false;
                }
                
                const category = (expense.category || '').toLowerCase();
                // Exclude EMI category
                return category !== 'emi' && category !== 'recurring';
            })
            .map(expense => ({
                title: expense.title,
                category: expense.category || 'Other',
                amount: parseFloat(expense.amount) || 0,
                date: new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            }))
            .sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Show current month breakdown list
     */
    showCurrentMonthList(type) {
        let items = [];
        let title = '';
        let color = '';
        let total = 0;
        
        if (type === 'recurring') {
            items = this.getRecurringExpenseItems();
            title = '🔄 Recurring';
            color = 'purple';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'emis') {
            items = this.getEmiItems();
            title = '🏦 Loans & EMIs';
            color = 'blue';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        } else if (type === 'regular') {
            items = this.getRegularExpenseItems();
            title = '💵 Other spend';
            color = 'emerald';
            total = items.reduce((sum, i) => sum + i.amount, 0);
        }
        
        // Create or update modal
        let modal = document.getElementById('current-month-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'current-month-modal';
            document.body.appendChild(modal);
        }
        
        const today = new Date();
        const monthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
        
        // Check if this is EMI list
        const isEmiList = type === 'emis';
        
        const itemsHtml = items.length > 0 
            ? items.map(item => {
                // Enhanced display for EMI items
                if (isEmiList && item.paidCount !== undefined && item.totalCount !== undefined) {
                    const progressColor = item.type === 'loan' ? 'blue' : 'purple';
                    return `
                        <div class="py-3 border-b border-gray-100 last:border-0">
                            <!-- Title and Amount -->
                            <div class="flex justify-between items-start mb-2">
                                <div class="font-semibold text-gray-800 text-sm truncate flex-1 mr-2">${Utils.escapeHtml(item.title)}</div>
                                <div class="text-sm font-bold text-${progressColor}-600 flex-shrink-0">₹${Utils.formatIndianNumber(item.amount)}</div>
                            </div>
                            
                            <!-- Progress Bar -->
                            <div class="mb-2">
                                <div class="flex justify-between items-center text-xs text-gray-600 mb-1">
                                    <span class="font-medium">${item.paidCount}/${item.totalCount} EMIs paid</span>
                                    <span>${item.progress}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-1.5">
                                    <div class="bg-${progressColor}-500 h-1.5 rounded-full transition-all" style="width: ${item.progress}%"></div>
                                </div>
                            </div>
                            
                            <!-- Date and Description -->
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                                <span>📅 ${item.date}</span>
                                ${item.description ? `<span>•</span><span class="italic truncate">${Utils.escapeHtml(item.description)}</span>` : ''}
                            </div>
                        </div>
                    `;
                }
                
                // Default display for non-EMI items
                return `
                    <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800 truncate">${Utils.escapeHtml(item.title)}</p>
                            <p class="text-xs text-gray-500">${item.category} • ${item.date}</p>
                        </div>
                        <span class="text-sm font-semibold text-gray-700 ml-2">₹${Utils.formatIndianNumber(item.amount)}</span>
                    </div>
                `;
            }).join('')
            : `<p class="text-center text-gray-500 py-4">No items for this month</p>`;
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-t-2xl">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-white">${title}</h3>
                            <p class="text-xs text-white/80">${monthLabel}</p>
                        </div>
                        <button onclick="document.getElementById('current-month-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    ${itemsHtml}
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">Total (${items.length} items)</span>
                        <span class="text-lg font-bold text-${color}-600">₹${Utils.formatIndianNumber(Math.round(total))}</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    /**
     * Format amount for display (no longer needed, using Utils.formatIndianNumber)
     */
    formatAmount(amount) {
        return Utils.formatIndianNumber(amount);
    },
    
    /**
     * Show tooltip on info button
     */
    showTooltip(event, text) {
        event.stopPropagation();
        
        // Remove any existing tooltips
        const existing = document.getElementById('dashboard-tooltip');
        if (existing) existing.remove();
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'dashboard-tooltip';
        tooltip.className = 'fixed bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[10001] max-w-[200px]';
        tooltip.textContent = text;
        
        // Position tooltip to the left of the button to avoid overflow
        const buttonRect = event.target.getBoundingClientRect();
        tooltip.style.top = buttonRect.top + 'px';
        tooltip.style.right = (window.innerWidth - buttonRect.left + 5) + 'px';
        
        document.body.appendChild(tooltip);
        
        // Remove on click anywhere
        setTimeout(() => {
            document.addEventListener('click', () => {
                const tt = document.getElementById('dashboard-tooltip');
                if (tt) tt.remove();
            }, { once: true });
        }, 100);
    },
    
    /**
     * Get formatted month string
     */
    getFormattedMonth(monthValue) {
        const [year, month] = monthValue.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    },
    
    /**
     * Open month picker (not implemented - using browser's month input)
     */
    openMonthPicker(type) {
        // For now, just focus on the hidden month input
        const input = document.getElementById('category-month-selector');
        if (input && input.showPicker) {
            input.showPicker();
        }
    },
    
    /**
     * Update category month button text
     */
    updateCategoryButton() {
        const selector = document.getElementById('category-month-selector');
        const button = document.getElementById('category-month-button');
        if (selector && button) {
            button.innerHTML = this.getFormattedMonth(selector.value) + ' ▼';
        }
    },
    
    /**
     * Get months count based on selected range
     */
    getMonthsCount() {
        if (!this.selectedMonthRange) {
            return 6; // Default to last 6 months
        }
        
        const [startYear, startMonth] = this.selectedMonthRange.start.split('-').map(Number);
        const [endYear, endMonth] = this.selectedMonthRange.end.split('-').map(Number);
        
        const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        return Math.max(1, Math.min(12, months));
    },
    
    /**
     * Get month range label
     */
    getMonthRangeLabel() {
        if (!this.selectedMonthRange) {
            return 'Last 6 months';
        }
        
        const start = this.getFormattedMonth(this.selectedMonthRange.start);
        const end = this.getFormattedMonth(this.selectedMonthRange.end);
        return `${start} - ${end}`;
    },
    
    /**
     * Open month range modal
     */
    openMonthRangeModal() {
        const modal = document.getElementById('month-range-modal');
        if (modal) {
            // Set default values
            const now = new Date();
            const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (this.selectedMonthRange) {
                document.getElementById('month-range-start').value = this.selectedMonthRange.start;
                document.getElementById('month-range-end').value = this.selectedMonthRange.end;
            } else {
                document.getElementById('month-range-start').value = startMonth;
                document.getElementById('month-range-end').value = endMonth;
            }
            
            modal.classList.remove('hidden');
        }
    },
    
    /**
     * Close month range modal
     */
    closeMonthRangeModal() {
        const modal = document.getElementById('month-range-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Apply month range selection
     */
    applyMonthRange() {
        const start = document.getElementById('month-range-start').value;
        const end = document.getElementById('month-range-end').value;
        
        if (!start || !end) {
            alert('Please select both start and end months');
            return;
        }
        
        const [startYear, startMonth] = start.split('-').map(Number);
        const [endYear, endMonth] = end.split('-').map(Number);
        
        if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
            alert('Start month must be before or equal to end month');
            return;
        }
        
        const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
        if (months > 12) {
            alert('Maximum range is 12 months');
            return;
        }
        
        this.selectedMonthRange = { start, end };
        this.closeMonthRangeModal();
        
        // Update label
        const label = document.getElementById('month-range-label');
        if (label) {
            label.textContent = this.getMonthRangeLabel();
        }
        
        // Re-render charts
        this.renderIncomeExpenseChart();
    },
    
    /**
     * Reset to default month range
     */
    resetMonthRange() {
        this.selectedMonthRange = null;
        this.closeMonthRangeModal();
        
        // Update label
        const label = document.getElementById('month-range-label');
        if (label) {
            label.textContent = 'Last 6 months';
        }
        
        // Re-render charts
        this.renderIncomeExpenseChart();
    },
    
    /**
     * Get current filter month value (YYYY-MM format)
     */
    getFilterMonthValue() {
        if (this.selectedFilterMonth) {
            return this.selectedFilterMonth;
        }
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    
    /**
     * Get formatted month for display
     */
    getFormattedFilterMonth(value) {
        if (!value) return 'Select Month';
        const [year, month] = value.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    },
    
    /**
     * Update filter month and re-render
     */
    updateFilterMonthButton() {
        const input = document.getElementById('filter-month-selector');
        if (input) {
            this.selectedFilterMonth = input.value;
            this.render();
        }
    },
    
    /**
     * Get total expenses for selected filter month
     * Uses budget month if available, falls back to expense date
     */
    getMonthExpenses(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                return expYear === year && expMonth === month;
            })
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    },
    
    /**
     * Get expense items for a month
     * Uses budget month if available, falls back to expense date
     */
    getMonthExpenseItems(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const expenses = window.DB.expenses || [];
        
        return expenses
            .filter(exp => {
                const { month: expMonth, year: expYear } = this.getExpenseBudgetMonth(exp);
                return expYear === year && expMonth === month;
            })
            .map(exp => ({
                title: exp.title,
                category: exp.category || 'Other',
                amount: parseFloat(exp.amount) || 0,
                date: new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sortDate: new Date(exp.date).getTime()
            }))
            .sort((a, b) => a.sortDate - b.sortDate); // Sort by date ascending
    },
    
    /**
     * Get total monthly investments for selected filter month
     * Uses incomeMonth/incomeYear if available, falls back to investment date
     */
    getMonthInvestments(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const goldRate = (window.Investments && window.Investments.getGoldRate) ? window.Investments.getGoldRate() : (typeof window.DB.goldRatePerGram === 'number' ? window.DB.goldRatePerGram : (window.DB.goldRatePerGram?.rate || 10000));
        
        return monthlyInvestments
            .filter(inv => {
                // Use incomeMonth/incomeYear if available, otherwise fall back to investment date
                if (inv.incomeMonth && inv.incomeYear) {
                    return inv.incomeYear === year && inv.incomeMonth === month;
                }
                // Fallback: use investment date (backward compatibility)
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && (invDate.getMonth() + 1) === month;
            })
            .reduce((sum, inv) => {
                if (inv.type === 'SHARES') {
                    const exchangeRate = (window.Investments && window.Investments.getExchangeRate) ? window.Investments.getExchangeRate() : (typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : (window.DB.exchangeRate?.rate || 89));
                    return sum + (inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1));
                } else if (inv.type === 'MF') {
                    // MFs are INR-only.
                    return sum + (inv.price * inv.quantity);
                } else if (inv.type === 'GOLD') {
                    return sum + (inv.price * inv.quantity);
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    return sum + (inv.amount || 0);
                }
                return sum;
            }, 0);
    },
    
    /**
     * Get investment items for a month
     * Uses incomeMonth/incomeYear if available, falls back to investment date
     */
    getMonthInvestmentItems(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        const monthlyInvestments = window.DB.monthlyInvestments || [];
        const exchangeRate = (window.Investments && window.Investments.getExchangeRate) ? window.Investments.getExchangeRate() : (typeof window.DB.exchangeRate === 'number' ? window.DB.exchangeRate : (window.DB.exchangeRate?.rate || 89));
        
        return monthlyInvestments
            .filter(inv => {
                // Use incomeMonth/incomeYear if available, otherwise fall back to investment date
                if (inv.incomeMonth && inv.incomeYear) {
                    return inv.incomeYear === year && inv.incomeMonth === month;
                }
                // Fallback: use investment date (backward compatibility)
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === year && (invDate.getMonth() + 1) === month;
            })
            .map(inv => {
                let amount = 0;
                let title = inv.name || inv.type;

                if (inv.type === 'SHARES') {
                    amount = inv.price * inv.quantity * (inv.currency === 'USD' ? exchangeRate : 1);
                    title = inv.name || 'Shares';
                } else if (inv.type === 'MF') {
                    amount = inv.price * inv.quantity;
                    title = inv.name || 'Mutual Fund';
                } else if (inv.type === 'GOLD') {
                    amount = inv.price * inv.quantity;
                    title = inv.name || 'Gold';
                } else if (inv.type === 'EPF' || inv.type === 'FD') {
                    amount = inv.amount || 0;
                    title = inv.name || inv.type;
                }
                
                return {
                    title: title,
                    category: inv.type,
                    amount: amount,
                    date: new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                };
            })
            .sort((a, b) => b.amount - a.amount);
    },
    
    /**
     * Get net pay for selected filter month
     */
    getMonthNetPay(monthValue) {
        const [year, month] = monthValue.split('-').map(Number);
        
        // Use Income module's functions to calculate payslips
        const incomeData = window.DB.income || {};
        const ctc = incomeData.ctc || 0;
        
        if (!ctc || ctc === 0) return 0;
        
        // Get all income parameters
        const bonusPercent = incomeData.bonusPercent || 0;
        const esppPercentCycle1 = incomeData.esppPercentCycle1 || 0;
        const esppPercentCycle2 = incomeData.esppPercentCycle2 || 0;
        const pfPercent = incomeData.pfPercent || 12;
        
        // Generate all monthly payslips using Income module
        const yearlyPayslips = Income.generateYearlyPayslips(
            ctc, 
            bonusPercent, 
            esppPercentCycle1, 
            esppPercentCycle2, 
            pfPercent
        );
        
        // Find payslip for the requested month
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthName = monthNames[month - 1];
        
        const payslip = yearlyPayslips.find(p => p.month === monthName);
        
        // Return totalNetPay which includes salary + bonus - insurance
        return payslip ? (payslip.totalNetPay || payslip.netPay || 0) : 0;
    },
    
    /**
     * Get income for expense comparison based on pay schedule
     * Includes salary + additional income (bonus, freelance, etc.)
     * @param {number} expenseYear - Year of expenses
     * @param {number} expenseMonth - Month of expenses (1-12)
     * @returns {Object} { income: number|null, month: number, year: number, monthName: string, salary: number, additionalIncome: number }
     */
    getIncomeForExpenseComparison(expenseYear, expenseMonth) {
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        
        let incomeMonth, incomeYear;
        
        if (paySchedule === 'last_week') {
            // Use previous month's income (Dec salary -> Jan expenses)
            incomeMonth = expenseMonth === 1 ? 12 : expenseMonth - 1;
            incomeYear = expenseMonth === 1 ? expenseYear - 1 : expenseYear;
        } else {
            // Use same month's income
            incomeMonth = expenseMonth;
            incomeYear = expenseYear;
        }
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[incomeMonth - 1];
        
        // Get additional income for the month
        const additionalIncomeTotal = window.Income ? 
            window.Income.getAdditionalIncomeTotalForMonth(incomeMonth, incomeYear) : 0;
        
        // Try to find actual salary first
        const salaries = window.DB.salaries || [];
        const actualSalary = salaries.find(s => s.year === incomeYear && s.month === incomeMonth);
        
        if (actualSalary) {
            const totalIncome = actualSalary.amount + additionalIncomeTotal;
            return { 
                income: totalIncome, 
                salary: actualSalary.amount,
                additionalIncome: additionalIncomeTotal,
                month: incomeMonth, 
                year: incomeYear, 
                monthName 
            };
        }
        
        // Fallback to estimated payslip
        const incomeData = window.DB.income || {};
        const ctc = incomeData.ctc || 0;
        
        if (!ctc || ctc === 0) {
            // Still include additional income even if no salary/CTC
            if (additionalIncomeTotal > 0) {
                return { 
                    income: additionalIncomeTotal, 
                    salary: 0,
                    additionalIncome: additionalIncomeTotal,
                    month: incomeMonth, 
                    year: incomeYear, 
                    monthName 
                };
            }
            return { income: null, salary: 0, additionalIncome: 0, month: incomeMonth, year: incomeYear, monthName };
        }
        
        const monthNamesLong = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const yearlyPayslips = Income.generateYearlyPayslips(
            ctc, 
            incomeData.bonusPercent || 0, 
            incomeData.esppPercentCycle1 || 0, 
            incomeData.esppPercentCycle2 || 0, 
            incomeData.pfPercent || 12
        );
        
        const payslip = yearlyPayslips.find(p => p.month === monthNamesLong[incomeMonth - 1]);
        const payslipIncome = payslip ? (payslip.totalNetPay || payslip.netPay || 0) : 0;
        const totalIncome = payslipIncome + additionalIncomeTotal;
        
        return { 
            income: totalIncome > 0 ? totalIncome : null, 
            salary: payslipIncome,
            additionalIncome: additionalIncomeTotal,
            month: incomeMonth, 
            year: incomeYear, 
            monthName 
        };
    },
    
    /**
     * Render monthly breakdown section (second line)
     */
    renderMonthlyBreakdown() {
        const filterMonth = this.getFilterMonthValue();
        const [expenseYear, expenseMonth] = filterMonth.split('-').map(Number);
        const expenses = this.getMonthExpenses(filterMonth);
        const investments = this.getMonthInvestments(filterMonth);
        
        // Get income using pay schedule logic
        const incomeData = this.getIncomeForExpenseComparison(expenseYear, expenseMonth);
        const netPay = incomeData.income;
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        
        // Check if we have valid income data
        const hasIncomeData = netPay !== null && netPay > 0;
        
        // Calculate percentages and balance
        let expensesPercent, investmentsPercent, balancePercent, balance;
        
        if (hasIncomeData) {
            balance = netPay - expenses - investments;
            expensesPercent = ((expenses / netPay) * 100).toFixed(1);
            investmentsPercent = ((investments / netPay) * 100).toFixed(1);
            balancePercent = ((balance / netPay) * 100).toFixed(1);
        } else {
            balance = 0;
            expensesPercent = 'N/A';
            investmentsPercent = 'N/A';
            balancePercent = 'N/A';
        }
        
        // Income source label for tooltip
        const incomeSourceLabel = paySchedule === 'last_week' 
            ? `Based on ${incomeData.monthName} ${incomeData.year} income (last week pay schedule)`
            : `Based on ${incomeData.monthName} ${incomeData.year} income`;
        
        return `
            <!-- Monthly Breakdown Cards Box -->
            <div class="dash-card-primary">
                <!-- Header with Title, Trend Icon, and Month Selector -->
                <div class="flex justify-between items-center gap-2 max-w-full">
                    <div class="flex items-center gap-2 min-w-0">
                        <h3 class="text-sm font-semibold text-gray-700">Cash flow</h3>
                        <button onclick="Dashboard.showCashFlowTrendModal()"
                                class="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
                                aria-label="Show cash-flow trend" title="Show cash-flow trend">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3 17l6-6 4 4 7-7M14 8h7v7"/>
                            </svg>
                        </button>
                    </div>
                    <div class="relative flex-shrink-0">
                        <input type="month" id="filter-month-selector" value="${filterMonth}" onchange="Dashboard.updateFilterMonthButton()" class="absolute opacity-0 pointer-events-none" />
                        <button id="filter-month-button" onclick="document.getElementById('filter-month-selector').showPicker()" class="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap">
                            ${this.getFormattedMonth(filterMonth)} ▼
                        </button>
                    </div>
                </div>
                ${paySchedule === 'last_week' ? `<p class="text-[10px] text-gray-400 mt-1 mb-2">Compared with ${incomeData.monthName} ${incomeData.year} income</p>` : '<div class="mb-3"></div>'}
                
                <!-- Breakdown meters -->
                <div class="grid grid-cols-3 gap-2 max-w-full">
                    ${this._renderMeter({
                        label: 'Expenses',
                        value: hasIncomeData ? expensesPercent : 'N/A',
                        amount: `₹${Utils.formatIndianNumber(Math.round(expenses))}`,
                        c1: '#ef4444', c2: '#dc2626',
                        onclick: `Dashboard.showMonthlyBreakdownList('expenses')`
                    })}
                    ${this._renderMeter({
                        label: 'Investments',
                        value: hasIncomeData ? investmentsPercent : 'N/A',
                        amount: `₹${Utils.formatIndianNumber(Math.round(investments))}`,
                        c1: '#06b6d4', c2: '#0891b2',
                        onclick: `Dashboard.showMonthlyBreakdownList('investments')`
                    })}
                    ${this._renderMeter({
                        label: 'Balance',
                        value: hasIncomeData ? balancePercent : 'N/A',
                        // Balance can be negative — clamp the ring at 0 but keep the real number.
                        pct: hasIncomeData ? Math.max(0, parseFloat(balancePercent)) : 0,
                        // Don't rely on grey color alone — flag a negative balance with a text cue.
                        status: hasIncomeData && balance < 0 ? '<span class="text-[11px] text-gray-600 font-semibold">▼ shortfall</span>' : '',
                        amount: hasIncomeData ? `₹${Utils.formatIndianNumber(Math.round(balance))}` : 'No income data',
                        c1: hasIncomeData && balance >= 0 ? '#22c55e' : '#9ca3af',
                        c2: hasIncomeData && balance >= 0 ? '#16a34a' : '#6b7280',
                        // Tapping the dial shows the same explainer the old "i" badge did.
                        onclick: `Dashboard.showTooltip(event, '${hasIncomeData ? 'Balance: Income - (Expenses + Investments)' : 'No income data for ' + incomeData.monthName + ' ' + incomeData.year}')`
                    })}
                </div>
                ${this._renderEndOfMonthAdvice({ filterMonth, expenseYear, expenseMonth, hasIncomeData, balance })}
            </div>
        `;
    },

    /**
     * On the last day of the viewed month, when there's still a positive
     * balance left, nudge the user to put it to work — emergency fund first
     * (until target met), SIPs / extra investing after that. Returns '' in
     * every other case so the row only appears when actionable.
     *
     * Why "last day" specifically: earlier in the month the balance number
     * is misleading (most expenses haven't landed yet). On the final day,
     * what's left is genuinely "did not get spent this month".
     */
    _renderEndOfMonthAdvice({ filterMonth, expenseYear, expenseMonth, hasIncomeData, balance }) {
        if (!hasIncomeData || balance <= 0) return '';

        // Last-day check tied to the user's *viewed* month, not "today's"
        // month. So if you scroll back and view a past month, the advice
        // doesn't reappear retroactively.
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === expenseYear && (today.getMonth() + 1) === expenseMonth;
        if (!isCurrentMonth) return '';

        const lastDay = new Date(expenseYear, expenseMonth, 0).getDate();
        if (today.getDate() !== lastDay) return '';

        // Branch on emergency-fund status. EF data lives on FinancialHealth;
        // if it's unavailable, default to "fund EF first" (safer).
        let efShortfall = 0;
        let efStatus = 'critical';
        try {
            if (window.FinancialHealth && typeof window.FinancialHealth.computeEmergencyFund === 'function') {
                const ef = window.FinancialHealth.computeEmergencyFund();
                efShortfall = ef?.shortfall || 0;
                efStatus = ef?.status || 'critical';
            }
        } catch (e) {
            console.warn('EF computation failed for advice row:', e);
        }

        const efIsHealthy = efStatus === 'good' || efShortfall <= 0;
        const balanceFmt = Utils.formatIndianNumber(Math.round(balance));
        const fmt = (n) => Utils.formatIndianNumber(Math.round(n));

        // EF-first path. Cap the suggested top-up at the EF shortfall so we
        // don't tell someone to "park ₹50k in EF" when they only need ₹8k
        // more to hit the target — the rest can still go to SIPs.
        if (!efIsHealthy) {
            const towardEf = Math.min(balance, efShortfall);
            const remainder = balance - towardEf;
            const remainderLine = remainder > 0
                ? ` Remainder ₹${fmt(remainder)} → top up SIPs / extra investing.`
                : '';
            return `
                <div class="mt-3 flex items-start gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg">
                    <span class="text-emerald-600 flex-shrink-0 mt-0.5">💡</span>
                    <div class="text-[11px] leading-snug text-emerald-800">
                        <strong>Last day — put ₹${balanceFmt} to work.</strong>
                        Move ₹${fmt(towardEf)} to your <button onclick="FinancialHealth.showEmergencyFundBreakdown && FinancialHealth.showEmergencyFundBreakdown()" class="underline font-semibold hover:text-emerald-900">emergency fund</button> first (status: ${efStatus}).${remainderLine}
                    </div>
                </div>
            `;
        }

        // EF healthy → nudge toward SIPs / investing.
        return `
            <div class="mt-3 flex items-start gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg">
                <span class="text-emerald-600 flex-shrink-0 mt-0.5">💡</span>
                <div class="text-[11px] leading-snug text-emerald-800">
                    <strong>Last day — put ₹${balanceFmt} to work.</strong>
                    Emergency fund is healthy ✓ — top up your SIPs or send the surplus into long-term investing instead of letting it idle in savings.
                </div>
            </div>
        `;
    },

    // ----- Cash-flow trend modal -------------------------------------------
    // 3-line chart of Expenses / Investments / Balance over the last N months
    // (default 6, switchable to 3 or 12). Lives in its own modal so the main
    // dashboard tile stays compact. Re-uses existing month accessors so the
    // numbers match what the other tiles show.

    cashFlowTrendChartInstance: null,
    cashFlowTrendRange: 6,   // months — 3 / 6 / 12

    showCashFlowTrendModal() {
        let modal = document.getElementById('cashflow-trend-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cashflow-trend-modal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4';
            modal.onclick = (e) => { if (e.target === modal) Dashboard.closeCashFlowTrendModal(); };
            document.body.appendChild(modal);
        }
        modal.innerHTML = this._renderCashFlowTrendModalBody();
        modal.classList.remove('hidden');
        // Render the chart on the next frame so the canvas has a measured size.
        setTimeout(() => this._renderCashFlowTrendChart(), 50);
    },

    closeCashFlowTrendModal() {
        if (this.cashFlowTrendChartInstance) {
            try { this.cashFlowTrendChartInstance.destroy(); } catch (e) { /* ignore */ }
            this.cashFlowTrendChartInstance = null;
        }
        const modal = document.getElementById('cashflow-trend-modal');
        if (modal) modal.classList.add('hidden');
    },

    setCashFlowTrendRange(months) {
        this.cashFlowTrendRange = months;
        const modal = document.getElementById('cashflow-trend-modal');
        if (modal) modal.innerHTML = this._renderCashFlowTrendModalBody();
        setTimeout(() => this._renderCashFlowTrendChart(), 50);
    },

    /**
     * Build the trend dataset: one point per month, ending with the *current*
     * month, looking back N-1 months. Each point carries income / expenses /
     * investments / balance (= income − expenses − investments). When a month
     * has no income data, balance is reported as 0 — that's preferable to
     * dropping the month entirely (charts with gaps look broken).
     */
    _getCashFlowTrendData(months) {
        const now = new Date();
        const series = [];
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const monthValue = `${y}-${String(m).padStart(2, '0')}`;
            const expenses = this.getMonthExpenses(monthValue) || 0;
            const investments = this.getMonthInvestments(monthValue) || 0;
            const incomeData = this.getIncomeForExpenseComparison(y, m);
            const income = incomeData?.income || 0;
            const balance = income > 0 ? Math.max(0, income - expenses - investments) : 0;
            series.push({
                label: d.toLocaleDateString('en-US', { month: 'short' }) + (months > 6 ? ` ${String(y).slice(-2)}` : ''),
                income,
                expenses,
                investments,
                balance,
            });
        }
        return series;
    },

    _renderCashFlowTrendModalBody() {
        const range = this.cashFlowTrendRange;
        const rangeButton = (n) => `
            <button onclick="Dashboard.setCashFlowTrendRange(${n})"
                    class="px-3 py-1 text-xs rounded-md transition-all ${range === n ? 'bg-white shadow-sm text-teal-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}">
                ${n}M
            </button>
        `;
        return `
            <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div class="bg-gradient-to-r from-teal-600 to-cyan-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
                    <h3 class="text-base font-bold">📈 Cash flow trend</h3>
                    <button onclick="Dashboard.closeCashFlowTrendModal()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-lg leading-none">×</button>
                </div>
                <div class="p-4 overflow-y-auto flex-1 space-y-3">
                    <!-- Range selector -->
                    <div class="flex bg-gray-100 rounded-lg p-0.5 w-fit mx-auto">
                        ${rangeButton(3)}
                        ${rangeButton(6)}
                        ${rangeButton(12)}
                        ${rangeButton(24)}
                    </div>
                    <!-- Chart canvas -->
                    <div style="position: relative; height: 280px; max-width: 100%;">
                        <canvas id="cashflow-trend-canvas"></canvas>
                    </div>
                    <!-- Legend / explainer -->
                    <div class="text-[11px] text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                        <strong class="text-gray-700">How to read this:</strong> Expenses and Investments are what went out each month. Balance is what was left over (income − expenses − investments). Rising Balance + flat Expenses is the healthiest pattern.
                    </div>
                </div>
            </div>
        `;
    },

    _renderCashFlowTrendChart() {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById('cashflow-trend-canvas');
        if (!canvas) return;

        if (this.cashFlowTrendChartInstance) {
            try { this.cashFlowTrendChartInstance.destroy(); } catch (e) { /* ignore */ }
            this.cashFlowTrendChartInstance = null;
        }

        const data = this._getCashFlowTrendData(this.cashFlowTrendRange);
        const labels = data.map(d => d.label);

        // Scale point/line density to range so 24 months still reads clearly.
        const isDense = this.cashFlowTrendRange >= 12;
        const pointRadius = isDense ? 2 : 3;
        const borderWidth = isDense ? 2 : 2.5;
        // X-tick density: skip labels at 24M so they don't overlap on small screens.
        const maxXTicks = this.cashFlowTrendRange >= 24 ? 8 : this.cashFlowTrendRange;

        // Colors mirror the dashboard tiles so users can map at a glance.
        const ctx = canvas.getContext('2d');
        this.cashFlowTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Expenses',
                        data: data.map(d => Math.round(d.expenses)),
                        borderColor: '#ef4444',  // red-500 — matches Expenses tile
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        tension: 0.35,
                        borderWidth: borderWidth,
                        pointRadius: pointRadius,
                        pointHoverRadius: 5,
                        fill: false,
                    },
                    {
                        label: 'Investments',
                        data: data.map(d => Math.round(d.investments)),
                        borderColor: '#06b6d4',  // cyan-500 — matches Investments circle
                        backgroundColor: 'rgba(6, 182, 212, 0.08)',
                        tension: 0.35,
                        borderWidth: borderWidth,
                        pointRadius: pointRadius,
                        pointHoverRadius: 5,
                        fill: false,
                    },
                    {
                        label: 'Balance',
                        data: data.map(d => Math.round(d.balance)),
                        borderColor: '#22c55e',  // green-500 — matches Balance circle
                        backgroundColor: 'rgba(34, 197, 94, 0.12)',
                        tension: 0.35,
                        borderWidth: borderWidth,
                        pointRadius: pointRadius,
                        pointHoverRadius: 5,
                        fill: true,            // light fill so Balance reads as the "headline" series
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: this._chartAnimation(),
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 }, usePointStyle: true },
                    },
                    tooltip: {
                        callbacks: {
                            label: (item) => {
                                const v = item.parsed.y;
                                return `${item.dataset.label}: ₹${(window.Utils && Utils.formatIndianNumber) ? Utils.formatIndianNumber(v) : v.toLocaleString('en-IN')}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, maxTicksLimit: maxXTicks, autoSkip: true },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            font: { size: 10 },
                            // Compact ₹ ticks — 1.2L, 25k, 5k etc.
                            callback: (v) => {
                                if (v === 0) return '₹0';
                                if (v >= 100000) return '₹' + (v / 100000).toFixed(v % 100000 === 0 ? 0 : 1) + 'L';
                                if (v >= 1000) return '₹' + Math.round(v / 1000) + 'k';
                                return '₹' + v;
                            },
                        },
                    },
                },
            },
        });
    },

    /**
     * Show Settlement Calculations Modal
     */
    /**
     * Most-recent paid bill for a card. Returns { amount, paidAt } or null.
     * Uses paidAmount when present, falls back to the original billed amount.
     */
    _getLastPaidBillForCard(cardId) {
        const all = (window.DB.cardBills || []).filter(b =>
            String(b.cardId) === String(cardId) && b.isPaid && (b.paidAt || b.paidDate)
        );
        if (all.length === 0) return null;
        const sorted = all.slice().sort((a, b) =>
            new Date(b.paidAt || b.paidDate) - new Date(a.paidAt || a.paidDate)
        );
        const latest = sorted[0];
        const amt = parseFloat(latest.paidAmount) || parseFloat(latest.amount) || 0;
        return { amount: amt, paidAt: latest.paidAt || latest.paidDate };
    },

    /**
     * Ensure window.DB.settlementData[monthKey] exists with the expected shape,
     * creating it (with the supplied expanded-sections defaults) if missing and
     * backfilling any sub-structures missing from older saved data. Replaces the
     * ~20 hand-copied initializer literals that had started to drift apart.
     *
     * Note: `enabledSips` is intentionally left untouched so showSettlementModal's
     * "first open → enable all active SIPs" (undefined) semantics still work.
     */
    _ensureSettlement(monthKey, defaultExpanded) {
        const baseExpanded = () => defaultExpanded
            ? { ...defaultExpanded }
            : { cards: false, recurring: false, loans: false, sips: false, custom: false, summary: false };
        if (!window.DB.settlementData) window.DB.settlementData = {};
        let sd = window.DB.settlementData[monthKey];
        if (!sd) {
            sd = window.DB.settlementData[monthKey] = {
                cardSelections: {},
                enabledRecurring: [],
                enabledLoanEmis: [],
                enabledCards: [],
                customItems: [],
                expandedSections: baseExpanded()
            };
            return sd;
        }
        if (!sd.cardSelections) sd.cardSelections = {};
        if (!Array.isArray(sd.enabledRecurring)) sd.enabledRecurring = [];
        if (!Array.isArray(sd.enabledLoanEmis)) sd.enabledLoanEmis = [];
        if (!Array.isArray(sd.enabledCards)) sd.enabledCards = [];
        if (!Array.isArray(sd.customItems)) sd.customItems = [];
        if (!sd.expandedSections) sd.expandedSections = baseExpanded();
        return sd;
    },

    showSettlementModal(year, month) {
        // Save scroll positions before re-rendering
        const scrollPositions = {};
        const existingModal = document.getElementById('settlement-modal');
        if (existingModal) {
            // Save main modal container scroll position (this is the main scrollable area)
            const modalContent = existingModal.querySelector('#settlement-modal-content');
            if (modalContent) scrollPositions.modal = modalContent.scrollTop;
            
            // Recurring content has nested scrollable div
            const recurringScrollable = existingModal.querySelector('#recurring-content .max-h-48.overflow-y-auto');
            if (recurringScrollable) scrollPositions.recurring = recurringScrollable.scrollTop;
            
            // Loans content has nested scrollable div
            const loansScrollable = existingModal.querySelector('#loans-content .max-h-48.overflow-y-auto');
            if (loansScrollable) scrollPositions.loans = loansScrollable.scrollTop;
        }
        
        // Single source of truth for all derived numbers/health flags so the
        // full render and the in-place refresh (_refreshSettlementTotals) can
        // never drift apart.
        const ctx = this._computeSettlementContext(year, month);
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Build modal HTML
        const modalHTML = this._buildSettlementModalHtml(year, month, ctx, monthName);

        // Remove existing modal if any
        const modalToRemove = document.getElementById('settlement-modal');
        if (modalToRemove) modalToRemove.remove();

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Restore scroll positions after a brief delay to ensure DOM is ready
        setTimeout(() => {
            const newModal = document.getElementById('settlement-modal');
            if (newModal) {
                if (scrollPositions.modal !== undefined) {
                    const modalContent = newModal.querySelector('#settlement-modal-content');
                    if (modalContent) modalContent.scrollTop = scrollPositions.modal;
                }
                if (scrollPositions.recurring !== undefined) {
                    const recurringContent = newModal.querySelector('#recurring-content .max-h-48.overflow-y-auto');
                    if (recurringContent) recurringContent.scrollTop = scrollPositions.recurring;
                }
                if (scrollPositions.loans !== undefined) {
                    const loansContent = newModal.querySelector('#loans-content .max-h-48.overflow-y-auto');
                    if (loansContent) loansContent.scrollTop = scrollPositions.loans;
                }
            }
        }, 10);
    },

    /**
     * Compute every derived value the settlement modal renders (income, the
     * per-section totals, grand total, balance, and the debt/investment health
     * indicators). Used by both showSettlementModal and _refreshSettlementTotals
     * so totals shown in the UI always match.
     */
    _computeSettlementContext(year, month) {
        // Calculate default income/recurring month based on pay schedule
        const paySchedule = window.DB.settings.paySchedule || 'first_week';
        let defaultIncomeYear = year;
        let defaultIncomeMonth = month;
        
        if (paySchedule === 'last_week') {
            // If last week pay schedule, income is from next month
            defaultIncomeMonth = month === 12 ? 1 : month + 1;
            defaultIncomeYear = month === 12 ? year + 1 : year;
        }
        
        // Initialize settlement data in DB if not exists
        if (!window.DB.settlementData) {
            window.DB.settlementData = {};
        }
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const settlementData = window.DB.settlementData[monthKey] || {
            cardSelections: {}, // { cardId: 'bill' | 'outstanding' }
            enabledRecurring: [], // Array of enabled recurring item names
            enabledLoanEmis: [], // Array of enabled loan EMI names
            customItems: [],
            incomeMonth: `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`,
            recurringMonth: `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`,
            loansMonth: null // Will default to incomeMonth
        };
        
        // Get income for selected month
        const incomeMonthKey = settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`;
        const [incomeYear, incomeMonth] = incomeMonthKey.split('-').map(Number);
        const incomeData = this.getIncomeForExpenseComparison(incomeYear, incomeMonth);
        const income = incomeData.income || 0;
        
        // Check if using actual salary or estimated payslip
        // Use the actual month/year that getIncomeForExpenseComparison used (may be adjusted by pay schedule)
        const salaries = window.DB.salaries || [];
        const actualSalary = salaries.find(s => s.year === incomeData.year && s.month === incomeData.month);
        const isEstimatedIncome = !actualSalary && income > 0;
        
        // Get credit cards with outstanding and bill amounts
        const creditCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        const unpaidBills = (window.DB.cardBills || []).filter(b => !b.isPaid);
        
        // Calculate current bill / outstanding / last-paid amounts per card.
        // The Reload / Revert button toggles which set of numbers is used:
        //   'current'  → Bill + Outstanding radios per card (live data)
        //   'lastPaid' → single line per card showing the most recent paid bill
        const currentCardData = creditCards.map(card => {
            const cardBills = unpaidBills.filter(b => String(b.cardId) === String(card.id));
            const billAmount = cardBills.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
            const outstandingAmount = parseFloat(card.outstanding) || 0;
            const lastPaid = this._getLastPaidBillForCard(card.id);
            return {
                id: card.id,
                name: card.name,
                billAmount,
                outstandingAmount,
                lastPaidBillAmount: lastPaid?.amount || 0,
                lastPaidBillDate: lastPaid?.paidAt || null,
                hasBills: billAmount > 0,
                hasOutstanding: outstandingAmount > 0,
                hasLastPaid: !!(lastPaid && lastPaid.amount > 0),
            };
        }).filter(card => card.billAmount > 0 || card.outstandingAmount > 0 || card.lastPaidBillAmount > 0);
        
        // The "card view mode" controls what amount(s) we render per card:
        //   'current'  → Bill / Outstanding radios (live values)
        //   'lastPaid' → most-recent paid bill, single number, no radios
        // Default = 'current' on first open.
        if (!settlementData.cardViewMode) {
            settlementData.cardViewMode = 'current';
        }
        const cardData = currentCardData;
        
        // Get individual recurring payments for selected month
        const recurringMonthKey = settlementData.recurringMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`;
        const [recurringYear, recurringMonth] = recurringMonthKey.split('-').map(Number);
        const recurringItems = this.getRecurringExpenseItemsForMonth(recurringYear, recurringMonth);
        
        // Initialize enabled recurring if not exists
        if (!settlementData.enabledRecurring || settlementData.enabledRecurring.length === 0) {
            settlementData.enabledRecurring = recurringItems.map(r => r.name);
        }
        
        // Get individual loan EMIs for selected month (only loan EMIs, not card EMIs)
        const loansMonthKey = settlementData.loansMonth || settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`;
        const [loansYear, loansMonth] = loansMonthKey.split('-').map(Number);
        const loanEmiItems = this.getEmiItemsForMonth(loansYear, loansMonth).filter(emi => emi.type === 'loan');
        
        // Initialize enabled loan EMIs if not exists (all enabled by default)
        if (!settlementData.enabledLoanEmis || settlementData.enabledLoanEmis.length === 0) {
            settlementData.enabledLoanEmis = loanEmiItems.map(emi => emi.name);
        }

        // Get active SIPs (planned monthly investments) for this settlement
        const sipItems = (window.Sips && typeof window.Sips.getActiveForSettlement === 'function')
            ? window.Sips.getActiveForSettlement()
            : [];

        // Initialize enabled SIPs on first render (all active SIPs enabled by default)
        if (settlementData.enabledSips === undefined) {
            settlementData.enabledSips = sipItems.map(s => s.name);
        } else if (!Array.isArray(settlementData.enabledSips)) {
            settlementData.enabledSips = sipItems.map(s => s.name);
        }
        
        // Initialize card selections if not exists
        cardData.forEach(card => {
            if (!settlementData.cardSelections[card.id]) {
                // Default to bill if available, otherwise outstanding
                settlementData.cardSelections[card.id] = card.hasBills ? 'bill' : 'outstanding';
            }
        });
        
        // Initialize enabled recurring if not exists
        if (!settlementData.enabledRecurring) {
            settlementData.enabledRecurring = recurringItems.map(r => r.name);
        }
        
        // Initialize enabled cards if not exists (all cards enabled by default)
        // Only initialize if the property doesn't exist at all, not if it's empty
        if (settlementData.enabledCards === undefined) {
            settlementData.enabledCards = cardData.map(c => String(c.id));
        } else if (!Array.isArray(settlementData.enabledCards)) {
            settlementData.enabledCards = cardData.map(c => String(c.id));
        }
        
        // Initialize expanded sections state
        if (!settlementData.expandedSections) {
            settlementData.expandedSections = { cards: false, recurring: false, loans: false, custom: false, summary: false };
        }
        
        // Calculate totals — depends on view mode.
        // In 'lastPaid' mode the per-card radio is irrelevant; the total is
        // always the sum of last-paid amounts across enabled cards.
        const isLastPaidMode = settlementData.cardViewMode === 'lastPaid';
        const cardsTotal = cardData
            .filter(card => (settlementData.enabledCards || []).some(id => String(id) === String(card.id)))
            .reduce((sum, card) => {
                if (isLastPaidMode) {
                    return sum + (card.lastPaidBillAmount || 0);
                }
                const selection = settlementData.cardSelections[card.id] || 'bill';
                return sum + (selection === 'bill' ? card.billAmount : card.outstandingAmount);
            }, 0);
        
        const recurringTotal = recurringItems
            .filter(r => settlementData.enabledRecurring.includes(r.name))
            .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        
        // Calculate loan EMIs total
        const loansTotal = loanEmiItems
            .filter(emi => settlementData.enabledLoanEmis.includes(emi.name))
            .reduce((sum, emi) => sum + (parseFloat(emi.amount) || 0), 0);
        
        const customItemsTotal = (settlementData.customItems || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

        const sipsTotal = sipItems
            .filter(s => settlementData.enabledSips.includes(s.name))
            .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

        const totalDeductions = cardsTotal + recurringTotal + loansTotal + sipsTotal + customItemsTotal;
        const balance = income - totalDeductions;

        // Calculate financial health indicators
        const sipsPercent = income > 0 ? (sipsTotal / income) * 100 : 0;
        const loansPercent = income > 0 ? (loansTotal / income) * 100 : 0;

        // Get user's budget rule (default 50/30/20)
        const budgetRule = this.budgetRule || this.defaultBudgetRule;
        const investmentTarget = budgetRule.invest || 20; // Target investment %

        // Get loan limit from settings (default 40%)
        const maxLoanPercent = window.DB.settings.maxLoanToIncomePercent || 40;

        // Health indicators
        const sipsHealthy = sipsPercent >= investmentTarget; // Should be >= investment target (or user's target)
        const loansHealthy = loansPercent <= maxLoanPercent; // Should be <= max loan % (default 40%)

        // Status messages
        const sipsStatusIcon = sipsHealthy ? '✅' : '⚠️';
        const sipsStatusText = sipsHealthy
            ? `On track (${sipsPercent.toFixed(1)}% vs ${investmentTarget}% target)`
            : `Below target (${sipsPercent.toFixed(1)}% vs ${investmentTarget}% target)`;
        const sipsStatusColor = sipsHealthy ? 'text-green-600' : 'text-orange-600';

        const loansStatusIcon = loansHealthy ? '✅' : '⚠️';
        const loansStatusText = loansHealthy
            ? `Healthy (${loansPercent.toFixed(1)}% vs ${maxLoanPercent}% safe limit)`
            : `High (${loansPercent.toFixed(1)}% exceeds ${maxLoanPercent}% safe limit)`;
        const loansStatusColor = loansHealthy ? 'text-green-600' : 'text-red-600';

        return {
            defaultIncomeYear, defaultIncomeMonth, monthKey, settlementData,
            income, isEstimatedIncome, cardData, isLastPaidMode,
            recurringItems, loanEmiItems, sipItems,
            cardsTotal, recurringTotal, loansTotal, sipsTotal, customItemsTotal,
            totalDeductions, balance,
            sipsPercent, loansPercent, investmentTarget, maxLoanPercent,
            sipsHealthy, loansHealthy,
            sipsStatusIcon, sipsStatusText, sipsStatusColor,
            loansStatusIcon, loansStatusText, loansStatusColor
        };
    },

    /**
     * Build the full settlement modal HTML from a precomputed context.
     */
    _buildSettlementModalHtml(year, month, ctx, monthName) {
        const {
            defaultIncomeYear, defaultIncomeMonth, settlementData,
            income, isEstimatedIncome, cardData, isLastPaidMode,
            recurringItems, loanEmiItems, sipItems,
            cardsTotal, recurringTotal, loansTotal, sipsTotal, customItemsTotal,
            totalDeductions, balance,
            sipsPercent, loansPercent, investmentTarget, maxLoanPercent,
            sipsHealthy, loansHealthy,
            sipsStatusIcon, sipsStatusText, sipsStatusColor,
            loansStatusIcon, loansStatusText, loansStatusColor
        } = ctx;

        return `
            <div id="settlement-modal" class="fixed inset-0 bg-black bg-opacity-75 z-[10000] flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeSettlementModal()">
                <div id="settlement-modal-content" class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div class="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-3.5 flex justify-between items-center rounded-t-2xl z-10">
                        <div class="flex items-center gap-2.5">
                            <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-white/20">
                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                                </svg>
                            </div>
                            <div>
                                <h2 class="text-lg font-bold text-white leading-tight">Outflow Overview</h2>
                                <p class="text-[11px] text-green-50/90 leading-tight">${monthName}</p>
                            </div>
                        </div>
                        <button onclick="Dashboard.closeSettlementModal()" class="text-white/90 hover:text-white p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="p-4 space-y-3">
                        <!-- Hero: Income · live outflow composition · Final Balance -->
                        <div class="rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-50 to-white shadow-sm p-3.5 mb-3">
                            <!-- Income + month selector -->
                            <div class="flex items-start justify-between mb-3">
                                <div>
                                    <p class="text-[11px] font-medium text-gray-500">Income</p>
                                    <p class="text-2xl font-extrabold text-gray-900 leading-tight tracking-tight">₹${Utils.formatIndianNumber(income)}</p>
                                    ${isEstimatedIncome
                                        ? `<p class="text-[9px] text-amber-500 font-medium">~ Estimated from payslip</p>`
                                        : income > 0
                                            ? `<p class="text-[9px] text-green-600 font-medium">✓ Actual salary</p>`
                                            : `<p class="text-[9px] text-gray-400">No income set</p>`}
                                </div>
                                <div class="relative">
                                    <input type="month" id="settlement-income-month-selector"
                                           value="${settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`}"
                                           onchange="Dashboard.updateSettlementIncomeMonth(${year}, ${month}, this.value)"
                                           class="absolute opacity-0 pointer-events-none">
                                    <button id="settlement-income-month-button"
                                            onclick="document.getElementById('settlement-income-month-selector').showPicker()"
                                            class="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-all whitespace-nowrap">
                                        ${this.getFormattedMonth(settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`)} ▼
                                    </button>
                                </div>
                            </div>

                            <!-- Total outflows + live composition bar -->
                            <div class="flex items-center justify-between mb-1.5">
                                <p class="text-[11px] font-medium text-gray-500">Total Outflows</p>
                                <p id="settlement-outflows-total" class="text-sm font-bold text-rose-600">₹${Utils.formatIndianNumber(totalDeductions)}</p>
                            </div>
                            <div id="settlement-composition-bar">${this._compositionBarHtml(ctx)}</div>

                            <!-- Final balance -->
                            <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                <div class="flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 10l2-5h14l2 5M3 10v9a1 1 0 001 1h16a1 1 0 001-1v-9"/>
                                    </svg>
                                    <p class="text-[11px] font-medium text-gray-500">Final Balance</p>
                                </div>
                                <p id="settlement-balance" class="text-xl font-extrabold ${balance >= 0 ? 'text-emerald-700' : 'text-rose-600'}">₹${Utils.formatIndianNumber(balance)}</p>
                            </div>
                            <p class="text-[9px] text-gray-400 text-right mt-0.5">Income − Outflows</p>
                        </div>
                        
                        <!-- Credit Card Bills (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('cards', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 text-sm">💳</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Credit Card Bills</p>
                                        <p class="text-[10px] text-gray-500">${cardData.length} card(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span id="settlement-cards-total" class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(cardsTotal)}</span>
                                    <svg id="cards-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.cards ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="cards-content" class="${settlementData.expandedSections?.cards ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-2 border-t border-gray-200">
                                <div class="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200" onclick="event.stopPropagation()">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] text-gray-600 leading-tight mb-0.5">${isLastPaidMode ? 'Showing each card\'s last paid bill amount' : 'Showing current bill / outstanding from credit cards'}</p>
                                        <p class="text-[9px] text-gray-500">${isLastPaidMode ? 'Tap reload to switch to current bill / outstanding' : 'Tap revert to switch to last paid amounts'}</p>
                                    </div>
                                    ${isLastPaidMode ? `
                                        <button onclick="event.stopPropagation(); Dashboard.loadCardData(${year}, ${month})"
                                                class="p-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-all flex-shrink-0 mt-0.5"
                                                title="Reload — show current bill / outstanding">
                                            <svg class="w-3.5 h-3.5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                            </svg>
                                        </button>
                                    ` : `
                                        <button onclick="event.stopPropagation(); Dashboard.revertCardData(${year}, ${month})"
                                                class="p-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-all flex-shrink-0 mt-0.5"
                                                title="Revert — show last paid amounts">
                                            <svg class="w-3.5 h-3.5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                                            </svg>
                                        </button>
                                    `}
                                </div>
                                ${cardData.length > 0 ? cardData.map(card => {
                                    const isEnabled = (settlementData.enabledCards || []).some(id => String(id) === String(card.id));

                                    // ── Last-paid view: single value per card, no radios ──
                                    if (isLastPaidMode) {
                                        const lastPaidLabel = card.lastPaidBillDate
                                            ? new Date(card.lastPaidBillDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                                            : '';
                                        return `
                                            <div class="bg-gray-50 rounded p-2" onclick="event.stopPropagation()">
                                                <div class="flex items-center gap-2">
                                                    <input type="checkbox" id="card-checkbox-${card.id}" ${isEnabled ? 'checked' : ''}
                                                           onchange="event.stopPropagation(); Dashboard.toggleCardEnabled(${year}, ${month}, '${card.id}', this.checked)"
                                                           class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                                    <div class="flex-1 min-w-0">
                                                        <p class="text-xs font-semibold text-gray-700 truncate">${Utils.escapeHtml(card.name)}</p>
                                                        <p class="text-[10px] text-gray-500">${card.hasLastPaid ? `Last paid${lastPaidLabel ? ` · ${lastPaidLabel}` : ''}` : 'No paid history yet'}</p>
                                                    </div>
                                                    <span class="text-xs font-bold ${card.hasLastPaid ? 'text-gray-900' : 'text-gray-400'} flex-shrink-0">₹${Utils.formatIndianNumber(card.lastPaidBillAmount)}</span>
                                                </div>
                                            </div>
                                        `;
                                    }

                                    // ── Current view: Bill / Outstanding radios ──
                                    const selection = settlementData.cardSelections[card.id] || 'bill';
                                    return `
                                        <div class="bg-gray-50 rounded p-2" onclick="event.stopPropagation()">
                                            <div class="flex items-center gap-2 mb-1.5">
                                                <input type="checkbox" id="card-checkbox-${card.id}" ${isEnabled ? 'checked' : ''}
                                                       onchange="event.stopPropagation(); Dashboard.toggleCardEnabled(${year}, ${month}, '${card.id}', this.checked)"
                                                       class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                                <p class="text-xs font-semibold text-gray-700 flex-1">${Utils.escapeHtml(card.name)}</p>
                                            </div>
                                            ${isEnabled ? `
                                                <div class="flex items-center gap-3 ml-5">
                                                    <label class="flex items-center gap-1.5 cursor-pointer">
                                                        <input type="radio" name="card-${card.id}" value="bill"
                                                               ${selection === 'bill' ? 'checked' : ''}
                                                               onchange="event.stopPropagation(); Dashboard.updateCardSelection(${year}, ${month}, '${card.id}', 'bill')"
                                                               class="w-3.5 h-3.5 text-green-600 border-gray-300">
                                                        <span class="text-[10px] text-gray-700">
                                                            Bill: ₹${Utils.formatIndianNumber(card.billAmount)}
                                                        </span>
                                                    </label>
                                                    <label class="flex items-center gap-1.5 cursor-pointer">
                                                        <input type="radio" name="card-${card.id}" value="outstanding"
                                                               ${selection === 'outstanding' ? 'checked' : ''}
                                                               onchange="event.stopPropagation(); Dashboard.updateCardSelection(${year}, ${month}, '${card.id}', 'outstanding')"
                                                               class="w-3.5 h-3.5 text-green-600 border-gray-300">
                                                        <span class="text-[10px] text-gray-700">
                                                            Outstanding: ₹${Utils.formatIndianNumber(card.outstandingAmount)}
                                                        </span>
                                                    </label>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No credit cards available</p>'}
                            </div>
                        </div>
                        
                        <!-- Recurring Payments (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('recurring', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 text-sm">🔄</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Recurring</p>
                                        <p class="text-[10px] text-gray-500">${recurringItems.length} item${recurringItems.length === 1 ? '' : 's'}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span id="settlement-recurring-total" class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(recurringTotal)}</span>
                                    <svg id="recurring-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.recurring ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="recurring-content" class="${settlementData.expandedSections?.recurring ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div class="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200" onclick="event.stopPropagation()">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] text-gray-600 leading-tight mb-0.5">Recurring payments — choose month</p>
                                        <p class="text-[9px] text-gray-500">Defaults to your income pay schedule</p>
                                    </div>
                                    <div class="relative flex-shrink-0 mt-0.5">
                                        <input type="month" id="settlement-recurring-month-selector" 
                                               value="${settlementData.recurringMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`}"
                                               onchange="Dashboard.updateSettlementRecurringMonth(${year}, ${month}, this.value)"
                                               class="absolute opacity-0 pointer-events-none">
                                        <button id="settlement-recurring-month-button" 
                                                onclick="event.stopPropagation(); document.getElementById('settlement-recurring-month-selector').showPicker()"
                                                class="px-2 py-1 border border-gray-300 rounded text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-all whitespace-nowrap">
                                            ${this.getFormattedMonth(settlementData.recurringMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`)} ▼
                                        </button>
                                    </div>
                                </div>
                                <div class="max-h-48 overflow-y-auto">
                                ${recurringItems.length > 0 ? recurringItems.map(item => {
                                    const isEnabled = settlementData.enabledRecurring.includes(item.name);
                                    return `
                                        <label class="flex items-center gap-2 p-1.5 bg-gray-50 rounded cursor-pointer hover:bg-gray-100" onclick="event.stopPropagation()">
                                            <input type="checkbox" ${isEnabled ? 'checked' : ''}
                                                   onchange="event.stopPropagation(); Dashboard.toggleRecurringItem(${year}, ${month}, '${Utils.escapeHtml(item.name)}')"
                                                   class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(item.name)}</p>
                                                <p class="text-[10px] text-gray-500 truncate">${item.category || 'Uncategorized'}</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(item.amount)}</span>
                                        </label>
                                    `;
                                }).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No recurring payments this month</p>'}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Loan EMIs (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('loans', ${year}, ${month})"
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-100 text-sm">🏦</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Loan EMIs</p>
                                        <p class="text-[10px] text-gray-500">${loanEmiItems.length} EMI${loanEmiItems.length === 1 ? '' : 's'}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span id="settlement-loans-badge">${this._loansHealthBadgeHtml(ctx)}</span>
                                    <span id="settlement-loans-total" class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(loansTotal)}</span>
                                    <svg id="loans-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.loans ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="loans-content" class="${settlementData.expandedSections?.loans ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div class="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200" onclick="event.stopPropagation()">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] text-gray-600 leading-tight mb-0.5">Select month for loan EMIs</p>
                                        <p class="text-[9px] text-gray-500">Default: Same as income month</p>
                                    </div>
                                    <div class="relative flex-shrink-0 mt-0.5">
                                        <input type="month" id="settlement-loans-month-selector"
                                               value="${settlementData.loansMonth || settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`}"
                                               onchange="Dashboard.updateSettlementLoansMonth(${year}, ${month}, this.value)"
                                               class="absolute opacity-0 pointer-events-none">
                                        <button id="settlement-loans-month-button"
                                                onclick="event.stopPropagation(); document.getElementById('settlement-loans-month-selector').showPicker()"
                                                class="px-2 py-1 border border-gray-300 rounded text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-all whitespace-nowrap">
                                            ${this.getFormattedMonth(settlementData.loansMonth || settlementData.incomeMonth || `${defaultIncomeYear}-${String(defaultIncomeMonth).padStart(2, '0')}`)} ▼
                                        </button>
                                    </div>
                                </div>
                                <div id="settlement-loans-healthbox">${this._loansHealthBoxHtml(ctx)}</div>
                                <div class="max-h-48 overflow-y-auto">
                                ${loanEmiItems.length > 0 ? loanEmiItems.map(emi => {
                                    const isEnabled = settlementData.enabledLoanEmis.includes(emi.name);
                                    return `
                                        <label class="flex items-center gap-2 p-1.5 bg-gray-50 rounded cursor-pointer hover:bg-gray-100" onclick="event.stopPropagation()">
                                            <input type="checkbox" ${isEnabled ? 'checked' : ''}
                                                   onchange="event.stopPropagation(); Dashboard.toggleLoanEmiItem(${year}, ${month}, '${Utils.escapeHtml(emi.name)}')"
                                                   class="w-3.5 h-3.5 text-green-600 border-gray-300 rounded">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(emi.name)}</p>
                                                <p class="text-[10px] text-gray-500 truncate">${emi.date}${emi.description ? ' • ' + Utils.escapeHtml(emi.description) : ''}</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(emi.amount)}</span>
                                        </label>
                                    `;
                                }).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No loan EMIs for this month</p>'}
                                </div>
                            </div>
                        </div>
                        
                        <!-- SIPs (Collapsible) - planned monthly investments -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('sips', ${year}, ${month})"
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-sm">📈</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">SIPs (Planned)</p>
                                        <p class="text-[10px] text-gray-500">${sipItems.length} active SIP(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span id="settlement-sips-badge">${this._sipsHealthBadgeHtml(ctx)}</span>
                                    <span id="settlement-sips-total" class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(sipsTotal)}</span>
                                    <svg id="sips-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.sips ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="sips-content" class="${settlementData.expandedSections?.sips ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div id="settlement-sips-healthbox">${this._sipsHealthBoxHtml(ctx)}</div>
                                <div class="max-h-48 overflow-y-auto">
                                ${sipItems.length > 0 ? sipItems.map(sip => {
                                    const isEnabled = settlementData.enabledSips.includes(sip.name);
                                    return `
                                        <label class="flex items-center gap-2 p-1.5 bg-gray-50 rounded cursor-pointer hover:bg-gray-100" onclick="event.stopPropagation()">
                                            <input type="checkbox" ${isEnabled ? 'checked' : ''}
                                                   onchange="event.stopPropagation(); Dashboard.toggleSipItem(${year}, ${month}, '${Utils.escapeHtml(sip.name).replace(/'/g, "\\'")}')"
                                                   class="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(sip.name)}</p>
                                                <p class="text-[10px] text-gray-500">Monthly plan</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(sip.amount)}</span>
                                        </label>
                                    `;
                                }).join('') : `<p class="text-[10px] text-gray-500 text-center py-1.5">No active SIPs.<br><span class="text-gray-400">Add planned SIPs under Investments → SIPs.</span></p>`}
                                </div>
                            </div>
                        </div>

                        <!-- Custom Items (Collapsible) -->
                        <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <button onclick="Dashboard.toggleSettlementSection('custom', ${year}, ${month})" 
                                    class="w-full flex items-center justify-between p-2.5 hover:bg-gray-100 transition-colors">
                                <div class="flex items-center gap-2">
                                    <span class="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-100 text-sm">➕</span>
                                    <div class="text-left">
                                        <p class="text-xs font-semibold text-gray-700">Custom Items</p>
                                        <p class="text-[10px] text-gray-500">${(settlementData.customItems || []).length} item(s)</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span id="settlement-custom-total" class="text-xs font-bold text-gray-900">₹${Utils.formatIndianNumber(customItemsTotal)}</span>
                                    <svg id="custom-arrow" class="w-4 h-4 text-gray-500 transform transition-transform ${settlementData.expandedSections?.custom ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </button>
                            <div id="custom-content" class="${settlementData.expandedSections?.custom ? '' : 'hidden'} px-3 pb-3 pt-3 space-y-1.5 border-t border-gray-200">
                                <div id="custom-items-list" class="space-y-1.5">
                                    ${(settlementData.customItems || []).length > 0 ? (settlementData.customItems || []).map((item, idx) => `
                                        <div class="flex items-center gap-2 p-1.5 bg-gray-50 rounded">
                                            <button onclick="event.stopPropagation(); Dashboard.removeCustomItem(${year}, ${month}, ${idx})" 
                                                    class="px-1.5 py-0.5 text-[10px] bg-red-500 hover:bg-red-600 text-white rounded flex-shrink-0 transition-all"
                                                    title="Remove item">
                                                ×
                                            </button>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-[10px] font-medium text-gray-700 truncate">${Utils.escapeHtml(item.name)}</p>
                                            </div>
                                            <span class="text-[10px] font-bold text-gray-900 flex-shrink-0">₹${Utils.formatIndianNumber(item.amount)}</span>
                                        </div>
                                    `).join('') : '<p class="text-[10px] text-gray-500 text-center py-1.5">No custom items added</p>'}
                                </div>
                                <button onclick="event.stopPropagation(); Dashboard.showAddCustomItemModal(${year}, ${month})" 
                                        class="w-full flex items-center justify-center p-1.5 border-2 border-dashed border-green-400 rounded hover:border-green-500 hover:bg-green-50 transition-all"
                                        title="Add custom item">
                                    <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Live "where the money goes" bar for the Outflow Overview hero. Renders a
     * single rounded stacked bar (one segment per outflow category, sized by its
     * share of total outflows) plus a compact wrapping legend. Re-rendered in
     * place by _refreshSettlementTotals whenever a toggle changes the totals.
     */
    _compositionBarHtml(ctx) {
        const { cardsTotal, recurringTotal, loansTotal, sipsTotal, customItemsTotal, totalDeductions } = ctx;
        const parts = [
            { label: 'Cards',     value: cardsTotal,       color: '#6366f1' },
            { label: 'Recurring', value: recurringTotal,   color: '#f59e0b' },
            { label: 'Loans',     value: loansTotal,       color: '#f43f5e' },
            { label: 'SIPs',      value: sipsTotal,        color: '#8b5cf6' },
            { label: 'Custom',    value: customItemsTotal, color: '#06b6d4' },
        ].filter(p => p.value > 0);

        if (totalDeductions <= 0 || parts.length === 0) {
            return `<div class="h-2.5 rounded-full bg-gray-100"></div>
                    <p class="text-[9px] text-gray-400 mt-1">No outflows selected yet</p>`;
        }

        const segments = parts.map(p => {
            const pct = (p.value / totalDeductions) * 100;
            return `<div style="width:${pct}%;background:${p.color}" title="${p.label}: ₹${Utils.formatIndianNumber(p.value)} (${pct.toFixed(0)}%)"></div>`;
        }).join('');

        const legend = parts.map(p => {
            const pct = (p.value / totalDeductions) * 100;
            return `<span class="inline-flex items-center gap-1 text-[9px] text-gray-500">
                        <span class="w-2 h-2 rounded-sm" style="background:${p.color}"></span>
                        ${p.label} ${pct.toFixed(0)}%
                    </span>`;
        }).join('');

        return `
            <div class="flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-px">${segments}</div>
            <div class="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5">${legend}</div>`;
    },

    _loansHealthBadgeHtml(ctx) {
        const { income, loanEmiItems, loansHealthy, loansStatusText } = ctx;
        if (!(income > 0 && loanEmiItems.length > 0)) return '';
        return `
            <div class="flex items-center justify-center w-5 h-5 rounded-full ${loansHealthy ? 'bg-green-500' : 'bg-red-500'}" title="${loansStatusText}">
                ${loansHealthy
                    ? `<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`
                    : `<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
                }
            </div>`;
    },

    _loansHealthBoxHtml(ctx) {
        const { income, loanEmiItems, loansHealthy, loansStatusIcon, loansStatusColor, loansPercent, maxLoanPercent } = ctx;
        if (!(income > 0 && loanEmiItems.length > 0)) return '';
        return `
            <div class="mb-2 p-2 rounded-lg ${loansHealthy ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                <div class="flex items-center gap-1.5 mb-1">
                    <span class="text-sm">${loansStatusIcon}</span>
                    <p class="text-[10px] font-semibold ${loansStatusColor}">${loansHealthy ? 'Healthy Debt Level' : 'Debt Warning'}</p>
                </div>
                <p class="text-[10px] ${loansHealthy ? 'text-green-700' : 'text-red-700'}">
                    ${loansHealthy
                        ? `Your loan EMIs are ${loansPercent.toFixed(1)}% of income (safe limit: ${maxLoanPercent}%). Well managed! 👍`
                        : `Your loan EMIs are ${loansPercent.toFixed(1)}% of income (safe limit: ${maxLoanPercent}%). Consider restructuring or prepayment. ⚠️`
                    }
                </p>
            </div>`;
    },

    _sipsHealthBadgeHtml(ctx) {
        const { income, sipsHealthy, sipsStatusText } = ctx;
        if (!(income > 0)) return '';
        return `
            <div class="flex items-center justify-center w-5 h-5 rounded-full ${sipsHealthy ? 'bg-green-500' : 'bg-orange-500'}" title="${sipsStatusText}">
                ${sipsHealthy
                    ? `<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`
                    : `<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
                }
            </div>`;
    },

    _sipsHealthBoxHtml(ctx) {
        const { income, sipsHealthy, sipsStatusIcon, sipsStatusColor, sipsPercent, investmentTarget } = ctx;
        if (!(income > 0)) return '';
        return `
            <div class="mb-2 p-2 rounded-lg ${sipsHealthy ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}">
                <div class="flex items-center gap-1.5 mb-1">
                    <span class="text-sm">${sipsStatusIcon}</span>
                    <p class="text-[10px] font-semibold ${sipsStatusColor}">${sipsHealthy ? 'Healthy Investment' : 'Investment Warning'}</p>
                </div>
                <p class="text-[10px] ${sipsHealthy ? 'text-green-700' : 'text-orange-700'}">
                    ${sipsHealthy
                        ? `Your SIPs are ${sipsPercent.toFixed(1)}% of income (target: ${investmentTarget}%). Keep it up! 🎯`
                        : `Your SIPs are ${sipsPercent.toFixed(1)}% of income (target: ${investmentTarget}%). Consider increasing investments. 📊`
                    }
                </p>
            </div>`;
    },

    /**
     * Recompute settlement totals/health and update only the affected DOM
     * nodes in place. Used by the numeric toggles so we don't tear down and
     * rebuild the entire modal (which loses focus/scroll and is wasteful).
     * Falls back to a full re-render if the modal isn't in the expected shape.
     */
    _refreshSettlementTotals(year, month) {
        const modal = document.getElementById('settlement-modal');
        if (!modal) return;
        const ctx = this._computeSettlementContext(year, month);
        const fmt = (n) => `₹${Utils.formatIndianNumber(n)}`;

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
            return !!el;
        };

        // Section header totals + grand total + balance + summary breakdown
        const ok =
            setText('settlement-balance', fmt(ctx.balance)) &
            setText('settlement-outflows-total', fmt(ctx.totalDeductions)) &
            setText('settlement-cards-total', fmt(ctx.cardsTotal)) &
            setText('settlement-recurring-total', fmt(ctx.recurringTotal)) &
            setText('settlement-loans-total', fmt(ctx.loansTotal)) &
            setText('settlement-sips-total', fmt(ctx.sipsTotal)) &
            setText('settlement-custom-total', fmt(ctx.customItemsTotal));

        if (!ok) {
            // DOM not in expected shape (older markup) — safe full re-render.
            this.showSettlementModal(year, month);
            return;
        }

        // Live outflow-composition bar — rebuild from the same helper the full
        // render uses so segment widths track the new totals.
        const compBar = document.getElementById('settlement-composition-bar');
        if (compBar) compBar.innerHTML = this._compositionBarHtml(ctx);

        // Keep the final-balance colour in sync when it crosses zero.
        const balanceEl = document.getElementById('settlement-balance');
        if (balanceEl) {
            balanceEl.classList.toggle('text-emerald-700', ctx.balance >= 0);
            balanceEl.classList.toggle('text-rose-600', ctx.balance < 0);
        }

        // Health badges/boxes (loans + sips) — rebuild their container markup
        // from the same helpers the full render uses.
        const loansBadge = document.getElementById('settlement-loans-badge');
        if (loansBadge) loansBadge.innerHTML = this._loansHealthBadgeHtml(ctx);
        const loansBox = document.getElementById('settlement-loans-healthbox');
        if (loansBox) loansBox.innerHTML = this._loansHealthBoxHtml(ctx);
        const sipsBadge = document.getElementById('settlement-sips-badge');
        if (sipsBadge) sipsBadge.innerHTML = this._sipsHealthBadgeHtml(ctx);
        const sipsBox = document.getElementById('settlement-sips-healthbox');
        if (sipsBox) sipsBox.innerHTML = this._sipsHealthBoxHtml(ctx);
    },

    /**
     * Close Settlement Modal
     */
    closeSettlementModal() {
        const modal = document.getElementById('settlement-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Toggle settlement section (collapsible) - preserves state
     */
    toggleSettlementSection(section, year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        this._ensureSettlement(monthKey, { cards: false, recurring: false, loans: false, custom: false, summary: false });
        
        // Toggle the state
        const currentState = window.DB.settlementData[monthKey].expandedSections[section] || false;
        window.DB.settlementData[monthKey].expandedSections[section] = !currentState;
        window.Storage.save();
        
        // Update UI
        const content = document.getElementById(`${section}-content`);
        const arrow = document.getElementById(`${section}-arrow`);
        if (content && arrow) {
            if (!currentState) {
                content.classList.remove('hidden');
                arrow.classList.add('rotate-180');
            } else {
                content.classList.add('hidden');
                arrow.classList.remove('rotate-180');
            }
        }
    },
    
    /**
     * Toggle card enabled/disabled - preserves expanded state
     */
    toggleCardEnabled(year, month, cardId, checked) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, { cards: true, recurring: false, loans: false, custom: false, summary: false });
        
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        const enabledCards = sd.enabledCards;
        const cardIdStr = String(cardId);
        const index = enabledCards.findIndex(id => String(id) === cardIdStr);
        
        if (checked) {
            // Add to enabled cards (check) - only if not already present
            if (index === -1) {
                enabledCards.push(cardIdStr);
            }
        } else {
            // Remove from enabled cards (uncheck)
            if (index > -1) {
                enabledCards.splice(index, 1);
            }
        }
        
        window.DB.settlementData[monthKey].enabledCards = enabledCards;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update settlement income month
     */
    updateSettlementIncomeMonth(year, month, incomeMonthValue) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        this._ensureSettlement(monthKey, {});
        window.DB.settlementData[monthKey].incomeMonth = incomeMonthValue;
        window.Storage.save();
        
        // Update button text
        const button = document.getElementById('settlement-income-month-button');
        if (button) {
            button.innerHTML = this.getFormattedMonth(incomeMonthValue) + ' ▼';
        }
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update settlement recurring month
     */
    updateSettlementRecurringMonth(year, month, recurringMonthValue) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, {});
        
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        window.DB.settlementData[monthKey].recurringMonth = recurringMonthValue;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        // Update button text
        const button = document.getElementById('settlement-recurring-month-button');
        if (button) {
            button.innerHTML = this.getFormattedMonth(recurringMonthValue) + ' ▼';
        }
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update settlement loans month
     */
    updateSettlementLoansMonth(year, month, loansMonthValue) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, {});
        
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        window.DB.settlementData[monthKey].loansMonth = loansMonthValue;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        // Update button text
        const button = document.getElementById('settlement-loans-month-button');
        if (button) {
            button.innerHTML = this.getFormattedMonth(loansMonthValue) + ' ▼';
        }
        
        this.showSettlementModal(year, month);
    },
    
    /**
     * Toggle loan EMI item enable/disable - preserves expanded state
     */
    toggleLoanEmiItem(year, month, itemName) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, { cards: false, recurring: false, loans: true, custom: false, summary: false });
        
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        const enabledLoanEmis = sd.enabledLoanEmis;
        const index = enabledLoanEmis.indexOf(itemName);
        if (index > -1) {
            enabledLoanEmis.splice(index, 1);
        } else {
            enabledLoanEmis.push(itemName);
        }
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this._refreshSettlementTotals(year, month);
    },

    /**
     * Toggle a planned SIP item on/off for the given settlement month.
     */
    toggleSipItem(year, month, itemName) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, { cards: false, recurring: false, loans: false, sips: true, custom: false, summary: false });
        if (!Array.isArray(sd.enabledSips)) {
            sd.enabledSips = [];
        }

        // Preserve expanded state (keep SIPs section open while toggling)
        const expandedState = { ...sd.expandedSections, sips: true };

        const enabledSips = sd.enabledSips;
        const index = enabledSips.indexOf(itemName);
        if (index > -1) {
            enabledSips.splice(index, 1);
        } else {
            enabledSips.push(itemName);
        }
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this._refreshSettlementTotals(year, month);
    },
    
    /**
     * Reload — switch the cards section to "current" view.
     * Shows live current bill / outstanding values per card with the existing
     * Bill / Outstanding radio toggle.
     */
    loadCardData(year, month) {
        this._setCardViewMode(year, month, 'current');
    },

    /**
     * Revert — switch the cards section to "last paid" view.
     * Shows each card's most-recently-paid bill amount (single value, no
     * radios). Useful for "what did I pay last cycle" comparisons.
     */
    revertCardData(year, month) {
        this._setCardViewMode(year, month, 'lastPaid');
    },

    /** Internal: persist the cards-section view mode and re-render. */
    _setCardViewMode(year, month, mode) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        this._ensureSettlement(monthKey, {});
        window.DB.settlementData[monthKey].cardViewMode = mode;
        window.Storage.save();
        this.showSettlementModal(year, month);
    },
    
    /**
     * Update card selection (bill or outstanding) - preserves expanded state
     */
    updateCardSelection(year, month, cardId, selectionType) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, { cards: true, recurring: false, loans: false, custom: false, summary: false });
        
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        window.DB.settlementData[monthKey].cardSelections[cardId] = selectionType;
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this._refreshSettlementTotals(year, month);
    },
    
    /**
     * Toggle recurring item enable/disable - preserves expanded state
     */
    toggleRecurringItem(year, month, itemName) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, { cards: false, recurring: true, loans: false, custom: false, summary: false });
        
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        const enabledRecurring = sd.enabledRecurring;
        const index = enabledRecurring.indexOf(itemName);
        if (index > -1) {
            enabledRecurring.splice(index, 1);
        } else {
            enabledRecurring.push(itemName);
        }
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        this._refreshSettlementTotals(year, month);
    },
    
    /**
     * Show modal to add custom settlement item
     */
    showAddCustomItemModal(year, month) {
        const modalHTML = `
            <div id="add-custom-item-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4" onclick="if(event.target===this) Dashboard.closeAddCustomItemModal()">
                <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-gray-800">Add Custom Item</h3>
                        <button onclick="Dashboard.closeAddCustomItemModal()" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
                            <input type="text" id="custom-item-name" 
                                   class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                   placeholder="e.g., Medical expenses, Shopping">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                            <input type="number" id="custom-item-amount" 
                                   class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                   placeholder="0" min="0" step="0.01">
                        </div>
                        <div class="flex gap-3 pt-2">
                            <button onclick="Dashboard.closeAddCustomItemModal()" 
                                    class="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancel
                            </button>
                            <button onclick="Dashboard.saveCustomItem(${year}, ${month})" 
                                    class="flex-1 px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('add-custom-item-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Focus on name input
        setTimeout(() => {
            const nameInput = document.getElementById('custom-item-name');
            if (nameInput) nameInput.focus();
        }, 100);
    },
    
    /**
     * Close add custom item modal
     */
    closeAddCustomItemModal() {
        const modal = document.getElementById('add-custom-item-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Save custom item from modal
     */
    saveCustomItem(year, month) {
        const nameInput = document.getElementById('custom-item-name');
        const amountInput = document.getElementById('custom-item-amount');
        
        if (!nameInput || !amountInput) return;
        
        const name = nameInput.value.trim();
        const amount = parseFloat(amountInput.value) || 0;
        
        if (!name) {
            alert('Please enter an item name');
            return;
        }
        
        if (amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const sd = this._ensureSettlement(monthKey, { cards: false, recurring: false, loans: false, custom: true, summary: false });
        // Preserve expanded state
        const expandedState = sd.expandedSections;
        
        window.DB.settlementData[monthKey].customItems.push({ name: name, amount: amount });
        window.DB.settlementData[monthKey].expandedSections = expandedState;
        window.Storage.save();
        
        this.closeAddCustomItemModal();
        this.showSettlementModal(year, month);
    },
    
    
    /**
     * Remove custom item
     */
    removeCustomItem(year, month, index) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!window.DB.settlementData || !window.DB.settlementData[monthKey] || !window.DB.settlementData[monthKey].customItems) {
            return;
        }
        window.DB.settlementData[monthKey].customItems.splice(index, 1);
        window.Storage.save();
        this.showSettlementModal(year, month);
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
}

