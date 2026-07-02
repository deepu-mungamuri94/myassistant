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
  });
});
