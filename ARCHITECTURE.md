# Architecture Documentation 🏗️

Complete technical architecture of My Assistant application.

---

## 📐 Overview

My Assistant is a **modular, mobile-first web application** built with vanilla JavaScript and packaged as a native Android app using Capacitor. The architecture emphasizes:

- **Separation of Concerns**: Clear module boundaries
- **Security First**: PIN + Biometric authentication
- **AI Abstraction**: Provider-agnostic AI integration
- **Offline Capable**: LocalStorage-based persistence
- **Progressive Enhancement**: Works without network (except AI features)

---

## 🗂️ Directory Structure

```
myassistant/
├── www/                        # Web application root
│   ├── index.html              # Single-page application shell
│   ├── css/
│   │   └── styles.css          # Global styles, animations, utilities
│   └── js/
│       ├── app.js              # Application bootstrap & initialization
│       ├── core/               # Core system modules
│       │   ├── database.js     # In-memory data schema
│       │   ├── storage.js      # LocalStorage persistence layer
│       │   ├── security.js     # Authentication & encryption
│       │   ├── stockapi.js     # Stock price fetching (multi-API)
│       │   ├── loading.js      # Global loading overlay
│       │   └── utils.js        # Shared utility functions
│       ├── ai/                 # AI provider integrations
│       │   ├── provider.js     # AI abstraction layer with fallback
│       │   ├── gemini.js       # Google Gemini implementation
│       │   ├── chatgpt.js      # OpenAI ChatGPT implementation
│       │   └── perplexity.js   # Perplexity AI implementation
│       ├── modules/            # Feature modules (business logic)
│       │   ├── cards.js        # Credit card management
│       │   ├── expenses.js     # Expense tracking
│       │   ├── investments.js  # Portfolio management
│       │   └── credentials.js  # Credential vault
│       └── ui/                 # UI components
│           ├── navigation.js   # Routing, menu, modals
│           ├── chat.js         # AI chat interface
│           └── toast.js        # Toast notifications
└── android/                    # Capacitor Android project
    ├── app/
    │   └── src/main/
    │       ├── AndroidManifest.xml
    │       ├── res/            # Android resources
    │       └── java/           # MainActivity
    └── build.gradle
```

---

## 🔧 Core Modules

### 1. **database.js** - Data Schema

In-memory singleton storing all application data:

```javascript
DB = {
    credentials: Array,      // User credentials
    cards: Array,            // Credit cards with benefits
    expenses: Array,         // Expense transactions
    investments: Array,      // Investment portfolio
    chatHistory: Array,      // AI conversation history
    exchangeRate: Object,    // USD to INR conversion
    settings: Object,        // AI provider settings
    security: Object         // PIN hash & biometric config
}
```

**Key Features:**
- Single source of truth
- No external database dependencies
- Loaded on app start, saved on changes
- Exported globally as `window.DB`

---

### 2. **storage.js** - Persistence Layer

Manages LocalStorage operations:

```javascript
Storage = {
    save()          // Serialize DB to localStorage
    load()          // Deserialize localStorage to DB
    exportData()    // Export DB as JSON file
    importData()    // Import JSON and merge with DB
    clear()         // Wipe all data
}
```

**Implementation Details:**
- Uses `localStorage.setItem('myassistant_data', JSON.stringify(DB))`
- Auto-loads on app initialization
- Export/Import for backup/restore
- Data validation on import

---

### 3. **security.js** - Authentication & Encryption

Handles PIN and biometric authentication:

```javascript
Security = {
    isUnlocked: Boolean,
    
    // PIN Management
    isSetup()                          // Check if PIN configured
    hashPin(pin)                       // SHA-256 hash
    setupPin(pin)                      // Initial setup
    verifyPin(pin)                     // Validate PIN
    changePin(oldPin, newPin)          // Update PIN
    
    // Biometric
    isBiometricAvailable()             // Check device capability
    enableBiometric()                  // Enable fingerprint
    disableBiometric()                 // Disable fingerprint
    authenticateWithBiometric()        // Trigger biometric auth
    
    // Session
    unlockWithPin(pin)                 // Unlock app with PIN
    lock()                             // Lock app
    resetSecurity()                    // Clear security (WARNING)
}
```

**Security Flow:**
1. **First Launch**: Show setup modal → Create PIN → Optional biometric
2. **Subsequent Launches**: Show unlock modal → PIN or Fingerprint
3. **Session**: Remains unlocked until app restart

**Key Features:**
- **SHA-256 Hashing**: PIN never stored in plain text
- **Biometric Integration**: Uses `@aparajita/capacitor-biometric-auth` plugin
- **Session Management**: Unlock once per app lifecycle
- **No Recovery**: PIN cannot be recovered (by design)

---

### 4. **stockapi.js** - Stock Price Fetching

