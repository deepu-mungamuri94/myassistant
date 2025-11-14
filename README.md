# My Assistant 🤖

**Your Personal AI Companion for Secure Data Management**

My Assistant is a personal, privacy-first Android application that combines AI-powered assistance with secure local storage for your sensitive data. Everything stays on your device - nothing is sent to external servers except AI queries.

---

## ✨ Features

### 🔐 Secure Data Vaults
- **Credentials Manager**: Store passwords, usernames, and login information
- **Credit Cards**: Manage your credit card details securely
- **Health Records**: Track medical history, prescriptions, and health data
- **Investments**: Monitor your portfolio, stocks, mutual funds, and FDs
- **Reminders**: Never miss important dates and tasks

### 🤖 AI-Powered Assistance
- **Intelligent Chat**: Ask questions about your data
- **Smart Recommendations**: Get best credit card suggestions for purchases
- **Data Insights**: Analyze your investments and spending patterns
- **Context-Aware**: AI has access to your data context for better answers

### 🔒 Security & Privacy
- **Local Storage**: All data stored on your device using localStorage
- **Web Crypto API**: Military-grade encryption (AES-256-GCM)
- **Master Password**: Optional encryption for all sensitive data
- **No Cloud Sync**: Your data never leaves your device (except AI queries)

### 📤 Backup & Migration
- **Export**: Download encrypted backup files
- **Import**: Restore data on new devices
- **Portable**: Easy device migration with `.myassistant` backup files

