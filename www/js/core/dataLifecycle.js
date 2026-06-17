/**
 * Data lifecycle / roll-off.
 *
 * Everything lives in ONE localStorage blob (`myassistant_db`). The two
 * collections that grow without bound are `expenses` and `cardBills`. Left
 * alone they eventually trip the localStorage quota and saves start failing.
 *
 * This module provides:
 *   - estimate():   how big the blob is and which collections dominate.
 *   - summarize():  how many records are old enough to safely roll off.
 *   - prune():      actually remove old records (explicit call only).
 *
 * Safety rules (deliberately conservative — this is financial data):
 *   - Default retention is 7 years (matches common tax record-keeping advice).
 *   - Card bills are pruned ONLY if they are paid/cleared. Unpaid bills are
 *     still actionable and are never removed by age.
 *   - Nothing runs automatically. The caller must invoke prune() after the
 *     user confirms, so we never silently delete history.
 */
const DataLifecycle = {
    DEFAULT_RETENTION_YEARS: 7,
    MS_PER_YEAR: 365.25 * 24 * 60 * 60 * 1000,

    /** Approximate byte size of the persisted DB and its largest collections. */
    estimate() {
        const sizeOf = (v) => {
            try { return new Blob([JSON.stringify(v ?? null)]).size; }
            catch (_) { return (JSON.stringify(v ?? '') || '').length; }
        };
        const db = window.DB || {};
        const total = sizeOf(db);
        const collections = {};
        Object.keys(db).forEach(k => {
            if (Array.isArray(db[k])) collections[k] = { count: db[k].length, bytes: sizeOf(db[k]) };
        });
        return {
            totalBytes: total,
            totalKB: Math.round(total / 1024),
            totalMB: +(total / (1024 * 1024)).toFixed(2),
            collections
        };
    },

    _cutoffMs(years) {
        const y = Number.isFinite(years) ? years : this.DEFAULT_RETENTION_YEARS;
        return Date.now() - y * this.MS_PER_YEAR;
    },

    /** Parse a YYYY-MM-DD or ISO date/epoch into ms, or NaN if unusable. */
    _toMs(value) {
        if (value == null) return NaN;
        if (typeof value === 'number') return value;
        const t = Date.parse(value);
        return Number.isNaN(t) ? NaN : t;
    },

    _expenseAgeMs(e) {
        // Prefer the user-entered date; fall back to createdAt.
        const t = this._toMs(e.date);
        return Number.isNaN(t) ? this._toMs(e.createdAt) : t;
    },

    _billAgeMs(b) {
        // Use whatever marks when the bill was settled / due.
        const t = this._toMs(b.paidAt);
        if (!Number.isNaN(t)) return t;
        const due = this._toMs(b.dueDate);
        if (!Number.isNaN(due)) return due;
        return this._toMs(b.parsedAt);
    },

    _isBillPrunable(b) {
        // Only paid/cleared bills are eligible for age-based roll-off.
        return !!(b && (b.isPaid || b.cleared));
    },

    /** Count records eligible for roll-off without removing anything. */
    summarize(years = this.DEFAULT_RETENTION_YEARS) {
        const cutoff = this._cutoffMs(years);
        const expenses = (window.DB.expenses || []).filter(e => {
            const t = this._expenseAgeMs(e);
            return !Number.isNaN(t) && t < cutoff;
        }).length;
        const cardBills = (window.DB.cardBills || []).filter(b => {
            if (!this._isBillPrunable(b)) return false;
            const t = this._billAgeMs(b);
            return !Number.isNaN(t) && t < cutoff;
        }).length;
        return {
            retentionYears: years,
            cutoffISO: new Date(cutoff).toISOString(),
            expenses,
            cardBills,
            total: expenses + cardBills
        };
    },

    /**
     * Remove old records. EXPLICIT call only — confirm with the user first.
     * Persists immediately (flush) so freed space is realized right away.
     * @returns {{expensesRemoved:number, cardBillsRemoved:number}}
     */
    prune(years = this.DEFAULT_RETENTION_YEARS) {
        const cutoff = this._cutoffMs(years);

        let expensesRemoved = 0;
        if (Array.isArray(window.DB.expenses)) {
            const before = window.DB.expenses.length;
            window.DB.expenses = window.DB.expenses.filter(e => {
                const t = this._expenseAgeMs(e);
                return Number.isNaN(t) || t >= cutoff; // keep undated + recent
            });
            expensesRemoved = before - window.DB.expenses.length;
        }

        let cardBillsRemoved = 0;
        if (Array.isArray(window.DB.cardBills)) {
            const before = window.DB.cardBills.length;
            window.DB.cardBills = window.DB.cardBills.filter(b => {
                if (!this._isBillPrunable(b)) return true; // never drop unpaid bills
                const t = this._billAgeMs(b);
                return Number.isNaN(t) || t >= cutoff;
            });
            cardBillsRemoved = before - window.DB.cardBills.length;
        }

        if (expensesRemoved || cardBillsRemoved) {
            if (window.Storage && typeof window.Storage.flush === 'function') {
                window.Storage.flush();
            } else if (window.Storage) {
                window.Storage.save();
            }
        }
        console.log(`[DataLifecycle] Pruned ${expensesRemoved} expenses, ${cardBillsRemoved} card bills (>${years}y old)`);
        return { expensesRemoved, cardBillsRemoved };
    }
};

window.DataLifecycle = DataLifecycle;