Multi-API approach with fallback and parallel requests:

```javascript
StockAPI = {
    // Core fetching
    searchTicker(companyName)          // Resolve company → ticker
    getPrice(ticker)                   // Fetch current price
    fetchStockPrice(companyName)       // Search + Price
    fetchAllPrices(stockNames)         // Batch fetch
    
    // With ticker caching
    fetchAllPricesWithTickers(stocks)  // Use cached tickers
    
    // Helper
    httpGet(url)                       // Capacitor HTTP or CORS proxy
}
```

**API Providers:**
1. **Yahoo Finance** (primary, no API key)
2. **Finnhub** (fallback, free tier)
3. **Alpha Vantage** (fallback, free tier)

**Key Features:**
- **Parallel Requests**: `Promise.race()` for fastest response
- **Timeout**: 8-second limit per API
- **Ticker Caching**: Stores resolved tickers in DB
- **BSE ↔ NSE Fallback**: Tries both exchanges for Indian stocks
- **CORS Handling**: Native HTTP in app, proxy in browser
- **Batch AI Fallback**: Single AI call to resolve multiple tickers

**Flow:**
```
fetchStockPrice("Infosys")
    ↓
searchTicker("Infosys") → Try common mappings
    ↓ (if not found)
Yahoo Search API → "INFY.NS"
    ↓
getPrice("INFY.NS") → Parallel race:
    ├─ Yahoo Finance
    ├─ Finnhub
    └─ Alpha Vantage
    ↓
Return fastest successful response
```

---

### 5. **loading.js** - Global Loading Overlay

Centralized loading indicator:

```javascript
Loading = {
    show(message)    // Display overlay with message
    hide()           // Hide overlay
}
```

**Usage:**
- Shown during: AI calls, stock updates, benefit fetching
- Blocks user interaction
- Light gray semi-transparent overlay

---

### 6. **utils.js** - Utility Functions

Shared helper functions:

```javascript
Utils = {
    formatCurrency(amount)       // ₹1,234.56
    formatDate(date)             // DD MMM YYYY
    generateId()                 // Unique ID generator
    parseMarkdown(text)          // Convert MD → HTML
}
```

---

## 🤖 AI Integration

### **provider.js** - AI Abstraction Layer

Unified interface for all AI providers with automatic fallback:

```javascript
AIProvider = {
    // Provider Management
    getAvailableProviders()              // List providers with API keys
    callProvider(provider, prompt, ctx)  // Call specific provider
    isRateLimitError(error)              // Detect 429/rate limit
    
    // Main Interface
    call(prompt, context)                // Smart call with fallback
    prepareContext(mode)                 // Context for Cards/Expenses/Investments
    isConfigured()                       // Check if any provider ready
}
```

**Fallback Logic:**
```
Primary Provider (e.g., Gemini)
    ↓ (if 429 rate limit)
Fallback #1 (e.g., ChatGPT)
    ↓ (if 429 rate limit)
Fallback #2 (e.g., Perplexity)
    ↓
Success or All Failed
```

**Key Features:**
- **Automatic Retry**: Only on rate-limit errors (429, quota, resources exhausted)
- **Max 3 Attempts**: Prevents infinite loops
- **Provider Filtering**: Only tries providers with configured API keys
- **Toast Notifications**: User feedback on fallback
- **Console Logging**: Detailed debug information

**Context Preparation:**
- **Cards Mode**: Send only card names + stored benefits
- **Expenses Mode**: Send all transactions, totals, categories
- **Investments Mode**: Send portfolio, stocks, exchange rate

---

### Individual Providers

#### **gemini.js** - Google Gemini
```javascript
GeminiAI = {
    API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/...'
    
    call(prompt, context)                    // Main API call
    getSystemInstruction(context)            // Mode-specific instructions
    formatPromptWithContext(prompt, context) // Format data + query
}
```

**Features:**
- Google Search tool integration (when needed)
- Structured JSON responses for stock tickers
- Mode-aware system instructions

#### **chatgpt.js** - OpenAI ChatGPT
```javascript
ChatGPT = {
    API_ENDPOINT: 'https://api.openai.com/v1/chat/completions'
    
    call(prompt, context)  // Chat completion
}
```

#### **perplexity.js** - Perplexity AI
```javascript
Perplexity = {
    API_ENDPOINT: 'https://api.perplexity.ai/chat/completions'
    
    call(prompt, context)  // Perplexity chat
}
```

---

## 📦 Feature Modules

### **cards.js** - Credit Card Management

```javascript
Cards = {
    add(name, number, expiry, cvv)           // Add new card
    update(id, ...)                          // Update card
    delete(id)                               // Remove card
    getById(id)                              // Retrieve card
    fetchBenefits(id)                        // AI fetch from bank website
    showBenefitsModal(id)                    // Display benefits in modal
    render()                                 // Render card list UI
}
```