### 🎨 Beautiful UI
- **Modern Design**: Gradient backgrounds with smooth animations
- **Intuitive Navigation**: Hamburger menu with categorized sections
- **Responsive**: Works perfectly on all Android screen sizes
- **Safe Area Support**: Properly handles notches and status bars

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Android Studio (for building APK)
- Google Gemini API key (free from [Google AI Studio](https://makersuite.google.com/app/apikey))

### Installation

```bash
cd /Users/dmungamuri/AndroidStudioProjects/myassistant

# Install dependencies
npm install

# Sync with Android
npm run sync

# Open in Android Studio
npm run open:android
```

See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions.

---

## 📱 Usage

### First Time Setup

1. **Launch the app** on your Android device/emulator
2. **Configure AI Settings**:
   - Tap the Settings icon (⚙️)
   - Select AI Provider: Gemini (default)
   - Enter your Gemini API key
   - Set a master password for encryption (optional but recommended)
   - Save settings

3. **Start Adding Data**:
   - Open the menu (☰)
   - Navigate to any vault (Credentials, Cards, Health, etc.)
   - Add your first entry
   - Data is encrypted and saved locally

4. **Chat with AI**:
   - Navigate to "AI Chat" from menu
   - Ask questions like:
     - "What's my total investment value?"
     - "Which credit card is best for dining?"
     - "Show me my upcoming reminders"
   - AI provides context-aware answers

### Daily Usage

- **Add Data**: Open any vault and fill in the form
- **View Data**: All entries are listed in their respective vaults
- **Delete Data**: Tap the delete icon on any entry
- **Export Backup**: Menu → Export Data → Download backup file
- **Chat with AI**: Ask questions about your data anytime

---

## 🏗️ Architecture

### Technology Stack
- **Frontend**: HTML5, CSS3 (Tailwind CDN), Vanilla JavaScript
- **Mobile Framework**: Capacitor 7
- **AI Integration**: Google Gemini API (switchable architecture)
- **Storage**: Browser localStorage with Web Crypto API encryption
- **Database**: SQLite plugin included (ready for future use)

### Project Structure

```
myassistant/
├── www/
│   └── index.html          # Single-file app (all HTML/CSS/JS inline)
├── android/                # Android native project
├── node_modules/           # Dependencies
├── package.json            # Project configuration
├── capacitor.config.json   # Capacitor configuration
├── README.md               # This file
├── QUICKSTART.md           # Setup guide
└── ARCHITECTURE.md         # Technical deep dive
```

### Data Structure

All data is stored in a single `DB` object in localStorage under the key `myassistant_db`:

```javascript
{
  credentials: [],    // Login credentials
  cards: [],          // Credit cards
  health: [],         // Health records
  investments: [],    // Investment data
  reminders: [],      // Reminders
  chatHistory: [],    // AI chat history
  settings: {         // App settings
    aiProvider: 'gemini',
    geminiApiKey: '',
    masterPassword: ''
  }
}
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for comprehensive technical documentation.

---

## 🔐 Security

### Encryption
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Salt**: Random 16-byte salt per encryption
- **IV**: Random 12-byte initialization vector per encryption

### Best Practices
1. **Use a strong master password** (12+ characters, mixed case, numbers, symbols)
2. **Export backups regularly** (weekly recommended)
3. **Store backup files securely** (encrypted cloud storage or external drive)
4. **Don't forget your master password** (no recovery possible)

### What's NOT Encrypted
- AI queries sent to Gemini (but not stored on Google servers)
- App settings (except master password hash)

---

## 🤖 AI Integration

### Supported Providers
- ✅ **Google Gemini** (gemini-2.0-flash-lite)
- 🔜 **OpenAI** (Coming Soon)
- 🔜 **Claude** (Coming Soon)

### AI Capabilities
- Analyzes your local data context
- Provides smart recommendations
- Answers questions about your data
- No data sent to AI except query context

### Switching Providers
The app uses an abstraction layer for AI providers. To switch:
1. Open Settings
2. Select AI Provider
3. Enter new API key
4. Save

Future providers can be added by implementing the `callAI()` interface.

---

## 📤 Backup & Restore

### Export Data
1. Menu → Export Data
2. Downloads `myassistant_backup_[timestamp].myassistant` file
3. File is encrypted with your master password

### Import Data
1. Menu → Import Data
2. Select backup file
3. Enter master password
4. Data restored and merged

### Backup File Format
- Encrypted JSON containing all DB data
- File extension: `.myassistant`
- Compatible across devices

---

## 🛠️ Development

### Build APK

```bash
# Sync web assets to Android
npm run build

# Open in Android Studio
npm run open:android

# In Android Studio:
# Build → Build Bundle(s) / APK(s) → Build APK(s)
```

### Debugging

```bash
# View logs in Chrome
chrome://inspect
```

### Adding New Data Types

1. Add field to `DB` object
2. Create UI section in HTML
3. Implement CRUD functions
4. Add navigation menu item

---

## 📝 Roadmap

### Version 1.1
- [ ] SQLite integration for large datasets
- [ ] Search functionality across all vaults
- [ ] Biometric authentication
- [ ] Automatic backup scheduling

### Version 1.2
- [ ] OpenAI and Claude integration
- [ ] Voice input for chat
- [ ] Data analytics dashboard
- [ ] Tags and categories

### Version 2.0
- [ ] End-to-end encrypted cloud sync (optional)
- [ ] Multi-device support
- [ ] Shared vaults (family mode)
- [ ] Browser extension companion

---

## ⚠️ Important Notes

### This is a Personal App
- **NOT intended for Play Store distribution**
- Built for personal use only
- No warranty or support provided
- Use at your own risk

### Privacy Commitment
- No telemetry or analytics
- No external servers (except AI APIs)
- No data collection
- Fully transparent source code

---

## 🙏 Credits

- **Capacitor** - Ionic Team
- **Tailwind CSS** - Tailwind Labs
- **Google Gemini API** - Google DeepMind
- **SQLite Plugin** - @capacitor-community

---

## 📄 License

MIT License - Feel free to modify and use for personal purposes.

---

## 🐛 Troubleshooting

### App won't load
- Check if Gemini API key is configured
- Clear app data and reimport backup
- Check browser console for errors

### AI not responding
- Verify API key is valid
- Check internet connection
- Try switching AI model in Gemini API settings

### Can't import backup
- Ensure you're using the correct master password
- Check file is `.myassistant` format
- Try exporting fresh backup and testing

### Android build fails
- Ensure Java 17+ is installed
- Sync Gradle in Android Studio
- Check `android/app/build.gradle` for errors

---

**Made with ❤️ for personal productivity and privacy**


