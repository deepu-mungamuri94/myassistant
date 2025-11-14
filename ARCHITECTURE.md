# Architecture Documentation - My Assistant

## Overview

My Assistant is a personal AI-powered data management application built with Capacitor, featuring secure local storage, encryption, and AI integration.

## Technology Stack

### Frontend
- **HTML5/CSS3/JavaScript**: Pure vanilla JS, no frameworks
- **Tailwind CSS**: Utility-first CSS via CDN
- **Single-File Architecture**: All code in `www/index.html`

### Mobile Framework
- **Capacitor 7.x**: Web-to-native bridge
- **Android Platform**: Target SDK 34

### AI Integration
- **Google Gemini API**: gemini-2.0-flash-lite model
- **Abstraction Layer**: Switchable AI providers

### Storage & Security
- **localStorage**: Primary data storage
- **Web Crypto API**: AES-256-GCM encryption
- **PBKDF2**: Key derivation (100,000 iterations)

### Database (Future)
- **SQLite Plugin**: @capacitor-community/sqlite (ready but not implemented)

## Project Structure

```
myassistant/
├── www/
│   └── index.html          # Complete app (HTML+CSS+JS inline)
├── android/                # Android native project (Capacitor-generated)
├── node_modules/           # NPM dependencies
├── .npmrc                  # Project-specific npm registry
├── package.json            # Dependencies and scripts
├── capacitor.config.json   # Capacitor configuration
├── README.md               # User documentation
├── QUICKSTART.md           # Setup guide
└── ARCHITECTURE.md         # This file
```

## Data Architecture

### Storage Model

All data stored in localStorage under key: `myassistant_db`

```javascript
{
  credentials: [
    { id, service, username, password, notes, createdAt }
  ],
  cards: [
    { id, name, last4, bank, notes, createdAt }
  ],
  health: [
    { id, type, date, details, createdAt }
  ],
  investments: [
    { id, type, name, amount, date, notes, createdAt }
  ],
  reminders: [
    { id, title, description, datetime, completed, createdAt }
  ],
  chatHistory: [
    { role, content, timestamp }
  ],
  settings: {
    aiProvider: 'gemini',
    geminiApiKey: '',
    masterPassword: ''
  }
}
```

### Encryption Flow

1. **Key Derivation**:
   - Input: Master password + random salt (16 bytes)
   - Algorithm: PBKDF2 with SHA-256, 100,000 iterations
   - Output: 256-bit encryption key

2. **Encryption**:
   - Algorithm: AES-256-GCM
   - IV: Random 12 bytes per encryption
   - Output: Base64-encoded (salt + IV + ciphertext)

3. **Decryption**:
   - Extract salt and IV from encrypted data
   - Derive key using password and salt
   - Decrypt using AES-256-GCM with key and IV

### Backup Format

- **File Extension**: `.myassistant`
- **Content**: Base64-encoded encrypted JSON
- **Structure**: `[salt(16) + IV(12) + encrypted_data]`

## AI Integration Architecture

### Abstraction Layer

```javascript
async function callAI(prompt, context) {
  const provider = DB.settings.aiProvider;
  
  if (provider === 'gemini') return await callGemini(prompt, context);
  if (provider === 'openai') return await callOpenAI(prompt, context);  // Future
  // ... more providers
}
```

### Provider Implementation: Gemini

```javascript
async function callGemini(prompt, context) {
  // 1. Build full prompt with context
  const fullPrompt = `Context: ${JSON.stringify(context)}
                      User Query: ${prompt}
                      Provide helpful insights.`;
  
  // 2. Call Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }) }
  );
  
  // 3. Extract and return text
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
```

### Context Preparation

Before AI call, prepare data context:

```javascript
const context = {
  credentials_count: DB.credentials.length,
  cards: DB.cards.map(c => ({ name: c.name, bank: c.bank })),
  health_records_count: DB.health.length,
  investments_count: DB.investments.length,
  total_investment_value: DB.investments.reduce((sum, inv) => sum + inv.amount, 0),
  upcoming_reminders: DB.reminders.filter(r => new Date(r.datetime) > new Date()).length
};
```

## UI Architecture

### Single-Page Application (SPA)

- **Navigation**: View switching via `navigateTo(view)`
- **Views**: Hidden by default, shown on navigation
- **Menu**: Slide-in hamburger menu
- **Modals**: Settings, Export, Import

### View Management

```javascript
function navigateTo(view) {
  // Hide all views
  document.querySelectorAll('[id$="-view"]').forEach(v => v.classList.add('hidden'));
  
  // Show selected view
  document.getElementById(`${view}-view`).classList.remove('hidden');
  
  // Refresh data
  refreshView(view);
}
```