**Data Structure:**
```javascript
{
    id: Number,
    name: String,                // "HDFC Regalia"
    cardNumber: String,          // Encrypted
    expiry: String,              // "12/25"
    cvv: String,                 // Encrypted
    benefits: String,            // AI-fetched benefits (MD/HTML)
    benefitsFetchedAt: Timestamp,
    createdAt: Timestamp
}
```

---

### **investments.js** - Portfolio Management

```javascript
Investments = {
    add(...)                              // Add investment
    update(id, ...)                       // Update investment
    delete(id)                            // Remove investment
    getById(id)                           // Retrieve investment
    
    // Stock-specific
    refreshAllStockPrices()               // Batch fetch all stocks
    refreshSingleStock(id)                // Fetch single stock
    editStockPrice(id, price, currency)   // Manual price update
    recalculateUSDStocks(newRate)         // Recalc on rate change
    resolveMissingTickers()               // AI batch ticker resolution
    
    render()                              // Render portfolio UI
    renderInvestmentCards(investments)    // Render card list
}
```

**Data Structure:**
```javascript
{
    id: Number,
    name: String,                    // "Infosys" or "Mutual Fund XYZ"
    type: 'stock' | 'other',
    term: 'long' | 'short' | 'provident',
    amount: Number,                  // Calculated total
    
    // Stock-only fields
    inputStockPrice: Number,         // User/AI entered price
    inputCurrency: 'INR' | 'USD',
    quantity: Number,
    tickerSymbol: String,            // Cached ticker (e.g., "INFY.NS")
    livePrice: Number,               // Latest fetched price
    livePriceCurrency: 'INR' | 'USD',
    lastUpdated: Timestamp,
    justUpdated: Boolean,            // For blink animation
    
    createdAt: Timestamp
}
```

---

### **expenses.js** - Expense Tracking

```javascript
Expenses = {
    add(...)                  // Add expense
    update(id, ...)           // Update expense
    delete(id)                // Remove expense
    getById(id)               // Retrieve expense
    
    // Filtering
    filterByDateRange(start, end)  // Filter expenses
    groupByMonth(expenses)         // Group by YYYY-MM
    
    // UI
    render()                       // Render expense list
    renderMonthGroup(...)          // Render month group
    applyQuickFilter(type)         // Apply preset filter
}
```

**Data Structure:**
```javascript
{
    id: Number,
    title: String,           // "Team Lunch"
    description: String,     // Additional details
    amount: Number,          // 1500.00
    category: String,        // "Food"
    date: String,            // "2024-11-14"
    createdAt: Timestamp     // For sorting
}
```

---

### **credentials.js** - Credential Vault

```javascript
Credentials = {
    add(...)          // Add credential
    update(id, ...)   // Update credential
    delete(id)        // Remove credential
    getById(id)       // Retrieve credential
    search(query)     // Search by service/tag/notes
    render()          // Render credential list
}
```

**Data Structure:**
```javascript
{
    id: Number,
    service: String,          // "Netflix"
    username: String,
    password: String,         // Encrypted
    tag: String,              // "Streaming"
    notes: String,            // Description
    additionalDetails: String,
    createdAt: Timestamp
}
```

---

## 🎨 UI Components

### **navigation.js** - Routing & Navigation

```javascript
Navigation = {
    navigateTo(view)           // Switch between views
    refreshView(view)          // Re-render current view
    openMenu()                 // Show side menu
    closeMenu()                // Hide side menu
    openSettings()             // Show settings modal
    saveSettings()             // Save AI config
    
    // Export/Import
    openExportModal()
    exportData()
    openImportModal()
    importData()
    
    // Reset
    openResetModal()
    resetApp()                 // Clear all data + export
}
```

**Views:**
- `chat` - AI Advisor
- `expenses` - Expense Tracker
- `cards` - Credit Cards
- `credentials` - Credentials Vault
- `investments` - Investment Portfolio

---

### **chat.js** - AI Chat Interface

```javascript
Chat = {
    getCurrentMode()              // Get selected context
    send()                        // Send message to AI
    addMessage(role, content)     // Add to chat history
    updateWelcomeMessage()        // Show context-specific welcome
    clear()                       // Clear chat history
    loadHistory()                 // Load previous chat
    formatAIResponse(text)        // MD → Styled HTML
}
```

**Key Features:**
- Context switching (Cards/Expenses/Investments)
- Markdown formatting
- Persistent chat history
- Clear context option

---

### **toast.js** - Toast Notifications

```javascript
Toast = {
    show(message, type)     // Generic toast
    success(message)        // Green success
    error(message)          // Red error
    info(message)           // Blue info
    warning(message)        // Yellow warning
}
```

---

## 🔄 Application Flow

