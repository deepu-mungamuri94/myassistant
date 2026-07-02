# My Assistant — Capacitor Android App

Personal AI-powered finance assistant. Vanilla JS + Capacitor, packaged as native Android.

## Tech Stack
- **Frontend:** Vanilla JavaScript (ES modules via script tags), TailwindCSS
- **Mobile:** Capacitor 7 → Android native wrapper
- **Storage:** LocalStorage (in-app sandbox)
- **Security:** PIN (SHA-256) + Biometric (capacitor plugin)
- **AI:** Multi-provider (Gemini, ChatGPT, Perplexity, Groq) with automatic fallback
- **Testing:** Vitest + jsdom

## Project Structure
```
www/js/
├── app.js              # Bootstrap
├── core/              # Database, storage, security, utils, stockapi, cloudBackup
├── ai/                # Provider abstraction, gemini, chatgpt, perplexity, groq, queryEngine
├── modules/           # Feature modules (cards, credentials, expenses, investments, loans, etc.)
├── ui/                # Navigation, chat, modals, toast, a11y
└── utils/             # crypto, aiRenderer
```

## Conventions
- All modules export via `window.ModuleName = { ... }` (no ES module imports in app code)
- Tests use `loadModule()` helper that evals source files in jsdom with mocked globals
- Tests go in `test/unit/` (unit) or `test/smoke/` (integration/load)
- Run tests: `npm run test`
- Sync to Android after web changes: `npx cap sync android`

## Key Patterns
- Global `DB` object is the in-memory data store (loaded/saved via Storage module)
- AI provider calls go through `AIProvider.call()` which handles fallback chain
- Stock prices fetched via parallel `Promise.race()` across Yahoo/Finnhub/Alpha Vantage
- Security: PIN verified on every app launch, biometric optional

## Testing Guidelines
- Mock `window.DB`, `window.Storage`, `window.Toast`, etc. in test setup
- Use `test/helpers/loadModule.js` to load source files into test context
- Test file naming: `test/unit/<module-name>.test.js`
- No network calls in tests — mock all fetch/API responses
