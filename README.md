# My Assistant 🤖

**AI-Powered Personal Financial Assistant** - Your smart companion for managing credit cards, expenses, investments, and credentials with enterprise-grade security.

[![Android](https://img.shields.io/badge/Platform-Android-green.svg)](https://developer.android.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.x-blue.svg)](https://capacitorjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Features

### 💳 **Smart Credit Card Advisor**
- AI-powered credit card recommendations for specific spending
- Automatic benefit fetching from official bank websites
- Stored benefits for instant recommendations (no repeated searches)
- Manual benefit updates when needed
- Context-aware AI analysis for best card selection

### 💰 **Investment Portfolio Manager**
- Track stocks, long-term, short-term investments, and provident funds
- **Live stock price updates** with multi-API support (Yahoo Finance, Finnhub, Alpha Vantage)
- Automatic ticker symbol resolution and caching
- USD to INR conversion with live exchange rates
- Manual price editing for all investments
- Comprehensive portfolio analysis and grouping

### 💵 **Expense Tracker**
- Smart expense tracking with title and detailed descriptions
- Month-wise grouping with expand/collapse
- Advanced filtering (Today, This Week, This Month, This Year, Custom Range)
- Category-based organization
- Auto-calculated totals with Indian Rupee (₹) support

### 🔐 **Secure Credentials Vault**
- Store sensitive credentials securely
- Organized with tags and descriptions
- Password visibility toggle
- Search and filter capabilities

### 🤖 **Context-Aware AI Advisor**
- **3-Provider Fallback System**: Automatically switches between Gemini, ChatGPT, and Perplexity on rate limits
- **Multiple Contexts**: Switch between Credit Cards, Expenses, and Investments analysis
- Conversational interface with chat history
- Clear context option to start fresh conversations

### 🔒 **Enterprise Security**
- **PIN Lock**: Mandatory 4-6 digit PIN protection
- **Fingerprint/Biometric**: Optional quick unlock (auto-detected)
- SHA-256 PIN hashing
- Session-based security
- First-time setup wizard

---

## 🚀 Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+) with modular architecture
- **Styling**: TailwindCSS with custom gradient animations
- **Mobile**: Capacitor 7.x for native Android
- **AI Integration**: Multi-provider support (Gemini, ChatGPT, Perplexity)
- **Security**: Biometric Authentication Plugin, SHA-256 hashing
- **APIs**: Yahoo Finance, Finnhub, Alpha Vantage for stock prices
- **Storage**: LocalStorage with structured data persistence

---

## 📱 Installation

### Prerequisites
- Node.js (v16 or higher)
- Android Studio (for Android build)
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/deepu-mungamuri94/myassistant.git
cd myassistant

# Install dependencies
npm install

# Sync Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

---

## 🔧 Configuration

### AI API Keys

1. Launch the app
2. Navigate to **Settings** (in side menu)
3. Add at least one AI provider API key:
   - **Gemini**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - **ChatGPT**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Perplexity**: Get from [Perplexity API](https://www.perplexity.ai/settings/api)

### Security Setup

On first launch:
1. Create a **4-6 digit PIN**
2. Confirm your PIN
3. (Optional) Enable **Fingerprint** for quick unlock

---

## 📖 Usage

### Credit Cards
- **Add Card**: Tap "+" → Enter card details
- **Fetch Benefits**: Tap "Update Rules" to get latest benefits from AI
- **View Benefits**: Tap "View" to see stored card benefits
- **AI Recommendations**: Ask "₹5000 on groceries" in AI Advisor

### Investments
- **Add Investment**: Tap "+" → Choose type (Stock/Long-term/Short-term/Provident Fund)
- **Update Stocks**: Tap "Stocks" button to fetch live prices for all stocks
- **Edit Price**: Tap refresh icon on individual stock for manual/live price update
- **Exchange Rate**: Tap "💱 ₹83.00" to update USD to INR conversion rate

### Expenses
- **Add Expense**: Tap "+" → Enter title, amount, category, description
- **Filter**: Tap clock icon → Select date range
- **Search**: Use search bar for quick lookup
- **Month View**: Expands automatically for multi-month searches

### AI Advisor
- **Switch Context**: Use dropdown to analyze Cards, Expenses, or Investments
- **Ask Questions**: Type natural queries like "Best card for dining?" or "November expense summary"
- **Clear Chat**: Tap "Clear" to start fresh conversation

---

## 🏗️ Architecture

```
myassistant/
├── www/
│   ├── index.html              # Main HTML with modals
│   ├── css/
│   │   └── styles.css          # Global styles & animations
│   └── js/
│       ├── core/               # Core functionality
│       │   ├── database.js     # Data schema
│       │   ├── storage.js      # LocalStorage wrapper
│       │   ├── security.js     # PIN + Biometric auth
│       │   ├── stockapi.js     # Multi-API stock fetching
│       │   ├── loading.js      # Loading overlay
│       │   └── utils.js        # Helper functions
│       ├── ai/                 # AI integration
│       │   ├── provider.js     # AI abstraction with fallback
│       │   ├── gemini.js       # Google Gemini
│       │   ├── chatgpt.js      # OpenAI ChatGPT
│       │   └── perplexity.js   # Perplexity AI
│       ├── modules/            # Feature modules
│       │   ├── cards.js        # Credit cards
│       │   ├── expenses.js     # Expense tracking
│       │   ├── investments.js  # Portfolio management
│       │   └── credentials.js  # Secure vault
│       ├── ui/                 # UI components
│       │   ├── navigation.js   # Routing & menu
│       │   ├── chat.js         # AI chat interface
│       │   └── toast.js        # Notifications
│       └── app.js              # App initialization
└── android/                    # Capacitor Android project
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.

---

## 🎯 Key Features Explained

### AI Provider Fallback System
When a rate limit is hit (429 error), the app automatically:
1. Tries the primary configured provider (e.g., Gemini)
2. Falls back to second provider (e.g., ChatGPT)
3. Falls back to third provider (e.g., Perplexity)
4. Only attempts providers with configured API keys

### Stock Price Fetching
Multi-API approach with parallel requests:
- **Yahoo Finance** (primary)
- **Finnhub** (fallback)
- **Alpha Vantage** (fallback)
- Uses `Promise.race()` for fastest response
- Automatic ticker caching for subsequent fetches
- BSE ↔ NSE fallback for Indian stocks

### Security Flow
```
App Launch → Check Security Setup
    ↓
Not Setup? → Show Setup Modal → Create PIN → [Optional] Enable Biometric
    ↓
Already Setup? → Show Unlock Modal → PIN or Fingerprint
    ↓
Unlocked! → Load App Data → Continue
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

**Deepu Mungamuri**
- GitHub: [@deepu-mungamuri94](https://github.com/deepu-mungamuri94)

---

## 🙏 Acknowledgments

- Inspired by CardAdvisor app
- Built with Capacitor for cross-platform support
- AI powered by Google Gemini, OpenAI, and Perplexity
- Stock data from Yahoo Finance, Finnhub, and Alpha Vantage

---

**Made with ❤️ for personal financial management**