### Initialization

```
1. DOM Ready
    ↓
2. App.init()
    ↓
3. StatusBar configuration (mobile)
    ↓
4. Storage.load() → Load from localStorage
    ↓
5. Security check:
    - Not setup? → Show setup modal → STOP
    - Locked? → Show unlock modal → STOP
    - Unlocked? → Continue
    ↓
6. Navigation.navigateTo('chat')
    ↓
7. Load chat history
    ↓
8. Check AI configuration
    - No keys? → Prompt to configure
    ↓
9. Hide splash screen
    ↓
10. App ready ✅
```

### AI Request Flow

```
User Query
    ↓
Chat.send()
    ↓
AIProvider.call(prompt, context)
    ↓
AIProvider.getAvailableProviders() → ['gemini', 'chatgpt']
    ↓
Try Provider #1 (Gemini)
    ↓ Success? → Return response
    ↓ 429 Rate Limit?
        ↓
    Try Provider #2 (ChatGPT)
        ↓ Success? → Return response
        ↓ Failed?
            ↓
        Throw error: "All providers exhausted"
```

### Stock Price Update Flow

```
User clicks "Stocks" button
    ↓
Investments.refreshAllStockPrices()
    ↓
Filter: stocks only
    ↓
Check if tickers cached
    - Yes: StockAPI.fetchAllPricesWithTickers()
    - No/Partial: Investments.resolveMissingTickers() → AI call
    ↓
StockAPI.fetchStockPrice() for each
    ↓
Parallel API race:
├─ Yahoo Finance
├─ Finnhub  
└─ Alpha Vantage
    ↓
Update DB with live prices
    ↓
Storage.save()
    ↓
Re-render investment list with blink animation
```

---

## 📱 Mobile Integration

### Capacitor Plugins

1. **@capacitor/core** - Core APIs
2. **@capacitor/status-bar** - Status bar control
3. **@aparajita/capacitor-biometric-auth** - Fingerprint/Face ID
4. **@capacitor/http** - Native HTTP (CORS-free)

### Android Configuration

**Permissions** (`AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

**Build**: `android/build.gradle`
- Gradle 8.11.1
- Android SDK 34
- Kotlin support

---

## 🔐 Security Architecture

### Data Protection
- **PIN**: SHA-256 hashed, never stored in plain text
- **Biometric**: Native Android/iOS biometric APIs
- **Session**: Memory-based, cleared on app restart
- **LocalStorage**: Unencrypted (app sandbox provides OS-level security)

### Attack Mitigation
- **Brute Force**: PIN input only, no password recovery
- **Data Theft**: App sandbox prevents external access
- **Man-in-the-Middle**: HTTPS for all external APIs
- **XSS**: No `eval()`, sanitized user inputs

---

## 🚀 Performance Optimizations

1. **Lazy Loading**: Modules loaded on-demand
2. **Parallel API Calls**: `Promise.race()` for stock prices
3. **Ticker Caching**: Avoid repeated ticker resolution
4. **Context Pruning**: Send only relevant data to AI
5. **LocalStorage**: Fast read/write, no network latency
6. **Single-Page App**: No page reloads

---

## 🧪 Testing Recommendations

### Unit Tests (TODO)
- Core module functions (database, storage, security)
- AI provider abstraction and fallback logic
- Stock API with mocked responses

### Integration Tests (TODO)
- End-to-end user flows
- Security setup and unlock
- AI request with fallback
- Stock price fetching

### Manual Testing
- Test on real Android device with fingerprint sensor
- Test AI fallback by exhausting free tier limits
- Test stock API with various company names
- Test import/export functionality

---

## 🔮 Future Enhancements

### Planned Features
- [ ] iOS support
- [ ] Data encryption at rest (optional)
- [ ] Cloud sync (optional)
- [ ] Widget support
- [ ] OCR receipt scanning
- [ ] Recurring expenses/investments
- [ ] Budget goals and alerts
- [ ] Multi-currency support
- [ ] Tax calculation helpers

### Technical Debt
- [ ] Add comprehensive test suite
- [ ] Migrate to TypeScript
- [ ] Add state management (Redux/MobX)
- [ ] Implement service workers for offline
- [ ] Add CI/CD pipeline
- [ ] Performance monitoring

---

## 📚 Resources

- **Capacitor Docs**: https://capacitorjs.com/docs
- **Biometric Auth Plugin**: https://github.com/aparajita/capacitor-biometric-auth
- **TailwindCSS**: https://tailwindcss.com/docs
- **Gemini API**: https://ai.google.dev/docs
- **Yahoo Finance**: https://finance.yahoo.com
- **Finnhub**: https://finnhub.io/docs/api
- **Alpha Vantage**: https://www.alphavantage.co/documentation/

---

**Last Updated**: November 2024