### Safe Area Support

```css
header {
  padding-top: calc(env(safe-area-inset-top) + 1rem);
}

#side-menu .menu-header {
  padding-top: calc(env(safe-area-inset-top) + 1.5rem);
}
```

## Security Model

### Threat Model

**Protected Against**:
- Local device access without master password
- Backup file theft (encrypted)

**NOT Protected Against**:
- Compromised device with keylogger
- Physical device access with unlocked app
- Side-channel attacks on encryption

### Security Best Practices

1. **Master Password**: Strong password required for encryption
2. **No Cloud Storage**: All data local-only
3. **Encryption at Rest**: Data encrypted before localStorage
4. **API Keys**: Stored in localStorage (not encrypted - user responsibility)

### Future Enhancements

- Biometric authentication
- Auto-lock after inactivity
- Encrypted API key storage
- Secure enclave integration (Android Keystore)

## Performance Considerations

### Current Performance

- **localStorage Size Limit**: ~5-10MB (browser-dependent)
- **Encryption Speed**: ~1ms per entry (modern devices)
- **AI Response Time**: 2-5 seconds (network-dependent)

### Optimization Strategies

1. **Lazy Loading**: Load views on demand
2. **Debouncing**: Throttle AI requests
3. **Caching**: Cache AI responses
4. **Pagination**: For large data sets

### Future: SQLite Migration

When localStorage becomes too large:

```javascript
// Replace localStorage with SQLite
import { CapacitorSQLite } from '@capacitor-community/sqlite';

async function saveToSQLite(table, data) {
  const db = await CapacitorSQLite.createConnection({ database: 'myassistant' });
  await db.execute(`INSERT INTO ${table} VALUES (...)`, data);
}
```

## Error Handling

### Global Handlers

```javascript
window.onerror = (msg, url, line, col, error) => {
  console.error('Global error:', { msg, url, line, col, error });
  showToast('An error occurred', 'error');
};

window.onunhandledrejection = (event) => {
  console.error('Unhandled promise:', event.reason);
  showToast('An error occurred', 'error');
};
```

### Function-Level Error Handling

All critical functions wrapped in try-catch:

```javascript
async function addCredential() {
  try {
    // ... logic
    saveToStorage();
    showToast('Success!', 'success');
  } catch (error) {
    console.error('Add credential error:', error);
    showToast('Failed to add credential', 'error');
  }
}
```

## Design Decisions

### Why Single-File Architecture?

**Pros**:
- Maximum compatibility with Android WebView
- No module loading issues
- Faster initial load (one HTTP request)
- Easier debugging

**Cons**:
- Large file size (~50KB)
- Harder to maintain
- No code splitting

**Decision**: Chosen for reliability and compatibility. If app grows significantly, migrate to modular architecture with bundler.

### Why localStorage Instead of SQLite?

**Current Approach**: localStorage
- Simpler implementation
- No plugin issues
- Sufficient for personal use (~1000 entries)

**Future Migration**: SQLite when:
- Data exceeds 1000 entries
- Complex queries needed
- Performance degrades

### Why Gemini Over Other AI?

**Gemini Chosen Because**:
- Free tier (60 RPM)
- Fast response times
- Good at structured data analysis
- Easy API integration

**Provider Abstraction**: Allows easy switching to OpenAI, Claude, or custom models.

## Deployment

### Development Build

```bash
npm run build
npm run open:android
# Build → Build APK in Android Studio
```

### Production Considerations

This app is **NOT intended for Play Store**. If distributing:

1. Add ProGuard rules for obfuscation
2. Enable R8 full mode
3. Sign with release keystore
4. Test on multiple devices

## Future Roadmap

### Phase 1: Core Improvements (v1.1)
- SQLite integration
- Search functionality
- Biometric auth
- Auto-backup scheduling

### Phase 2: AI Enhancements (v1.2)
- OpenAI and Claude support
- Voice input
- Analytics dashboard
- Tags and categories

### Phase 3: Advanced Features (v2.0)
- Optional cloud sync (E2E encrypted)
- Multi-device support
- Shared vaults
- Browser extension

## Contributing

This is a personal project, but if you want to modify:

1. Fork the repository
2. Modify `www/index.html`
3. Test locally: `npm run build && npm run open:android`
4. Create pull request

## References

- Capacitor: https://capacitorjs.com/docs
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- Gemini API: https://ai.google.dev/docs
- PBKDF2: https://en.wikipedia.org/wiki/PBKDF2
- AES-GCM: https://en.wikipedia.org/wiki/Galois/Counter_Mode

---

**Last Updated**: November 2025
