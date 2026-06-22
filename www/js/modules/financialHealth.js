/**
 * FinancialHealth Module
 *
 * Two big-picture indicators that turn the dashboard from "log of past months"
 * into "where am I heading":
 *
 *   1. Net Worth = liquid + invested + receivable  −  card outstanding − loans
 *   2. Emergency Fund coverage = liquid balance ÷ avg monthly essentials
 *
 * Everything is computed from existing modules (no new tracked fields).
 * The module exposes:
 *   - computeNetWorth()           → { total, assets:{...}, liabilities:{...} }
 *   - computeEmergencyFund()      → { liquid, monthlyEssentials, months, status }
 *   - renderTile()                → HTML for a single dashboard tile
 *   - showNetWorthBreakdown() / showEmergencyFundBreakdown()  → modal viewers
 */
const FinancialHealth = {

    /**
     * Targets — kept here so they're easy to tune later.
     */
    EMERGENCY_FUND_TARGET_MONTHS: 6,
    EMERGENCY_FUND_MIN_MONTHS: 3,

    /**
     * Maximum number of cash-balance change records to retain.
     */
    CASH_HISTORY_LIMIT: 10,

    /**
     * Exchange rate (USD→INR) as a plain number.
     * `DB.exchangeRate` is stored as `{ rate, updatedAt }` in modern data,
     * but old/migrating data can have a raw number, undefined, or even an
     * object with a non-numeric rate. Without this guard, passing the wrapper
     * object straight into `calculatePortfolioAmount` produced `NaN` totals
     * that bubbled up as a ₹0 net-worth tile.
     */
    _getExchangeRate() {
        if (window.Investments && typeof window.Investments.getExchangeRate === 'function') {
            return window.Investments.getExchangeRate();
        }
        const xr = window.DB.exchangeRate;
        if (xr && typeof xr === 'object') return parseFloat(xr.rate) || 89;
        return typeof xr === 'number' ? xr : 89;
    },

    /** Same idea for gold rate. */
    _getGoldRate() {
        if (window.Investments && typeof window.Investments.getGoldRate === 'function') {
            return window.Investments.getGoldRate();
        }
        const gr = window.DB.goldRatePerGram;
        if (gr && typeof gr === 'object') return parseFloat(gr.rate) || 9000;
        return typeof gr === 'number' ? gr : 9000;
    },

    /**
     * Compute net worth from current data.
     * Investment values use Investments.calculatePortfolioAmount which already
     * handles share-price lookups, gold rate, and USD/INR conversion.
     */
    computeNetWorth() {
        const exchangeRate = this._getExchangeRate();
        const goldRate = this._getGoldRate();
        const sharePrices = window.DB.sharePrices || [];

        // ---- Assets ----
        const portfolio = (window.DB.portfolioInvestments || []);
        const investmentBreakdown = { EPF: 0, FD: 0, GOLD: 0, SHARES: 0, MF: 0 };
        portfolio.forEach(inv => {
            const value = window.Investments
                ? window.Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices)
                : 0;
            if (investmentBreakdown[inv.type] !== undefined) {
                investmentBreakdown[inv.type] += value;
            }
        });
        const investments = Object.values(investmentBreakdown).reduce((s, v) => s + v, 0);

        // Money lent that hasn't come back yet — receivable, but counts as your money.
        const receivable = (window.DB.moneyLent || []).reduce((sum, rec) => {
            const out = window.MoneyLent
                ? window.MoneyLent.calculateOutstanding(rec)
                : (rec.amount || 0);
            return sum + (out > 0 ? out : 0);
        }, 0);

        // Cash & savings (bank savings, sweep, cash on hand). Same number
        // we use for emergency-fund coverage — that's not double-counting,
        // EF coverage is just a different lens on the same balance sheet.
        const cashSavings = this._getCashSavingsCurrent();

        // "Risk" = market-volatile equities. Shares + MFs in equity-style
        // sub-categories (Equity, Hybrid, ELSS). Gold is treated as safer
        // (it's a hedge), and debt/liquid MFs aren't market-correlated.
        // Used for the "X% of net worth at market risk" indicator.
        const RISK_MF_CATEGORIES = new Set(['EQUITY', 'HYBRID', 'ELSS']);
        const riskAmount = portfolio.reduce((sum, inv) => {
            const value = window.Investments
                ? window.Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices)
                : 0;
            if (inv.type === 'SHARES') return sum + value;
            if (inv.type === 'MF' && RISK_MF_CATEGORIES.has(inv.mfCategory || 'EQUITY')) {
                return sum + value;
            }
            return sum;
        }, 0);

        // ---- Liabilities ----
        const cardOutstanding = (window.DB.cards || [])
            .filter(c => (!c.cardType || c.cardType === 'credit') && !c.isPlaceholder)
            .reduce((s, c) => s + (parseFloat(c.outstanding) || 0), 0);

        const loanOutstanding = (window.DB.loans || []).reduce((sum, loan) => {
            if (!loan.firstEmiDate || !loan.amount || !loan.interestRate || !loan.tenure) return sum;
            const remaining = window.Loans
                ? window.Loans.calculateRemaining(loan.firstEmiDate, loan.amount, loan.interestRate, loan.tenure)
                : null;
            return sum + (remaining ? remaining.remainingBalance : 0);
        }, 0);

        const totalAssets = investments + receivable + cashSavings;
        const totalLiabilities = cardOutstanding + loanOutstanding;
        const total = totalAssets - totalLiabilities;

        return {
            total,
            assets: {
                investments,
                investmentBreakdown,
                receivable,
                cashSavings,
                totalAssets,
            },
            liabilities: {
                cardOutstanding,
                loanOutstanding,
                totalLiabilities,
            },
            risk: {
                amount: riskAmount,
                // Pct of net worth at market risk. Guard against divide-by-zero
                // and negative net worth (debt-heavy users): show 0% instead
                // of a misleading negative or infinite value.
                percentOfNetWorth: total > 0 ? (riskAmount / total) * 100 : 0,
            },
        };
    },

    /**
     * Compute emergency-fund coverage in months.
     *
     * liquid              = cashSavings.current
     *                       + sum of investments flagged isEmergencyFund
     * monthlyEssentials   = recurring obligations (this month)
     *                       + loan & credit-card EMIs (this month)
     *                       + 3-mo average of "other spend" (regular, non-recurring, non-EMI)
     *                       — i.e. money that would still go out even with zero income.
     * months              = liquid / monthlyEssentials
     * status              = 'critical' (<3) | 'low' (<6) | 'good' (>=6)
     */
    computeEmergencyFund() {
        const exchangeRate = this._getExchangeRate();
        const goldRate = this._getGoldRate();
        const sharePrices = window.DB.sharePrices || [];

        const cashBalance = this._getCashSavingsCurrent();

        // EF eligibility (must mirror the form rules):
        //   - FD: yes
        //   - MF: yes, except ELSS (3-yr lock-in)
        //   - SHARES, EPF, GOLD: no
        // Re-check here so legacy/stale flags from an older version
        // can't quietly inflate emergency-fund coverage.
        const flaggedInvestments = (window.DB.portfolioInvestments || [])
            .filter(inv => {
                if (!inv || inv.isEmergencyFund !== true) return false;
                if (inv.type === 'FD') return true;
                if (inv.type === 'MF' && inv.mfCategory !== 'ELSS') return true;
                return false;
            });

        const flaggedTotal = flaggedInvestments.reduce((sum, inv) => {
            const value = window.Investments
                ? window.Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices)
                : 0;
            return sum + value;
        }, 0);

        const liquid = cashBalance + flaggedTotal;

        const breakdown = this._getMonthlyEssentialsBreakdown();
        const monthlyEssentials = breakdown.total;

        let months = 0;
        if (monthlyEssentials > 0) {
            months = liquid / monthlyEssentials;
        }

        let status = 'good';
        if (months < this.EMERGENCY_FUND_MIN_MONTHS) status = 'critical';
        else if (months < this.EMERGENCY_FUND_TARGET_MONTHS) status = 'low';

        return {
            liquid,
            cashBalance,
            flaggedTotal,
            flaggedInvestments,
            monthlyEssentials,
            essentialsBreakdown: breakdown,
            months,
            status,
            target: this.EMERGENCY_FUND_TARGET_MONTHS,
            minimum: this.EMERGENCY_FUND_MIN_MONTHS,
            shortfall: Math.max(0, (this.EMERGENCY_FUND_TARGET_MONTHS * monthlyEssentials) - liquid),
        };
    },

    /**
     * Read the current cash & savings balance, defaulting to 0 if the
     * user hasn't set it yet.
     */
    _getCashSavingsCurrent() {
        const cs = window.DB.cashSavings;
        if (!cs || typeof cs.current !== 'number') return 0;
        return cs.current;
    },

    /**
     * Update cash & savings balance and append a history record. Caps the
     * history at CASH_HISTORY_LIMIT (oldest entries dropped). Does NOT
     * append a duplicate when the value hasn't changed.
     */
    updateCashSavings(newAmount) {
        const amount = parseFloat(newAmount);
        if (isNaN(amount) || amount < 0) {
            throw new Error('Cash & savings must be a non-negative number');
        }
        if (!window.DB.cashSavings) {
            window.DB.cashSavings = { current: 0, lastUpdatedAt: 0, history: [] };
        }
        const cs = window.DB.cashSavings;
        if (!Array.isArray(cs.history)) cs.history = [];

        // Skip writing if it's an exact duplicate of the latest record.
        const lastRecord = cs.history[cs.history.length - 1];
        if (lastRecord && lastRecord.amount === amount) {
            return;
        }

        cs.current = amount;
        cs.lastUpdatedAt = Date.now();
        cs.history.push({ amount, updatedAt: cs.lastUpdatedAt });

        // Keep only the most recent N records.
        if (cs.history.length > this.CASH_HISTORY_LIMIT) {
            cs.history = cs.history.slice(-this.CASH_HISTORY_LIMIT);
        }

        window.Storage.save();
    },

    /**
     * What you'd still owe each month with zero income:
     *   recurring   — bills/subscriptions/rent/etc. due this month
     *   emis        — loan + credit-card EMIs due this month
     *   otherSpend  — 3-month average of "regular" expenses (non-recurring,
     *                 non-EMI day-to-day spending: groceries, fuel, eating out)
     *
     * The current month is partial, so we average over the last 3 *complete*
     * months for `otherSpend`. Recurring and EMIs are pulled from the current
     * month because they're scheduled obligations — the amount is known, not
     * estimated from history.
     *
     * Returns { recurring, emis, otherSpend, total, monthsSampledForOther }.
     */
    _getMonthlyEssentialsBreakdown() {
        const dash = window.Dashboard;
        if (!dash) return { recurring: 0, emis: 0, otherSpend: 0, total: 0, monthsSampledForOther: 0 };

        const now = new Date();
        const curYear = now.getFullYear();
        const curMonth = now.getMonth() + 1;

        const recurring = (dash.getTotalRecurringExpensesForMonth)
            ? dash.getTotalRecurringExpensesForMonth(curYear, curMonth)
            : 0;
        const emis = (dash.getTotalEmisForMonth)
            ? dash.getTotalEmisForMonth(curYear, curMonth)
            : 0;

        // 3-month average of "other spend" (regular = non-recurring, non-EMI),
        // skipping the current partial month.
        let otherSpend = 0;
        let monthsSampledForOther = 0;
        if (dash.getRegularTotalForMonth || dash.isRegularExpense) {
            const samples = [];
            for (let i = 1; i <= 4 && samples.length < 3; i++) {
                const d = new Date(curYear, now.getMonth() - i, 1);
                const total = (dash.getRegularTotalForMonth)
                    ? dash.getRegularTotalForMonth(d.getFullYear(), d.getMonth() + 1)
                    : this._sumRegularExpensesForMonth(d.getFullYear(), d.getMonth() + 1);
                if (total > 0) samples.push(total);
            }
            if (samples.length > 0) {
                otherSpend = samples.reduce((s, v) => s + v, 0) / samples.length;
                monthsSampledForOther = samples.length;
            }
        }

        const total = recurring + emis + otherSpend;
        return { recurring, emis, otherSpend, total, monthsSampledForOther };
    },

    /**
     * Fallback summer for "other spend" if Dashboard doesn't expose a helper.
     * Uses Dashboard.isRegularExpense for the same regular/recurring/EMI split
     * so the number matches what the dashboard's "Other spend" tile shows.
     */
    _sumRegularExpensesForMonth(year, month) {
        const dash = window.Dashboard;
        if (!dash || !dash.isRegularExpense) return 0;
        const expenses = window.DB.expenses || [];
        return expenses.reduce((sum, exp) => {
            const { month: m, year: y } = dash.getExpenseBudgetMonth(exp);
            if (y !== year || m !== month) return sum;
            if (!dash.isRegularExpense(exp)) return sum;
            return sum + (parseFloat(exp.amount) || 0);
        }, 0);
    },

    /**
     * Render the dashboard tile. Two-column layout: net worth left, emergency
     * fund right. Each is clickable → opens its breakdown modal.
     */
    renderTile() {
        const nw = this.computeNetWorth();
        const ef = this.computeEmergencyFund();

        const nwIsPositive = nw.total >= 0;
        const nwColor = nwIsPositive ? 'emerald' : 'rose';
        const nwSign = nwIsPositive ? '' : '-';

        // With no essentials data the coverage is unknowable ('—'); the status
        // would otherwise default to 'critical' and show a misleading red badge.
        // Surface a neutral 'Set up' chip instead until there's data to grade.
        const efBadge = ef.monthlyEssentials === 0
            ? { label: 'Set up', cls: 'bg-white/25' }
            : {
            critical: { label: 'Critical', cls: 'bg-rose-500' },
            low:      { label: 'Low',      cls: 'bg-amber-500' },
            good:     { label: 'Healthy',  cls: 'bg-emerald-500' },
        }[ef.status];

        const efMonthsDisplay = ef.monthlyEssentials > 0
            ? `${ef.months.toFixed(1)}<span class="text-base opacity-80">mo</span>`
            : `<span class="text-base opacity-80">—</span>`;

        const efSubLabel = ef.monthlyEssentials > 0
            ? `of ${ef.target} mo target`
            : (ef.liquid > 0 ? 'add expenses to enable' : 'tap to set up');

        // Top-right risk indicator: just the % of net worth in market-volatile
        // equities (Shares + Equity / Hybrid / ELSS MFs). Hidden when there's
        // nothing at risk so the chip doesn't show "0%" and add visual noise.
        const riskPct = nw.risk?.percentOfNetWorth || 0;
        const showRisk = nw.total > 0 && (nw.risk?.amount || 0) > 0;
        const riskBadge = showRisk
            ? `<span class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-semibold" title="Market risk: ${riskPct.toFixed(0)}% of net worth in equities">${riskPct.toFixed(0)}% equity</span>`
            : '';

        return `
        <div class="dash-card-hero">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-gray-800">Financial Health</h3>
            </div>
            <div class="grid grid-cols-2 gap-3 max-w-full">
                <div onclick="FinancialHealth.showNetWorthBreakdown()"
                     class="bg-gradient-to-br from-${nwColor}-500 to-${nwColor}-600 rounded-lg p-3 text-white shadow-lg flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-xs font-medium opacity-90">Net Worth</div>
                        ${riskBadge}
                    </div>
                    <div class="flex-1 flex items-center justify-center py-1">
                        <div class="text-2xl font-bold leading-tight">${nwSign}₹${Utils.formatIndianNumber(Math.abs(Math.round(nw.total)))}</div>
                    </div>
                    <div class="flex items-center justify-between text-[11px] opacity-90">
                        <span>assets − debts</span>
                        <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">›</div>
                    </div>
                </div>
                <div onclick="FinancialHealth.showEmergencyFundBreakdown()"
                     class="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg p-3 text-white shadow-lg flex flex-col cursor-pointer hover:shadow-xl transition-shadow active:scale-95">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-xs font-medium opacity-90">Emergency Fund</div>
                        <span class="text-[11px] ${efBadge.cls} px-1.5 py-0.5 rounded font-semibold">${efBadge.label}</span>
                    </div>
                    <div class="flex-1 flex items-center justify-center py-1">
                        <div class="text-2xl font-bold leading-tight">${efMonthsDisplay}</div>
                    </div>
                    <div class="flex items-center justify-between text-[11px] opacity-90">
                        <span>${efSubLabel}</span>
                        <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">›</div>
                    </div>
                </div>
            </div>
        </div>
        `;
    },

    /**
     * Detail modal for net-worth breakdown.
     */
    showNetWorthBreakdown() {
        const nw = this.computeNetWorth();
        const fmt = (n) => `₹${Utils.formatIndianNumber(Math.round(n))}`;
        const ib = nw.assets.investmentBreakdown;

        const investmentRows = [
            ['EPF', ib.EPF],
            ['Fixed Deposits', ib.FD],
            ['Gold', ib.GOLD],
            ['Shares', ib.SHARES],
            ['Mutual Funds', ib.MF],
        ].filter(([, v]) => v > 0)
         .map(([label, v]) => `
            <div class="flex justify-between py-1 text-xs">
                <span class="text-gray-600">${label}</span>
                <span class="font-medium text-gray-800">${fmt(v)}</span>
            </div>
         `).join('');

        const sign = nw.total >= 0 ? '' : '-';
        const totalColor = nw.total >= 0 ? 'text-emerald-700' : 'text-rose-700';

        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-end sm:items-center justify-center p-0 sm:p-4"
                 id="net-worth-modal" onclick="if(event.target===this) this.remove()">
                <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
                    <div class="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 flex items-center justify-between flex-shrink-0">
                        <h3 class="text-base font-bold">📊 Net Worth Breakdown</h3>
                        <button onclick="document.getElementById('net-worth-modal').remove()" aria-label="Close" title="Close" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">×</button>
                    </div>
                    <div class="p-4 overflow-y-auto flex-1 space-y-3">

                        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                            <div class="text-xs font-semibold text-emerald-800 mb-2">Assets ${fmt(nw.assets.totalAssets)}</div>
                            ${nw.assets.cashSavings > 0 ? `
                                <div class="flex justify-between py-1 text-xs">
                                    <span class="text-gray-600">💰 Cash & savings</span>
                                    <span class="font-medium text-gray-800">${fmt(nw.assets.cashSavings)}</span>
                                </div>
                            ` : ''}
                            ${investmentRows || (nw.assets.cashSavings === 0 ? '<div class="text-xs text-gray-500 italic">No investments tracked yet.</div>' : '')}
                            ${nw.assets.receivable > 0 ? `
                                <div class="flex justify-between py-1 text-xs border-t border-emerald-100 mt-1 pt-2">
                                    <span class="text-gray-600">Money lent (receivable)</span>
                                    <span class="font-medium text-gray-800">${fmt(nw.assets.receivable)}</span>
                                </div>
                            ` : ''}
                        </div>

                        <div class="bg-rose-50 border border-rose-200 rounded-lg p-3">
                            <div class="text-xs font-semibold text-rose-800 mb-2">Liabilities ${fmt(nw.liabilities.totalLiabilities)}</div>
                            ${nw.liabilities.cardOutstanding > 0 ? `
                                <div class="flex justify-between py-1 text-xs">
                                    <span class="text-gray-600">Credit card outstanding</span>
                                    <span class="font-medium text-gray-800">${fmt(nw.liabilities.cardOutstanding)}</span>
                                </div>
                            ` : ''}
                            ${nw.liabilities.loanOutstanding > 0 ? `
                                <div class="flex justify-between py-1 text-xs">
                                    <span class="text-gray-600">Loans remaining</span>
                                    <span class="font-medium text-gray-800">${fmt(nw.liabilities.loanOutstanding)}</span>
                                </div>
                            ` : ''}
                            ${nw.liabilities.totalLiabilities === 0 ? `
                                <div class="text-xs text-gray-500 italic">Debt-free 🎉</div>
                            ` : ''}
                        </div>

                        <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                            <div>
                                <div class="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Net Worth</div>
                                <div class="text-[11px] text-gray-500">assets − liabilities</div>
                            </div>
                            <div class="text-2xl font-bold ${totalColor}">${sign}${fmt(Math.abs(nw.total))}</div>
                        </div>

                        ${(nw.total > 0 && nw.risk?.amount > 0) ? `
                            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div class="flex items-center justify-between mb-1">
                                    <div class="text-xs font-bold text-amber-800">⚠ Market risk exposure</div>
                                    <div class="text-xs font-bold text-amber-900">${nw.risk.percentOfNetWorth.toFixed(0)}% of net worth</div>
                                </div>
                                <div class="text-[11px] text-amber-700 mb-2">Shares + Equity / Hybrid / ELSS MFs. Subject to market swings.</div>
                                <div class="flex justify-between text-xs bg-white rounded px-2 py-1.5 border border-amber-100">
                                    <span class="text-gray-600">At risk</span>
                                    <span class="font-bold text-amber-900">${fmt(nw.risk.amount)}</span>
                                </div>
                            </div>
                        ` : ''}

                        <div class="text-[11px] text-gray-500 leading-relaxed bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                            <strong class="text-blue-800">What this includes:</strong> Cash & savings, EPF, FDs, gold, shares & MFs (at current market price), money lent that hasn't come back, minus credit-card outstanding and remaining loan balances. The emergency fund is not a separate bucket — it's just a tag on the subset of assets you can tap fast.
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    /**
     * Detail modal for emergency-fund coverage.
     */
    showEmergencyFundBreakdown() {
        // Re-renders into the same modal so cash edits / history updates
        // refresh the view without flashing.
        let modal = document.getElementById('emergency-fund-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'emergency-fund-modal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-end sm:items-center justify-center p-0 sm:p-4';
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);
        }
        modal.innerHTML = this._renderEmergencyFundModalBody();
    },

    /**
     * Modal body — pulled out so we can re-render after cash updates.
     */
    _renderEmergencyFundModalBody() {
        const ef = this.computeEmergencyFund();
        const fmt = (n) => `₹${Utils.formatIndianNumber(Math.round(n))}`;
        const exchangeRate = this._getExchangeRate();
        const goldRate = this._getGoldRate();
        const sharePrices = window.DB.sharePrices || [];

        const statusCopy = {
            critical: {
                emoji: '🚨',
                title: 'Critical — build this first',
                message: `You have less than ${this.EMERGENCY_FUND_MIN_MONTHS} months of essentials covered. A single job loss or medical emergency could force you into debt. Pause discretionary investments and divert that cash to a liquid fund or savings account until you reach ${this.EMERGENCY_FUND_MIN_MONTHS} months.`,
                color: 'rose',
            },
            low: {
                emoji: '⚠️',
                title: 'Low — keep building',
                message: `You're past the bare minimum but below the ${this.EMERGENCY_FUND_TARGET_MONTHS}-month target. Aim to add ${fmt(ef.shortfall)} more over the next few months in liquid form (savings, sweep FD, liquid/arbitrage MF).`,
                color: 'amber',
            },
            good: {
                emoji: '✅',
                title: 'Healthy',
                message: `You have ${ef.months.toFixed(1)} months of essentials covered. Anything beyond ${this.EMERGENCY_FUND_TARGET_MONTHS} months is excess emergency fund — consider redirecting future surplus into long-term investments.`,
                color: 'emerald',
            },
        }[ef.status];

        const progressPct = Math.min(100, ef.monthlyEssentials > 0
            ? (ef.months / this.EMERGENCY_FUND_TARGET_MONTHS) * 100
            : 0);

        const flaggedRows = ef.flaggedInvestments.length > 0
            ? ef.flaggedInvestments.map(inv => {
                const value = window.Investments
                    ? window.Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices)
                    : 0;
                const typeLabel = inv.type === 'FD' ? 'FD'
                    : inv.type === 'EPF' ? 'EPF'
                    : inv.type === 'GOLD' ? 'Gold'
                    : inv.type === 'MF' ? `MF · ${({ EQUITY: 'Equity', HYBRID: 'Hybrid', DEBT: 'Debt', LIQUID: 'Liquid', ELSS: 'Tax-saver (ELSS)' })[inv.mfCategory] || inv.mfCategory || 'Equity'}`
                    : 'Shares';
                return `
                    <div class="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0 text-xs">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-[11px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">${typeLabel}</span>
                            <span class="text-gray-700 truncate">${Utils.escapeHtml(inv.name)}</span>
                        </div>
                        <span class="font-medium text-gray-800 flex-shrink-0">${fmt(value)}</span>
                    </div>
                `;
            }).join('')
            : `
                <div class="text-[11px] text-gray-500 italic py-1">
                    No investments flagged yet. Edit any investment and tick "Part of my emergency fund" to include it here.
                </div>
            `;

        const cs = window.DB.cashSavings || { current: 0, history: [], lastUpdatedAt: 0 };
        const lastUpdatedText = cs.lastUpdatedAt
            ? new Date(cs.lastUpdatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'not set yet';

        const historyRows = (cs.history && cs.history.length > 0)
            ? cs.history.slice().reverse().map(h => `
                <div class="flex justify-between text-[11px] py-1 border-b border-gray-100 last:border-b-0">
                    <span class="text-gray-500">${new Date(h.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span class="font-medium text-gray-700">${fmt(h.amount)}</span>
                </div>
            `).join('')
            : `<div class="text-[11px] text-gray-400 italic py-1">No history yet.</div>`;

        return `
            <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div class="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <h3 class="text-base font-bold">🛡️ Emergency Fund</h3>
                    <button onclick="document.getElementById('emergency-fund-modal').remove()" aria-label="Close" title="Close" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">×</button>
                </div>
                <div class="p-4 overflow-y-auto flex-1 space-y-3">

                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-semibold text-gray-700">Coverage</span>
                            <span class="text-2xl font-bold text-blue-700">${ef.monthlyEssentials > 0 ? ef.months.toFixed(1) : '—'}<span class="text-sm text-gray-500"> months</span></span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style="width: ${progressPct}%"></div>
                        </div>
                        <div class="flex justify-between text-[10px] text-gray-500 mt-1">
                            <span>0</span>
                            <span>${this.EMERGENCY_FUND_MIN_MONTHS} mo (min)</span>
                            <span>${this.EMERGENCY_FUND_TARGET_MONTHS} mo (target)</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                            <div class="text-[10px] uppercase tracking-wide text-blue-600 font-semibold">Total liquid</div>
                            <div class="text-base font-bold text-blue-900">${fmt(ef.liquid)}</div>
                            <div class="text-[10px] text-blue-700 mt-0.5">cash + flagged investments</div>
                        </div>
                        <div class="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                            <div class="text-[10px] uppercase tracking-wide text-purple-600 font-semibold">Essentials/mo</div>
                            <div class="text-base font-bold text-purple-900">${ef.monthlyEssentials > 0 ? fmt(ef.monthlyEssentials) : '—'}</div>
                            <div class="text-[10px] text-purple-700 mt-0.5">recurring + EMIs + avg other spend</div>
                        </div>
                    </div>

                    ${ef.monthlyEssentials > 0 ? `
                    <!-- Essentials breakdown — what the EF is sized to cover -->
                    <div class="bg-white border border-purple-200 rounded-lg p-3">
                        <div class="text-xs font-bold text-purple-800 mb-2">What you'd still owe each month with zero income</div>
                        <div class="space-y-1.5 text-xs">
                            <div class="flex justify-between">
                                <span class="text-gray-700">Recurring payments <span class="text-[10px] text-gray-500">(this month)</span></span>
                                <span class="font-semibold text-gray-900">${fmt(ef.essentialsBreakdown.recurring)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-700">Loans &amp; credit-card EMIs <span class="text-[10px] text-gray-500">(this month)</span></span>
                                <span class="font-semibold text-gray-900">${fmt(ef.essentialsBreakdown.emis)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-700">Other spend <span class="text-[10px] text-gray-500">(${ef.essentialsBreakdown.monthsSampledForOther || 0}-mo avg)</span></span>
                                <span class="font-semibold text-gray-900">${fmt(ef.essentialsBreakdown.otherSpend)}</span>
                            </div>
                            <div class="flex justify-between pt-1.5 mt-1.5 border-t border-purple-100">
                                <span class="font-bold text-purple-800">Total / month</span>
                                <span class="font-bold text-purple-900">${fmt(ef.monthlyEssentials)}</span>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Cash & Savings editor -->
                    <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <div class="text-xs font-bold text-emerald-800">💰 Cash & Savings</div>
                                <div class="text-[10px] text-emerald-700">Savings account, sweep, cash on hand</div>
                            </div>
                            <span class="text-[10px] text-emerald-600">updated ${lastUpdatedText}</span>
                        </div>
                        <div class="flex gap-2">
                            <div class="flex-1 relative">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 text-sm pointer-events-none">₹</span>
                                <input type="number" id="cash-savings-input" min="0" step="0.01"
                                       value="${cs.current || ''}"
                                       placeholder="0"
                                       class="w-full pl-7 pr-2 py-2 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                       onkeydown="if(event.key==='Enter') FinancialHealth.saveCashSavingsFromModal()">
                            </div>
                            <button onclick="FinancialHealth.saveCashSavingsFromModal()"
                                    class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors">
                                Save
                            </button>
                        </div>
                        ${cs.history && cs.history.length > 0 ? `
                            <details class="mt-2">
                                <summary class="text-[10px] text-emerald-700 cursor-pointer hover:text-emerald-900">📜 Last ${cs.history.length} change${cs.history.length > 1 ? 's' : ''}</summary>
                                <div class="mt-1.5 bg-white rounded p-2 border border-emerald-100">
                                    ${historyRows}
                                </div>
                            </details>
                        ` : ''}
                    </div>

                    <!-- Flagged investments -->
                    <div class="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-1">
                            <div class="text-xs font-bold text-cyan-800">📈 Flagged investments</div>
                            <span class="text-xs font-bold text-cyan-900">${fmt(ef.flaggedTotal)}</span>
                        </div>
                        <div class="text-[10px] text-cyan-700 mb-2">Tick "Part of my emergency fund" on an FD or non-ELSS MF to include it.</div>
                        <div class="bg-white rounded p-2 border border-cyan-100">
                            ${flaggedRows}
                        </div>
                    </div>

                    <div class="bg-${statusCopy.color}-50 border border-${statusCopy.color}-200 rounded-lg p-3">
                        <div class="flex items-start gap-2">
                            <span class="text-lg leading-none">${statusCopy.emoji}</span>
                            <div class="flex-1">
                                <div class="text-xs font-bold text-${statusCopy.color}-800 mb-1">${statusCopy.title}</div>
                                <div class="text-[11px] text-${statusCopy.color}-700 leading-relaxed">${statusCopy.message}</div>
                            </div>
                        </div>
                    </div>

                    ${ef.monthlyEssentials === 0 ? `
                        <div class="text-[11px] text-gray-500 leading-relaxed bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                            <strong class="text-amber-800">No essentials data yet:</strong> add recurring payments, loans/EMIs, or at least one full month of expenses. The emergency-fund target will then calibrate to what you'd still owe with zero income.
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Save cash & savings entered in the modal, refresh the modal body,
     * and re-render the dashboard tile so its number stays in sync.
     */
    saveCashSavingsFromModal() {
        const input = document.getElementById('cash-savings-input');
        if (!input) return;
        const value = parseFloat(input.value);
        if (isNaN(value) || value < 0) {
            if (window.Utils && window.Utils.showError) {
                window.Utils.showError('Enter a valid non-negative amount');
            }
            return;
        }
        try {
            this.updateCashSavings(value);
            if (window.Utils && window.Utils.showSuccess) {
                window.Utils.showSuccess('Cash & savings updated');
            }
            // Refresh modal body and the dashboard tile.
            const modal = document.getElementById('emergency-fund-modal');
            if (modal) modal.innerHTML = this._renderEmergencyFundModalBody();
            if (window.Dashboard && typeof window.Dashboard.render === 'function') {
                window.Dashboard.render();
            }
        } catch (e) {
            if (window.Utils && window.Utils.showError) {
                window.Utils.showError(e.message || 'Failed to update');
            }
        }
    },
};

window.FinancialHealth = FinancialHealth;
