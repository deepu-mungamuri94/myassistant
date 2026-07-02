/**
 * Smoke test: load every module in index.html order
 * Ensures no module throws on load and that each exports its global
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Module Loading', () => {
  // Load order from index.html (excluding vendor files and app.js)
  const modules = [
    { path: 'core/categories.js', global: 'ExpenseCategories' },
    { path: 'core/database.js', global: 'DB' },
    { path: 'core/utils.js', global: 'Utils' },
    { path: 'utils/crypto.js', global: 'Crypto' },
    { path: 'utils/aiRenderer.js', global: 'AIRenderer' },
    { path: 'core/storage.js', global: 'Storage' },
    { path: 'core/dataLifecycle.js', global: 'DataLifecycle' },
    { path: 'core/cloudBackup.js', global: 'CloudBackup' },
    { path: 'core/security.js', global: 'Security' },
    { path: 'core/loading.js', global: 'Loading' },
    { path: 'core/stockapi.js', global: 'StockAPI' },
    { path: 'ai/gemini.js', global: 'GeminiAI' },
    { path: 'ai/groq.js', global: 'GroqAI' },
    { path: 'ai/chatgpt.js', global: 'ChatGPT' },
    { path: 'ai/perplexity.js', global: 'Perplexity' },
    { path: 'ai/queryEngine.js', global: 'QueryEngine' },
    { path: 'ai/provider.js', global: 'AIProvider' },
    { path: 'modules/dashboard.js', global: 'Dashboard' },
    { path: 'modules/credentials.js', global: 'Credentials' },
    { path: 'modules/cards.js', global: 'Cards' },
    { path: 'modules/smsBills.js', global: 'SmsBills' },
    { path: 'modules/expenses.js', global: 'Expenses' },
    { path: 'modules/plans.js', global: 'Plans' },
    { path: 'modules/income.js', global: 'Income' },
    { path: 'modules/recurringExpenses.js', global: 'RecurringExpenses' },
    { path: 'modules/events.js', global: 'Events' },
    { path: 'modules/loans.js', global: 'Loans' },
    { path: 'modules/moneyLent.js', global: 'MoneyLent' },
    { path: 'modules/investments.js', global: 'Investments' },
    { path: 'modules/sips.js', global: 'Sips' },
    { path: 'modules/financialHealth.js', global: 'FinancialHealth' },
    { path: 'ui/toast.js', global: 'Toast' },
    { path: 'ui/modals.js', global: 'ModalManager' },
    { path: 'ui/chat.js', global: 'Chat' },
    { path: 'ui/navigation.js', global: 'Navigation' },
    { path: 'ui/a11y.js', global: 'A11y' },
    // app.js is intentionally excluded (has DOMContentLoaded side effect)
  ];

  modules.forEach(({ path, global }) => {
    it(`loads ${path} and exports window.${global}`, () => {
      const exported = loadModule(path, global);
      expect(exported).toBeDefined();
      expect(exported).not.toBeNull();
      expect(typeof exported).toBe('object');
    });
  });
});
