# Quick Start Guide 🚀

Get up and running with My Assistant in 5 minutes!

---

## 📦 Installation

```bash
# 1. Clone the repository
git clone https://github.com/deepu-mungamuri94/myassistant.git
cd myassistant

# 2. Install dependencies
npm install

# 3. Sync with Android
npx cap sync android

# 4. Open in Android Studio
npx cap open android
```

---

## 🔐 First Launch

### Step 1: Security Setup
On first launch, you'll be prompted to set up security:

1. **Create PIN**: Enter a 4-6 digit PIN
2. **Confirm PIN**: Re-enter to verify
3. **[Optional] Enable Fingerprint**: Check the box if your device supports it
4. Click **"Setup Security"**

✅ **Done!** Your app is now secured.

---

## ⚙️ Configure AI

### Step 2: Add AI API Keys

1. Open **Side Menu** (☰ icon)
2. Navigate to **Settings** (⚙️ icon)
3. Add at least one API key:

#### **Option A: Google Gemini (Recommended)**
- Get free API key: https://makersuite.google.com/app/apikey
- Paste in "Gemini API Key" field
- Select "Gemini" as AI Provider

#### **Option B: OpenAI ChatGPT**
- Get API key: https://platform.openai.com/api-keys
- Paste in "ChatGPT API Key" field
- Select "ChatGPT" as AI Provider

#### **Option C: Perplexity**
- Get API key: https://www.perplexity.ai/settings/api
- Paste in "Perplexity API Key" field
- Select "Perplexity" as AI Provider

4. Click **"Save Settings"**

💡 **Tip**: Add multiple API keys for automatic fallback on rate limits!

---

## 💳 Add Your First Credit Card

1. Go to **Credit Cards** (from side menu)
2. Tap **"+"** button
3. Fill in details:
   - Card Name (e.g., "HDFC Regalia")
   - Card Number (for your reference only, not sent to AI)
   - Expiry (MM/YY)
   - CVV
4. Tap **"Add"**
5. Tap **"Update Rules"** to fetch benefits from AI

✅ **Your card is ready for AI recommendations!**

---

## 🤖 Ask Your First AI Question

1. Go to **AI Advisor** (from side menu)
2. Make sure **"💳 Credit Cards"** context is selected
3. Type a query like:
   - "₹5000 on groceries at BigBasket"
   - "₹10,000 for flight tickets"
   - "Best card for dining?"
4. Press **Enter** or tap the send icon

🎉 **Get instant AI-powered recommendations!**

---

## 💰 Track Your First Investment

### Add a Stock
1. Go to **Investments** (from side menu)
2. Tap **"+"** button
3. Fill in details:
   - Name: "Infosys" or "INFY"
   - Type: **Stock**
   - Term: Long Term (>3Y) or Short Term (<3Y)
   - Currency: INR or USD
   - Stock Price: (e.g., 1450)
   - Quantity: (e.g., 10)
4. Tap **"Add"**

### Update Stock Prices
- Tap **"Stocks"** button to update all stocks at once
- Or tap 🔄 icon on individual stock for single update

### Set Exchange Rate
- Tap **"💱 ₹83.00"** to update USD to INR rate
- Enter current rate (e.g., 83.25)
- All USD investments auto-recalculate!

---

## 💵 Add Your First Expense

1. Go to **Expenses** (from side menu)
2. Tap **"+"** button
3. Fill in details:
   - Title: "Lunch"
   - Amount: 500
   - Category: Food
   - Description: "Team lunch at Italian restaurant"
   - Date: (auto-filled with today)
4. Tap **"Add"**

### Filter Expenses
- Tap **clock icon** (🕐) for date filters
- Choose: Today, This Week, This Month, This Year, or Custom Range
- View totals and month-wise breakdown

---

## 🔐 Save Your First Credential

1. Go to **Credentials** (from side menu)
2. Tap **"+"** button
3. Fill in details:
   - Service: "Netflix"
   - Username: your@email.com
   - Password: ••••••••
   - Tag: "Streaming"
   - Description: "Family account"
   - Additional Details: (optional)
4. Tap **"Add"**

### View Credentials
- Tap **"View"** to see all details
- Tap **eye icon** to show/hide password
- Use **Search** to find quickly

---

## 🎯 Pro Tips

### Security
- ✅ **Always lock your phone** - Your data is protected by PIN/Fingerprint
- ✅ **Remember your PIN** - It cannot be recovered!
- ✅ **Enable Fingerprint** for quick access

### AI Usage
- 💡 **Add multiple API keys** for automatic fallback
- 💡 **Clear chat** when switching topics to save tokens
- 💡 **Switch contexts** to analyze different data (Cards/Expenses/Investments)

### Credit Cards
- 🔄 **Update rules monthly** for latest card benefits
- 🔍 **View stored benefits** before AI calls for faster checks

### Investments
- 📈 **Update stocks manually** if needed (tap individual refresh icon)
- 💱 **Keep exchange rate current** for accurate USD valuations
- 🏷️ **Use ticker caching** - First fetch resolves ticker, subsequent fetches are faster

### Expenses
- 📅 **Use date filters** for monthly reviews
- 📊 **Check month-wise grouping** for expense trends
- 🔍 **Search by title** or description for quick lookup

---

## 📤 Backup & Restore

### Export Your Data
1. Open **Side Menu** (☰ icon)
2. Tap **"📤 Export Data"**
3. Confirm export
4. **Android**: File saved to `Documents/myassistant_backup_<timestamp>.json`
5. **Web**: File downloaded to browser's Downloads folder

💡 **File Location (Android)**:
- Open **Files app** → **Documents** folder
- Find `myassistant_backup_*.json`
- File is in human-readable JSON format

### Import Your Data
1. Open **Side Menu** (☰ icon)
2. Tap **"📥 Import Data"**
3. Select your backup JSON file
4. Confirm import
5. ✅ All data restored!

### Reset App
1. Open **Side Menu** (☰ icon)
2. Tap **"🔄 Reset App"**
3. Confirm reset (⚠️ **WARNING**: This will delete all data!)
4. App automatically exports backup before resetting
5. App restarts with fresh data

💡 **Use Cases**:
- **Backup**: Before updating app or resetting device
- **Transfer**: Move data to new device
- **Recovery**: Restore after accidental deletion

---

## 🆘 Troubleshooting

### "No AI provider configured"
- Go to Settings → Add at least one API key

### "Resources exhausted" or "429 Rate Limit"
- **Automatic**: App will try next provider
- **Manual**: Add more API keys for better fallback

### "Stock not found"
- Try full company name (e.g., "Infosys Limited")
- Or use ticker directly (e.g., "INFY" or "INFY.NS")

### Fingerprint not working
- Check device settings: Settings → Security → Fingerprint
- Ensure fingerprint is enrolled on your device
- Fallback to PIN unlock

### App won't unlock
- Use PIN if fingerprint fails
- ⚠️ **No recovery option** - You must remember your PIN

---

## 📚 Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- Read [README.md](README.md) for complete feature list
- Explore all features and customize to your needs!

---

**Enjoy your AI-powered personal assistant! 🎉**
