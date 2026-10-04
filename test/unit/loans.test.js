/**
 * Unit tests for Loans module
 * Tests EMI calculations and remaining balance logic
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Loans Module', () => {
  let Loans;

  beforeAll(() => {
    Loans = loadModule('modules/loans.js', 'Loans');
  });

  describe('calculateEMI', () => {
    it('calculates EMI correctly for 12% annual rate over 12 months', () => {
      // Principal: 100,000, Annual Rate: 12%, Tenure: 12 months
      // Monthly rate: (12/12)/100 = 0.01
      // Power term: (1.01)^12 = 1.126825...
      // EMI = 100000 * 0.01 * 1.126825 / (1.126825 - 1)
      //     = 100000 * 0.01 * 1.126825 / 0.126825
      //     ≈ 8884.88
      const emi = Loans.calculateEMI(100000, 12, 12);
      expect(emi).toBeCloseTo(8884.88, 2);
    });

    it('calculates EMI correctly for zero interest', () => {
      // Principal: 120,000, Rate: 0%, Tenure: 12 months
      // Should return principal / tenure = 10,000
      const emi = Loans.calculateEMI(120000, 0, 12);
      expect(emi).toBe(10000);
    });

    it('calculates EMI for different rate and tenure', () => {
      // Principal: 500,000, Annual Rate: 8%, Tenure: 24 months
      // Monthly rate: (8/12)/100 = 0.006666...
      // Power term: (1.006666...)^24 ≈ 1.173511
      // EMI = 500000 * 0.006666... * 1.173511 / 0.173511
      //     ≈ 22613.65 (verified with actual formula)
      const emi = Loans.calculateEMI(500000, 8, 24);
      expect(emi).toBeCloseTo(22613.65, 2);
    });
  });

  describe('calculateTotalAmount', () => {
    it('calculates total amount correctly', () => {
      const emi = 8884.88;
      const tenure = 12;
      const total = Loans.calculateTotalAmount(emi, tenure);
      expect(total).toBeCloseTo(106618.56, 2);
    });
  });

  describe('calculateTotalInterest', () => {
    it('calculates total interest correctly', () => {
      const totalAmount = 106618.56;
      const principal = 100000;
      const interest = Loans.calculateTotalInterest(totalAmount, principal);
      expect(interest).toBeCloseTo(6618.56, 2);
    });
  });

  describe('calculateRemaining', () => {
    it('returns zero paid for future-dated loan', () => {
      // Loan starts in the future
      const remaining = Loans.calculateRemaining(
        '2099-01-15',
        100000,
        12,
        12
      );

      expect(remaining.emisPaid).toBe(0);
      expect(remaining.emisRemaining).toBe(12);
      expect(remaining.remainingBalance).toBeCloseTo(100000, 2);
      expect(remaining.totalRemainingPayment).toBeGreaterThan(0);
    });

    it('returns zero remaining for fully-past loan', () => {
      // Loan started long ago, fully paid
      const remaining = Loans.calculateRemaining(
        '2000-01-15',
        100000,
        12,
        12
      );

      expect(remaining.emisRemaining).toBe(0);
      expect(remaining.remainingBalance).toBe(0);
      expect(remaining.totalRemainingPayment).toBe(0);
    });

    it('calculates mid-life balance with fake timers', () => {
      // Use fake timers for deterministic date
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-07-15'));

      // Loan started 2024-01-15, so 7 months elapsed
      const principal = 100000;
      const annualRate = 12;
      const tenure = 12;
      const monthlyRate = 0.01;

      const remaining = Loans.calculateRemaining(
        '2024-01-15',
        principal,
        annualRate,
        tenure
      );

      // Hand-computed: P*((1+r)^n-(1+r)^p)/((1+r)^n-1)
      // p=7, n=12, r=0.01
      // factor1 = (1.01)^12 ≈ 1.126825
      // factor2 = (1.01)^7 ≈ 1.0721354
      // remainingBalance = 100000 * (1.126825 - 1.0721354) / (1.126825 - 1)
      //                  = 100000 * 0.0546897 / 0.126825 ≈ 43122.15

      expect(remaining.emisPaid).toBe(7);
      expect(remaining.emisRemaining).toBe(5);
      expect(remaining.remainingBalance).toBeCloseTo(43122.15, 2);

      vi.useRealTimers();
    });

    it('counts the final EMI as paid on the closure day (24/24, 0 remaining)', () => {
      // 24-month loan, first EMI 2024-10-07 → last (24th) EMI 2026-09-07.
      // On 2026-10-01 all 24 EMIs are done.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01'));
      const r = Loans.calculateRemaining('2024-10-07', 500000, 10, 24);
      expect(r.emisPaid).toBe(24);
      expect(r.emisRemaining).toBe(0);
      expect(r.remainingBalance).toBe(0);
      vi.useRealTimers();
    });
  });

  describe('calculateClosureDate', () => {
    it('returns the date of the LAST EMI (first + tenure-1 months), not one past it', () => {
      // First EMI 2024-10-07, 24 months → 24th EMI on 2026-09-07.
      const closure = Loans.calculateClosureDate('2024-10-07', 24);
      expect(closure.getFullYear()).toBe(2026);
      expect(closure.getMonth()).toBe(8); // September (0-indexed)
      expect(closure.getDate()).toBe(7);
    });

    it('a single-EMI loan closes on its first EMI date', () => {
      const closure = Loans.calculateClosureDate('2026-05-10', 1);
      expect(closure.getFullYear()).toBe(2026);
      expect(closure.getMonth()).toBe(4); // May
      expect(closure.getDate()).toBe(10);
    });
  });

  describe('hasEmiDueInMonth', () => {
    // 24-month loan, first EMI 2024-10-07 → EMIs fall Oct 2024 … Sep 2026.
    const first = '2024-10-07';
    const tenure = 24;

    it('is true for a month within the schedule', () => {
      expect(Loans.hasEmiDueInMonth(first, tenure, 2026, 8)).toBe(true); // Sep 2026 = last EMI
    });

    it('is false for the month AFTER the final EMI (the reported bug)', () => {
      // The loan is done after Sep 2026 — October 2026 must NOT carry an EMI.
      expect(Loans.hasEmiDueInMonth(first, tenure, 2026, 9)).toBe(false); // Oct 2026
      expect(Loans.hasEmiDueInMonth(first, tenure, 2026, 10)).toBe(false); // Nov 2026
    });

    it('is false before the loan has started', () => {
      expect(Loans.hasEmiDueInMonth(first, tenure, 2024, 8)).toBe(false); // Sep 2024
    });

    it('is true for the first EMI month', () => {
      expect(Loans.hasEmiDueInMonth(first, tenure, 2024, 9)).toBe(true); // Oct 2024
    });
  });

  describe('emisPaidAsOf', () => {
    it('counts EMIs paid up to a reference date (not yet reached the day)', () => {
      // first EMI 15th; on the 10th of a later month that month's EMI isn't paid.
      expect(Loans.emisPaidAsOf('2024-01-15', 12, new Date('2024-03-10'))).toBe(2);
      // On/after the 15th it counts.
      expect(Loans.emisPaidAsOf('2024-01-15', 12, new Date('2024-03-15'))).toBe(3);
    });

    it('never exceeds tenure or goes negative', () => {
      expect(Loans.emisPaidAsOf('2024-01-15', 12, new Date('2030-01-01'))).toBe(12);
      expect(Loans.emisPaidAsOf('2024-01-15', 12, new Date('2020-01-01'))).toBe(0);
    });
  });
});
