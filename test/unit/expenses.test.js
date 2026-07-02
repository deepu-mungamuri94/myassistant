const { loadModule } = require('../helpers/loadModule.js');

describe('Expenses Module', () => {
  let Expenses;

  beforeAll(() => {
    Expenses = loadModule('modules/expenses.js', 'Expenses');
  });

  beforeEach(() => {
    window.DB = {
      expenses: [],
      cards: [],
      loans: [],
      recurringExpenses: [],
      dismissedRecurringExpenses: []
    };
    window.Storage = { save: vi.fn(), flush: vi.fn() };
    window.Utils = {
      generateId: (() => { let c = 0; return vi.fn(() => 'test-id-' + (++c)); })(),
      getCurrentTimestamp: vi.fn(() => '2024-01-01T00:00:00.000Z'),
      formatIndianNumber: vi.fn(n => String(n)),
      escapeHtml: vi.fn(s => s),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      showInfo: vi.fn(),
      formatCurrency: vi.fn(n => `₹${n}`),
      formatDate: vi.fn(d => d),
      formatLocalDate: vi.fn(d => {
        const date = new Date(d);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      })
    };
    document.getElementById = vi.fn(() => null);
    document.querySelector = vi.fn(() => null);
    document.querySelectorAll = vi.fn(() => []);
  });

  describe('add()', () => {
    it('should add a new expense with all required fields', () => {
      const expense = Expenses.add('Groceries', 1500, 'Food & Dining', '2024-01-15');

      expect(expense).toBeDefined();
      expect(expense.id).toMatch(/^test-id-\d+$/);
      expect(expense.title).toBe('Groceries');
      expect(expense.amount).toBe(1500);
      expect(expense.category).toBe('Food & Dining');
      expect(expense.date).toBe('2024-01-15');
      expect(expense.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(window.DB.expenses).toHaveLength(1);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should add expense with optional fields', () => {
      const expense = Expenses.add(
        'Coffee',
        250,
        'Food & Dining',
        '2024-01-15',
        'Morning coffee',
        'HDFC Credit Card',
        'Team Outing',
        'want'
      );

      expect(expense.description).toBe('Morning coffee');
      expect(expense.suggestedCard).toBe('HDFC Credit Card');
      expect(expense.event).toBe('Team Outing');
      expect(expense.needWant).toBe('want');
    });

    it('should set defaults for optional fields', () => {
      const expense = Expenses.add('Taxi', 200, 'Transportation', '2024-01-15');

      expect(expense.description).toBe('');
      expect(expense.event).toBeNull();
      expect(expense.needWant).toBeNull();
    });

    it('should parse amount as float', () => {
      const expense = Expenses.add('Test', '1234.56', 'Other', '2024-01-15');

      expect(expense.amount).toBe(1234.56);
      expect(typeof expense.amount).toBe('number');
    });

    it('should throw error if title is missing', () => {
      expect(() => {
        Expenses.add('', 100, 'Food', '2024-01-15');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error if amount is missing', () => {
      expect(() => {
        Expenses.add('Test', null, 'Food', '2024-01-15');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error if category is missing', () => {
      expect(() => {
        Expenses.add('Test', 100, '', '2024-01-15');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error if date is missing', () => {
      expect(() => {
        Expenses.add('Test', 100, 'Food', null);
      }).toThrow('Please fill in all required fields');
    });
  });

  describe('update()', () => {
    it('should update expense title', () => {
      const expense = Expenses.add('Old Title', 100, 'Food', '2024-01-15');
      const updated = Expenses.update(expense.id, { title: 'New Title' });

      expect(updated.title).toBe('New Title');
      expect(updated.amount).toBe(100);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should update expense amount', () => {
      const expense = Expenses.add('Test', 100, 'Food', '2024-01-15');
      const updated = Expenses.update(expense.id, { amount: '250.50' });

      expect(updated.amount).toBe(250.50);
      expect(typeof updated.amount).toBe('number');
    });

    it('should update multiple fields at once', () => {
      const expense = Expenses.add('Test', 100, 'Food', '2024-01-15');
      const updated = Expenses.update(expense.id, {
        title: 'Updated',
        amount: 200,
        category: 'Shopping',
        description: 'New description',
        event: 'Birthday Party',
        needWant: 'need'
      });

      expect(updated.title).toBe('Updated');
      expect(updated.amount).toBe(200);
      expect(updated.category).toBe('Shopping');
      expect(updated.description).toBe('New description');
      expect(updated.event).toBe('Birthday Party');
      expect(updated.needWant).toBe('need');
    });

    it('should set event to null if empty string provided', () => {
      const expense = Expenses.add('Test', 100, 'Food', '2024-01-15', '', null, 'Event1');
      const updated = Expenses.update(expense.id, { event: '' });

      expect(updated.event).toBeNull();
    });

    it('should set needWant to null if empty string provided', () => {
      const expense = Expenses.add('Test', 100, 'Food', '2024-01-15', '', null, null, 'want');
      const updated = Expenses.update(expense.id, { needWant: '' });

      expect(updated.needWant).toBeNull();
    });

    it('should throw error when expense ID not found', () => {
      expect(() => {
        Expenses.update('non-existent-id', { title: 'Test' });
      }).toThrow('Expense not found');
    });

    it('should not update fields that are not provided', () => {
      const expense = Expenses.add('Test', 100, 'Food', '2024-01-15', 'Description');
      const updated = Expenses.update(expense.id, { title: 'New Title' });

      expect(updated.title).toBe('New Title');
      expect(updated.description).toBe('Description');
      expect(updated.amount).toBe(100);
    });
  });

  describe('delete()', () => {
    it('should delete expense from array', () => {
      const expense1 = Expenses.add('Test1', 100, 'Food', '2024-01-15');
      const expense2 = Expenses.add('Test2', 200, 'Shopping', '2024-01-16');

      Expenses.delete(expense2.id);

      expect(window.DB.expenses).toHaveLength(1);
      expect(window.DB.expenses[0].id).toBe(expense1.id);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should handle deletion of non-existent expense', () => {
      Expenses.add('Test', 100, 'Food', '2024-01-15');

      expect(() => {
        Expenses.delete('non-existent-id');
      }).not.toThrow();

      expect(window.DB.expenses).toHaveLength(1);
    });

    it('should mark auto-recurring expense as dismissed on delete', () => {
      const expense = Expenses.add('HDFC Home EMI', 15000, 'emi', '2024-01-15');

      Expenses.delete(expense.id);

      expect(window.DB.dismissedRecurringExpenses).toHaveLength(1);
      expect(window.DB.dismissedRecurringExpenses[0].title).toBe('HDFC Home EMI');
      expect(window.DB.dismissedRecurringExpenses[0].date).toBe('2024-01-15');
      expect(window.DB.dismissedRecurringExpenses[0].amount).toBe(15000);
      expect(window.DB.dismissedRecurringExpenses[0].dismissedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should remove month from recurring expense addedToExpenses on delete', () => {
      window.RecurringExpenses = {}; // Must be truthy for the branch to execute
      const recurringExpense = {
        id: 'rec-1',
        name: 'Netflix',
        addedToExpenses: ['2024-01', '2024-02']
      };
      window.DB.recurringExpenses.push(recurringExpense);

      const expense = Expenses.add('Netflix', 499, 'Entertainment', '2024-02-15');
      // Must set these on the stored expense object in DB
      const storedExpense = window.DB.expenses.find(e => e.id === expense.id);
      storedExpense.recurringId = 'rec-1';
      storedExpense.isRecurring = true;

      Expenses.delete(storedExpense.id);

      expect(recurringExpense.addedToExpenses).toEqual(['2024-01']);
    });

    it('should handle deletion of card EMI expense', () => {
      const expense = Expenses.add('Card EMI: iPhone', 5000, 'emi', '2024-01-15');
      expense.suggestedCard = 'HDFC Credit Card';

      Expenses.delete(expense.id);

      expect(window.DB.dismissedRecurringExpenses).toHaveLength(1);
      expect(window.DB.expenses).toHaveLength(0);
    });
  });

  describe('getById()', () => {
    it('should return expense by ID', () => {
      const expense1 = Expenses.add('Test1', 100, 'Food', '2024-01-15');
      const expense2 = Expenses.add('Test2', 200, 'Shopping', '2024-01-16');

      const found = Expenses.getById(expense1.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(expense1.id);
      expect(found.title).toBe('Test1');
    });

    it('should return undefined when ID not found', () => {
      Expenses.add('Test', 100, 'Food', '2024-01-15');

      const found = Expenses.getById('non-existent-id');

      expect(found).toBeUndefined();
    });

    it('should return undefined when expenses array is empty', () => {
      const found = Expenses.getById('test-id');

      expect(found).toBeUndefined();
    });
  });

  describe('getByDateRange()', () => {
    beforeEach(() => {
      Expenses.add('Jan 10', 100, 'Food', '2024-01-10');
      Expenses.add('Jan 15', 200, 'Shopping', '2024-01-15');
      Expenses.add('Jan 20', 300, 'Transport', '2024-01-20');
      Expenses.add('Feb 5', 400, 'Food', '2024-02-05');
      Expenses.add('Feb 15', 500, 'Shopping', '2024-02-15');
    });

    it('should filter expenses within date range', () => {
      const filtered = Expenses.getByDateRange('2024-01-01', '2024-01-31');

      expect(filtered).toHaveLength(3);
      expect(filtered.every(e => e.date >= '2024-01-01' && e.date <= '2024-01-31')).toBe(true);
    });

    it('should include expenses on boundary dates', () => {
      const filtered = Expenses.getByDateRange('2024-01-15', '2024-02-05');

      expect(filtered).toHaveLength(3);
      expect(filtered.some(e => e.date === '2024-01-15')).toBe(true);
      expect(filtered.some(e => e.date === '2024-02-05')).toBe(true);
    });

    it('should return empty array when no expenses in range', () => {
      const filtered = Expenses.getByDateRange('2024-03-01', '2024-03-31');

      expect(filtered).toHaveLength(0);
    });

    it('should return all expenses for wide date range', () => {
      const filtered = Expenses.getByDateRange('2024-01-01', '2024-12-31');

      expect(filtered).toHaveLength(5);
    });
  });

  describe('getByCategory()', () => {
    beforeEach(() => {
      Expenses.add('Groceries', 1500, 'Food & Dining', '2024-01-10');
      Expenses.add('Shirt', 800, 'Shopping', '2024-01-15');
      Expenses.add('Coffee', 200, 'Food & Dining', '2024-01-20');
      Expenses.add('Book', 500, 'Shopping', '2024-02-05');
      Expenses.add('Uber', 300, 'Transportation', '2024-02-15');
    });

    it('should filter expenses by category', () => {
      const foodExpenses = Expenses.getByCategory('Food & Dining');

      expect(foodExpenses).toHaveLength(2);
      expect(foodExpenses.every(e => e.category === 'Food & Dining')).toBe(true);
    });

    it('should return empty array for category with no expenses', () => {
      const filtered = Expenses.getByCategory('Entertainment');

      expect(filtered).toHaveLength(0);
    });

    it('should handle case-sensitive category names', () => {
      const filtered = Expenses.getByCategory('food & dining');

      expect(filtered).toHaveLength(0);
    });
  });

  describe('getTotalAmount()', () => {
    it('should calculate sum of all expenses', () => {
      Expenses.add('Expense1', 100, 'Food', '2024-01-10');
      Expenses.add('Expense2', 200.50, 'Shopping', '2024-01-15');
      Expenses.add('Expense3', 300.25, 'Transport', '2024-01-20');

      const total = Expenses.getTotalAmount();

      expect(total).toBe(600.75);
    });

    it('should return 0 for empty expenses array', () => {
      const total = Expenses.getTotalAmount();

      expect(total).toBe(0);
    });

    it('should calculate sum of provided expenses array', () => {
      const expenses = [
        { amount: 100 },
        { amount: 200 },
        { amount: 300 }
      ];

      const total = Expenses.getTotalAmount(expenses);

      expect(total).toBe(600);
    });

    it('should handle decimal amounts correctly', () => {
      Expenses.add('Test1', 10.50, 'Food', '2024-01-10');
      Expenses.add('Test2', 20.75, 'Shopping', '2024-01-15');

      const total = Expenses.getTotalAmount();

      expect(total).toBeCloseTo(31.25, 2);
    });
  });

  describe('getFilteredExpenses()', () => {
    beforeEach(() => {
      Expenses.add('Jan 10', 100, 'Food', '2024-01-10');
      Expenses.add('Jan 15', 200, 'Shopping', '2024-01-15');
      Expenses.add('Feb 5', 300, 'Transport', '2024-02-05');
      Expenses.add('Coffee Morning', 50, 'Food', '2024-01-12');
    });

    it('should filter by date range for day-based filters', () => {
      Expenses.startDate = '2024-01-10';
      Expenses.endDate = '2024-01-15';

      const filtered = Expenses.getFilteredExpenses();

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(e => e.date >= '2024-01-10' && e.date <= '2024-01-15')).toBe(true);
    });

    it('should filter by search term in title', () => {
      Expenses.startDate = null;
      Expenses.endDate = null;
      Expenses.searchTerm = 'coffee';

      const filtered = Expenses.getFilteredExpenses();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Coffee Morning');
    });

    it('should filter by search term in description', () => {
      const expense = Expenses.add('Taxi', 200, 'Transport', '2024-01-10', 'airport ride');
      Expenses.searchTerm = 'airport';

      const filtered = Expenses.getFilteredExpenses();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].description).toBe('airport ride');
    });

    it('should filter by search term in amount', () => {
      Expenses.searchTerm = '200';

      const filtered = Expenses.getFilteredExpenses();

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some(e => e.amount === 200)).toBe(true);
    });

    it('should apply both date and search filters', () => {
      Expenses.startDate = '2024-01-01';
      Expenses.endDate = '2024-01-31';
      Expenses.searchTerm = 'jan';

      const filtered = Expenses.getFilteredExpenses();

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(e => e.date >= '2024-01-01' && e.date <= '2024-01-31')).toBe(true);
      expect(filtered.every(e => e.title.toLowerCase().includes('jan'))).toBe(true);
    });

    it('should sort by date ascending', () => {
      Expenses.startDate = null;
      Expenses.endDate = null;
      Expenses.searchTerm = '';

      const filtered = Expenses.getFilteredExpenses();

      for (let i = 0; i < filtered.length - 1; i++) {
        expect(new Date(filtered[i].date).getTime()).toBeLessThanOrEqual(new Date(filtered[i + 1].date).getTime());
      }
    });

    it('should use budget month for month-based filters', () => {
      const expense = Expenses.add('Test', 100, 'Food', '2024-01-15');
      expense.budgetMonth = 2;
      expense.budgetYear = 2024;

      Expenses.startDate = '2024-02-01';
      Expenses.endDate = '2024-02-29';

      const filtered = Expenses.getFilteredExpenses();

      expect(filtered.some(e => e.id === expense.id)).toBe(true);
    });
  });

  describe('groupByMonth()', () => {
    beforeEach(() => {
      Expenses.add('Jan 10', 100, 'Food', '2024-01-10');
      Expenses.add('Jan 15', 200, 'Shopping', '2024-01-15');
      Expenses.add('Feb 5', 300, 'Transport', '2024-02-05');
      Expenses.add('Feb 10', 400, 'Food', '2024-02-10');
      Expenses.add('Mar 5', 500, 'Shopping', '2024-03-05');
    });

    it('should group expenses by budget month', () => {
      const grouped = Expenses.groupByMonth(window.DB.expenses);

      expect(grouped.length).toBe(3);
      expect(grouped.some(g => g.key === '2024-01')).toBe(true);
      expect(grouped.some(g => g.key === '2024-02')).toBe(true);
      expect(grouped.some(g => g.key === '2024-03')).toBe(true);
    });

    it('should calculate total for each month', () => {
      const grouped = Expenses.groupByMonth(window.DB.expenses);
      const janGroup = grouped.find(g => g.key === '2024-01');

      expect(janGroup.total).toBe(300);
      expect(janGroup.expenses).toHaveLength(2);
    });

    it('should sort months in descending order (newest first)', () => {
      const grouped = Expenses.groupByMonth(window.DB.expenses);

      expect(grouped[0].key).toBe('2024-03');
      expect(grouped[1].key).toBe('2024-02');
      expect(grouped[2].key).toBe('2024-01');
    });

    it('should sort expenses within each month by date ascending', () => {
      const grouped = Expenses.groupByMonth(window.DB.expenses);
      const janGroup = grouped.find(g => g.key === '2024-01');

      expect(janGroup.expenses[0].date).toBe('2024-01-10');
      expect(janGroup.expenses[1].date).toBe('2024-01-15');
    });

    it('should include month label', () => {
      const grouped = Expenses.groupByMonth(window.DB.expenses);
      const janGroup = grouped.find(g => g.key === '2024-01');

      expect(janGroup.label).toContain('January');
      expect(janGroup.label).toContain('2024');
    });

    it('should use budgetMonth if set on expense', () => {
      const expense = Expenses.add('Test', 1000, 'Food', '2024-01-15');
      expense.budgetMonth = 3;
      expense.budgetYear = 2024;

      const grouped = Expenses.groupByMonth([expense]);

      expect(grouped[0].key).toBe('2024-03');
      expect(grouped[0].expenses).toHaveLength(1);
    });

    it('should exclude loan EMI from total when includeLoansInTotal is false', () => {
      Expenses.includeLoansInTotal = false;
      window.DB.expenses = [];
      const regularExpense = Expenses.add('Food', 100, 'Food', '2024-01-15');
      const loanEMI = Expenses.add('HDFC Home EMI', 15000, 'emi', '2024-01-20');

      const grouped = Expenses.groupByMonth(window.DB.expenses);
      const janGroup = grouped.find(g => g.key === '2024-01');

      expect(janGroup.total).toBe(100);
      expect(janGroup.expenses).toHaveLength(2);
    });

    it('should include loan EMI in total when includeLoansInTotal is true', () => {
      Expenses.includeLoansInTotal = true;
      window.DB.expenses = [];
      Expenses.add('Food', 100, 'Food', '2024-01-15');
      Expenses.add('HDFC Home EMI', 15000, 'emi', '2024-01-20');

      const grouped = Expenses.groupByMonth(window.DB.expenses);
      const janGroup = grouped.find(g => g.key === '2024-01');

      expect(janGroup.total).toBe(15100);
    });
  });

  describe('getEventNames()', () => {
    it('should return unique event names', () => {
      Expenses.add('Expense1', 100, 'Food', '2024-01-10', '', null, 'Birthday Party');
      Expenses.add('Expense2', 200, 'Shopping', '2024-01-15', '', null, 'Birthday Party');
      Expenses.add('Expense3', 300, 'Transport', '2024-01-20', '', null, 'Team Outing');

      const events = Expenses.getEventNames();

      expect(events).toHaveLength(2);
      expect(events).toContain('Birthday Party');
      expect(events).toContain('Team Outing');
    });

    it('should sort event names alphabetically', () => {
      Expenses.add('Expense1', 100, 'Food', '2024-01-10', '', null, 'Zebra Event');
      Expenses.add('Expense2', 200, 'Shopping', '2024-01-15', '', null, 'Alpha Event');
      Expenses.add('Expense3', 300, 'Transport', '2024-01-20', '', null, 'Beta Event');

      const events = Expenses.getEventNames();

      expect(events).toEqual(['Alpha Event', 'Beta Event', 'Zebra Event']);
    });

    it('should trim whitespace from event names', () => {
      Expenses.add('Expense1', 100, 'Food', '2024-01-10', '', null, '  Event Name  ');

      const events = Expenses.getEventNames();

      expect(events).toEqual(['Event Name']);
    });

    it('should exclude null and empty event names', () => {
      Expenses.add('Expense1', 100, 'Food', '2024-01-10', '', null, null);
      Expenses.add('Expense2', 200, 'Shopping', '2024-01-15', '', null, '');
      Expenses.add('Expense3', 300, 'Transport', '2024-01-20', '', null, 'Valid Event');

      const events = Expenses.getEventNames();

      expect(events).toEqual(['Valid Event']);
    });
  });

  describe('getEventSummary()', () => {
    beforeEach(() => {
      Expenses.add('Dinner', 2000, 'Food', '2024-01-10', 'Restaurant', null, 'Birthday Party');
      Expenses.add('Cake', 1500, 'Food', '2024-01-11', 'Bakery', null, 'Birthday Party');
      Expenses.add('Decorations', 800, 'Shopping', '2024-01-12', 'Party store', null, 'Birthday Party');
      Expenses.add('Lunch', 1000, 'Food', '2024-02-05', 'Restaurant', null, 'Team Outing');
      Expenses.add('Transport', 500, 'Transport', '2024-02-05', 'Uber', null, 'Team Outing');
    });

    it('should group expenses by event name', () => {
      const summary = Expenses.getEventSummary();

      expect(summary).toHaveLength(2);
      expect(summary.some(e => e.name === 'Birthday Party')).toBe(true);
      expect(summary.some(e => e.name === 'Team Outing')).toBe(true);
    });

    it('should calculate total for each event', () => {
      const summary = Expenses.getEventSummary();
      const birthdayEvent = summary.find(e => e.name === 'Birthday Party');

      expect(birthdayEvent.total).toBe(4300);
      expect(birthdayEvent.expenseCount).toBe(3);
    });

    it('should sort events by total (highest first)', () => {
      const summary = Expenses.getEventSummary();

      expect(summary[0].name).toBe('Birthday Party');
      expect(summary[1].name).toBe('Team Outing');
    });

    it('should group expenses by title within each event', () => {
      const summary = Expenses.getEventSummary();
      const birthdayEvent = summary.find(e => e.name === 'Birthday Party');

      expect(birthdayEvent.byTitle).toHaveLength(3);
      expect(birthdayEvent.byTitle.some(t => t.title === 'Dinner')).toBe(true);
      expect(birthdayEvent.byTitle.some(t => t.title === 'Cake')).toBe(true);
      expect(birthdayEvent.byTitle.some(t => t.title === 'Decorations')).toBe(true);
    });

    it('should calculate totals within each title group', () => {
      Expenses.add('Dinner', 1000, 'Food', '2024-01-15', 'Second dinner', null, 'Birthday Party');

      const summary = Expenses.getEventSummary();
      const birthdayEvent = summary.find(e => e.name === 'Birthday Party');
      const dinnerGroup = birthdayEvent.byTitle.find(t => t.title === 'Dinner');

      expect(dinnerGroup.total).toBe(3000);
      expect(dinnerGroup.count).toBe(2);
      expect(dinnerGroup.expenses).toHaveLength(2);
    });

    it('should sort title groups by total (highest first)', () => {
      const summary = Expenses.getEventSummary();
      const birthdayEvent = summary.find(e => e.name === 'Birthday Party');

      expect(birthdayEvent.byTitle[0].title).toBe('Dinner');
      expect(birthdayEvent.byTitle[1].title).toBe('Cake');
      expect(birthdayEvent.byTitle[2].title).toBe('Decorations');
    });

    it('should include individual expense details', () => {
      const summary = Expenses.getEventSummary();
      const birthdayEvent = summary.find(e => e.name === 'Birthday Party');
      const dinnerGroup = birthdayEvent.byTitle.find(t => t.title === 'Dinner');

      expect(dinnerGroup.expenses[0]).toHaveProperty('id');
      expect(dinnerGroup.expenses[0]).toHaveProperty('date');
      expect(dinnerGroup.expenses[0]).toHaveProperty('amount');
      expect(dinnerGroup.expenses[0]).toHaveProperty('description');
      expect(dinnerGroup.expenses[0]).toHaveProperty('category');
    });
  });

  describe('isLoanEMIExpense()', () => {
    it('should identify loan EMI expense', () => {
      const expense = { title: 'HDFC Home EMI', category: 'emi' };

      expect(Expenses.isLoanEMIExpense(expense)).toBe(true);
    });

    it('should identify different loan types', () => {
      expect(Expenses.isLoanEMIExpense({ title: 'SBI Car EMI', category: 'emi' })).toBe(true);
      expect(Expenses.isLoanEMIExpense({ title: 'ICICI Personal EMI', category: 'emi' })).toBe(true);
    });

    it('should not identify card EMI as loan EMI', () => {
      const expense = { title: 'Card EMI: iPhone', category: 'emi' };

      expect(Expenses.isLoanEMIExpense(expense)).toBe(false);
    });

    it('should not identify EMI prefix as loan EMI', () => {
      const expense = { title: 'EMI: Something', category: 'emi' };

      expect(Expenses.isLoanEMIExpense(expense)).toBe(false);
    });

    it('should require emi category', () => {
      const expense = { title: 'HDFC Home EMI', category: 'Shopping' };

      expect(Expenses.isLoanEMIExpense(expense)).toBe(false);
    });

    it('should handle missing title', () => {
      const expense = { category: 'emi' };

      expect(Expenses.isLoanEMIExpense(expense)).toBeFalsy();
    });
  });

  describe('isAutoRecurringExpense()', () => {
    it('should identify loan EMI as auto-recurring', () => {
      const expense = { title: 'HDFC Home EMI', category: 'emi' };

      expect(Expenses.isAutoRecurringExpense(expense)).toBe(true);
    });

    it('should identify card EMI as auto-recurring', () => {
      const expense = { title: 'Card EMI: iPhone', category: 'emi' };

      expect(Expenses.isAutoRecurringExpense(expense)).toBe(true);
    });

    it('should identify expense with recurring category', () => {
      const expense = { title: 'Netflix', category: 'recurring' };

      expect(Expenses.isAutoRecurringExpense(expense)).toBe(true);
    });

    it('should identify expense with isRecurring flag', () => {
      const expense = { title: 'Netflix', category: 'Entertainment', isRecurring: true };

      expect(Expenses.isAutoRecurringExpense(expense)).toBe(true);
    });

    it('should not identify regular expense as auto-recurring', () => {
      const expense = { title: 'Groceries', category: 'Food' };

      expect(Expenses.isAutoRecurringExpense(expense)).toBe(false);
    });
  });

  describe('getExpenseBudgetMonth()', () => {
    it('should return budget month if set', () => {
      const expense = {
        date: '2024-01-15',
        budgetMonth: 2,
        budgetYear: 2024
      };

      const result = Expenses.getExpenseBudgetMonth(expense);

      expect(result).toEqual({ month: 2, year: 2024 });
    });

    it('should fall back to expense date if budget month not set', () => {
      const expense = { date: '2024-03-15' };

      const result = Expenses.getExpenseBudgetMonth(expense);

      expect(result).toEqual({ month: 3, year: 2024 });
    });

    it('should handle December correctly', () => {
      const expense = { date: '2024-12-31' };

      const result = Expenses.getExpenseBudgetMonth(expense);

      expect(result).toEqual({ month: 12, year: 2024 });
    });

    it('should handle January correctly', () => {
      const expense = { date: '2024-01-01' };

      const result = Expenses.getExpenseBudgetMonth(expense);

      expect(result).toEqual({ month: 1, year: 2024 });
    });
  });

  describe('isDismissed()', () => {
    it('should return true if dismissed by recurringId and date', () => {
      window.DB.dismissedRecurringExpenses = [
        { recurringId: 'rec-1', date: '2024-01-15', title: 'Netflix', amount: 499 }
      ];

      const result = Expenses.isDismissed('Netflix', '2024-01-15', 499, 'rec-1');

      expect(result).toBe(true);
    });

    it('should return false if recurringId matches but date differs', () => {
      window.DB.dismissedRecurringExpenses = [
        { recurringId: 'rec-1', date: '2024-01-15', title: 'Netflix', amount: 499 }
      ];

      const result = Expenses.isDismissed('Netflix', '2024-02-15', 499, 'rec-1');

      expect(result).toBe(false);
    });

    it('should fall back to title/date/amount matching', () => {
      window.DB.dismissedRecurringExpenses = [
        { title: 'Spotify', date: '2024-01-15', amount: 199 }
      ];

      const result = Expenses.isDismissed('Spotify', '2024-01-15', 199);

      expect(result).toBe(true);
    });

    it('should handle amount comparison with small difference', () => {
      window.DB.dismissedRecurringExpenses = [
        { title: 'Test', date: '2024-01-15', amount: 199.99 }
      ];

      const result = Expenses.isDismissed('Test', '2024-01-15', 199.991);

      expect(result).toBe(true);
    });

    it('should return false when not dismissed', () => {
      window.DB.dismissedRecurringExpenses = [];

      const result = Expenses.isDismissed('Netflix', '2024-01-15', 499, 'rec-1');

      expect(result).toBe(false);
    });

    it('should return false when dismissedRecurringExpenses is undefined', () => {
      window.DB.dismissedRecurringExpenses = undefined;

      const result = Expenses.isDismissed('Netflix', '2024-01-15', 499);

      expect(result).toBe(false);
    });
  });

  describe('getAll()', () => {
    it('should return all expenses', () => {
      Expenses.add('Expense1', 100, 'Food', '2024-01-10');
      Expenses.add('Expense2', 200, 'Shopping', '2024-01-15');

      const all = Expenses.getAll();

      expect(all).toHaveLength(2);
      expect(all).toBe(window.DB.expenses);
    });

    it('should return empty array when no expenses', () => {
      const all = Expenses.getAll();

      expect(all).toEqual([]);
    });
  });
});
