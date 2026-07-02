/**
 * Unit tests for Income module
 * Tests salary calculations, payslip logic, and tax computations
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Income Module', () => {
  let Income;

  beforeAll(() => {
    Income = loadModule('modules/income.js', 'Income');
  });

  beforeEach(() => {
    // Reset DB.income to force getData() to rebuild real defaults
    window.DB.income = undefined;
  });

  describe('calculateBasic', () => {
    it('calculates basic as 40% of CTC', () => {
      const ctc = 1000000;
      const basic = Income.calculateBasic(ctc);
      expect(basic).toBe(400000);
    });

    it('handles different CTC values', () => {
      expect(Income.calculateBasic(1200000)).toBe(480000);
      expect(Income.calculateBasic(800000)).toBe(320000);
    });
  });

  describe('getMonthlyBasic', () => {
    it('calculates monthly basic correctly', () => {
      const ctc = 1200000;
      const monthlyBasic = Income.getMonthlyBasic(ctc);
      // Basic = 40% of 1200000 = 480000
      // Monthly = 480000 / 12 = 40000
      expect(monthlyBasic).toBe(40000);
    });
  });

  describe('getMonthlyHRA', () => {
    it('calculates HRA as 50% of monthly basic', () => {
      const ctc = 1200000;
      const hra = Income.getMonthlyHRA(ctc);
      // Monthly basic = 40000, HRA = 20000
      expect(hra).toBe(20000);
    });
  });

  describe('getMonthlyEmployerPF', () => {
    it('calculates employer PF with default 12%', () => {
      const ctc = 1200000;
      const pf = Income.getMonthlyEmployerPF(ctc);
      // Basic = 480000, 12% = 57600, monthly = 4800
      expect(pf).toBe(4800);
    });

    it('calculates employer PF with custom percentage', () => {
      const ctc = 1200000;
      const pf = Income.getMonthlyEmployerPF(ctc, 10);
      // Basic = 480000, 10% = 48000, monthly = 4000
      expect(pf).toBe(4000);
    });
  });

  describe('getMonthlyGrossEarnings', () => {
    it('calculates gross earnings (CTC/12 - employer PF)', () => {
      const ctc = 1200000;
      const gross = Income.getMonthlyGrossEarnings(ctc, 12);
      // CTC per month = 100000
      // Employer PF = 4800
      // Gross = 95200
      expect(gross).toBe(95200);
    });
  });

  describe('calculateIncomeTax', () => {
    it('calculates tax breakdown for CTC 1,200,000 with exact hand-computed values', () => {
      const ctc = 1200000;
      const taxInfo = Income.calculateIncomeTax(ctc);

      // Hand-computed with default slabs (0/4L, 5% 4-8L, 10% 8-12L, ...):
      // employerPF annual = (1200000*0.40)*12/100 = 57,600 → fully exempt (<7.5L)
      // taxableIncome = 1,200,000 − 57,600 − 75,000 = 1,067,400
      // 5% band (400k→800k): 400,000 × 0.05 = 20,000
      // 10% band (800k→1,067,400): 267,400 × 0.10 = 26,740
      // baseTax = 46,740 ; surcharge = 0 ; cess = 4% × 46,740 = 1,869.60
      // totalTax = 48,609.60

      expect(taxInfo.baseTax).toBeCloseTo(46740, 2);
      expect(taxInfo.surcharge).toBe(0);
      expect(taxInfo.cess).toBeCloseTo(1869.6, 1);
      expect(taxInfo.totalTax).toBeCloseTo(48609.6, 1);
      expect(taxInfo.taxableIncome).toBeCloseTo(1067400, 2);
    });

    it('calculates tax for low-income CTC 500,000 with exact hand-computed values', () => {
      const ctc = 500000;
      const taxInfo = Income.calculateIncomeTax(ctc);

      // Hand-computed:
      // employerPF annual = (500000*0.40)*12/100 = 24,000 → exempt
      // taxableIncome = 500,000 − 24,000 − 75,000 = 401,000
      // 5% band (400k→401k): 1,000 × 0.05 = 50
      // baseTax = 50 ; surcharge = 0 ; cess = 4% × 50 = 2
      // totalTax = 52

      expect(taxInfo.baseTax).toBeCloseTo(50, 2);
      expect(taxInfo.surcharge).toBe(0);
      expect(taxInfo.cess).toBeCloseTo(2, 1);
      expect(taxInfo.totalTax).toBeCloseTo(52, 1);
      expect(taxInfo.taxableIncome).toBeCloseTo(401000, 2);
    });
  });

  describe('calculatePayslip', () => {
    it('calculates complete payslip with exact hand-computed netPay', () => {
      const ctc = 1200000;
      const bonusPercent = 10;
      const esppCycle1 = 5;
      const esppCycle2 = 5;
      const pfPercent = 12;

      const payslip = Income.calculatePayslip(ctc, bonusPercent, esppCycle1, esppCycle2, pfPercent);

      // Hand-computed:
      // grossEarnings = 1,200,000/12 − 4,800 = 95,200
      // basicPay = 40,000 ; hra = 20,000
      // incomeTax/mo = 48,609.60/12 = 4,050.80
      // professionalTax = 200
      // avgEspp = 5% of 95,200 = 4,760
      // pfEmployee = (480000*12/100)/12 = 4,800
      // grossDeductions = 4,050.80 + 200 + 4,760 + 4,800 = 13,810.80
      // netPay = 95,200 − 13,810.80 = 81,389.20

      expect(payslip.basicPay).toBe(40000);
      expect(payslip.hra).toBe(20000);
      expect(payslip.grossEarnings).toBe(95200);
      expect(payslip.professionalTax).toBe(200);
      expect(payslip.pfEmployee).toBe(4800);
      expect(payslip.espp).toBeCloseTo(4760, 1);
      expect(payslip.incomeTax).toBeCloseTo(4050.8, 1);
      expect(payslip.grossDeductions).toBeCloseTo(13810.8, 1);
      expect(payslip.netPay).toBeCloseTo(81389.2, 1);
    });
  });
});
