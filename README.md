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

### ☁️ **Cloud Backup & Disaster Recovery**
- **Automatic Google Drive backups** to a hidden, per-app folder (`drive.appdata` scope)
- **End-to-end encrypted**: same AES-256-GCM blob as manual exports — Google sees ciphertext only
- **Debounced auto-upload** after every data change (default 5 minutes of inactivity)
- **Version rotation**: keeps last 10 backups, deletes older ones automatically
- **OAuth 2.0 + PKCE flow** — no third-party auth plugin, refresh token encrypted with your master password
- **One-tap restore on a new device** — sign in, enter master password, pick a version
- Manual encrypted export/import to local file (Share sheet) remains available as a fallback

---

## 🚀 Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+) with modular architecture
- **Styling**: TailwindCSS with custom gradient animations
- **Mobile**: Capacitor 7.x for native Android
- **AI Integration**: Multi-provider support (Gemini, ChatGPT, Perplexity)
- **Security**: Biometric Authentication Plugin, SHA-256 hashing, AES-256-GCM encryption for backups
- **APIs**: Yahoo Finance, Finnhub, Alpha Vantage for stock prices
- **Storage**: LocalStorage with structured data persistence
- **Cloud Backup**: Google Drive REST API v3 (`appDataFolder` scope) via OAuth 2.0 Authorization Code + PKCE

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

# Sync web assets + plugins into the Android project
npx cap sync android

# Open in Android Studio
npx cap open android
```

> ℹ️ **Vendored front-end libraries.** The app loads Tailwind, Chart.js, marked,
> and Capacitor's web modules from `www/vendor/` (not from a CDN) so it works
> fully offline. **These files are committed to the repo**, so a fresh clone is
> ready to build with no extra step. You only need to regenerate them when
> **bumping a pinned version** — edit the version in `www/vendor/download-vendors.sh`,
> then run `bash www/vendor/download-vendors.sh` and `npx cap sync android` again.
> (Note: the script fetches Tailwind from its unversioned play-CDN URL, so the
> committed copy is your pinned, known-good build.)

### Build & run

```bash
# After the steps above, either open Android Studio and press Run ▶, or:
cd android && ./gradlew installDebug   # installs a debug build on a connected device/emulator
```

Whenever you change anything under `www/`, re-run `npx cap sync android` before
rebuilding. If you edited `index.html`'s vendored `<script>` references or bumped
a pinned version, re-run `download-vendors.sh` first.

### Verifying a build (smoke test)

After installing, a 30-second sanity pass:

1. **Vendoring is correct** — the app launches **styled** (gradients/cards, not raw
   HTML), the dashboard **charts render**, and AI replies render as **markdown**.
   If it's unstyled or charts are missing, `download-vendors.sh` didn't run.
2. **Unlock works** — the PIN screen appears, the field is auto-focused, and PIN /
   biometric unlock succeeds.
3. **Confirm dialogs** — a delete action (e.g. a SIP or a plan) shows the in-app
   themed confirm modal (not a native browser dialog) and both Confirm/Cancel work.
4. **Cloud backup** (if configured) — make a change, background the app, reopen, and
   confirm Settings shows a healthy/recent backup status.

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

## 💾 Backup & Restore

The app offers **two layers** of backup. Configure both for maximum safety:

| Layer | What it does | When to use |
|---|---|---|
| **Manual encrypted export** | Generates a `.enc` file → opens Android Share sheet | Ad-hoc backup before a risky action (Reset App, device migration) |
| **Automatic Google Drive backup** | Encrypted blob auto-uploaded after every data change (debounced) | Always-on insurance against device loss / theft / corruption |

Both layers reuse the same **master password** for AES-256-GCM encryption. **Without the master password, no backup can be decrypted — by anyone, including Google.**

### Master Password

Before any backup can run, set a master password:
1. Open the app → **⚙️ Settings**
2. Under **🔐 Master Password (for Export/Import)**, enter a password (min 6 chars)
3. Tap **Save**

> ⚠️ **Write this password down somewhere physical.** If you lose it, your backups become permanently unrecoverable. That's by design — the app cannot reset it for you.

### Manual Encrypted Export / Import

- **Export**: Settings menu (⚙️ icon top-right) → **Export Data** → **Download Backup File** → Android Share sheet opens → save to Google Drive / Email / WhatsApp / etc. File name: `myassistant_backup_<timestamp>.enc`
- **Import**: Settings menu → **Import Data** → pick the `.enc` file → enter the master password used at the time of export → tap **Decrypt & Import**

### Automatic Google Drive Backup (Recommended)

This is a **one-time setup** that takes ~5 minutes. After that, every data change you make is silently and automatically backed up to a hidden folder in your own Google Drive.

#### How it works

1. The app uses the **`drive.appdata` scope** — a per-app sandbox folder invisible in your normal Google Drive UI. The app cannot read any other files in your Drive.
2. Authentication uses **OAuth 2.0 Authorization Code + PKCE**. A short-lived `access_token` (1 hour) lives only in memory; a long-lived `refresh_token` is **encrypted with your master password** before being written to local storage.
3. After every `Storage.save()`, an upload is **debounced for 5 minutes**. If you keep making changes, the timer resets — only the latest snapshot is uploaded once you've been idle.
4. The uploaded blob is the **exact same AES-256-GCM ciphertext** the manual export produces. Google sees opaque bytes only.
5. After each successful upload, **old backups are rotated**: the newest 10 versions are kept, older ones deleted.

#### One-time setup

##### Step 1 — Get your debug keystore SHA-1 fingerprint

Google needs to verify that OAuth requests are coming from *your* APK, not from someone who copied your Client ID. The proof is the SHA-1 of your app-signing certificate.

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

Look for the line starting with `SHA1:`. It looks like:

```
SHA1: DB:3A:14:68:33:C6:F1:AD:B9:64:61:96:01:3A:CE:2B:31:2B:8A:41
```

Copy that whole string (with the colons).

> **Note:** The debug keystore is per-machine. If you move computers or reinstall macOS, Android Studio generates a new keystore with a new SHA-1 — you'll just need to add the new one to the Google OAuth client (see Step 3).

##### Step 2 — Google Cloud Console: project, API, consent screen

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) → **Create Project** → name it e.g. `MyAssistant`.
2. **Enable Drive API**: top search bar → "Google Drive API" → **Enable**.
3. **OAuth consent screen** (left nav under "APIs & Services"):
   - User type: **External**
   - App name: `My Assistant`, your email for user support + developer contact
   - **Scopes** step → **Add or Remove Scopes** → manually add `https://www.googleapis.com/auth/drive.appdata`
   - **Test users** step → add your own Google account (the one whose Drive will hold the backups). You can keep the app in "Testing" mode forever — no need to publish — as long as only your own accounts use it.

##### Step 3 — Create the OAuth Client ID

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
2. Application type: **Android**
3. Name: anything, e.g. `My Assistant - Debug`
4. **Package name**: `com.personal.myassistant`
5. **SHA-1 certificate fingerprint**: paste the value from Step 1
6. Click **Create** → copy the resulting **Client ID** (looks like `123456789-abc...apps.googleusercontent.com`)

> The Client ID is a **public** identifier — safe to commit to git or share. Only the SHA-1 + user consent prove ownership.

##### Step 4 — Connect inside the app

1. Open the app → **⚙️ Settings**
2. Scroll to **☁️ Cloud Backup (Google Drive)**
3. Paste the Client ID into **Google OAuth Client ID**
4. Tap **Save**
5. Tap **🔗 Connect Google Drive** → Google's consent screen opens in the in-app browser → approve → focus returns to the app
6. You should see `Status: ✓ Healthy` with `Account: <your email>`. The first backup runs immediately.

That's it. From now on, every data change triggers a debounced upload in the background.

#### Day-to-day operations

Under Settings → ☁️ Cloud Backup, you'll see:

| Button | What it does |
|---|---|
| **☁️ Back up now** | Force an immediate upload (skips the 5-minute debounce) |
| **📥 Restore from cloud** | Lists all versions in your Drive → pick one → enter master password → restore |
| **🚪 Sign out** | Revokes the refresh token with Google and wipes local cloud state |

#### Restore on a new device

If your old phone dies, gets stolen, or factory-resets:

1. Install the app on the new phone → set a PIN → set the **same master password** as before
2. **Settings → ☁️ Cloud Backup** → paste the same Client ID → tap **Save**
3. Tap **🔗 Connect Google Drive** → sign in with the **same Google account**
4. Tap **📥 Restore from cloud** → pick the newest version → enter master password → tap **Restore**
5. The app reloads with all your data intact

#### Releasing to Play Store later

When you're ready to build a signed release APK:

1. Generate a release keystore via **Android Studio → Build → Generate Signed Bundle / APK** (or use `keytool -genkeypair`)
2. Run the same `keytool -list -v` command against that release keystore (with the password you chose) to get its SHA-1
3. In Google Cloud Console → Credentials → click your Android OAuth client → **Add fingerprint** → paste the release SHA-1

The same Client ID will then work for both your debug builds (testing on your phone) and your release builds (Play Store / sideloaded production).

#### Privacy & security guarantees

- The payload uploaded to Drive is **AES-256-GCM ciphertext**, encrypted with a key derived from your master password via **PBKDF2-SHA256, 100,000 iterations**, with a random 16-byte salt and 12-byte IV per file. Google has no way to read it.
- The `drive.appdata` scope means the app has access **only** to its own private folder — not your other Drive files, not your other apps' folders.
- The OAuth `refresh_token` is itself encrypted with the master password before being written to local storage. A forensic dump of the phone yields nothing useful to an attacker without the master password.
- The `access_token` (1-hour lifetime) is never persisted; it lives only in JS memory and is dropped on app close.
- Your **PIN hash, biometric setting, and master password** are explicitly **stripped** from the backup payload before encryption — backups are portable across devices but never carry device-specific secrets.

#### Troubleshooting

##### Setup errors you will likely hit

These are the three real-world hiccups encountered while wiring this up for the first time. If you're following the setup steps for the first time, you'll probably see at least the first two — both are policy speed bumps from Google's side, not bugs in the app.

###### 1. `"Custom URI scheme is not enabled for your Android client"`

**When it appears:** First tap of **Connect Google Drive**. The in-app browser opens, you see Google's loading screen, then a red/grey error page with `flowName=GeneralOAuthFlow` in the URL.

**Why:** As part of Google's [2024 OAuth hardening](https://developers.googleblog.com/en/improving-user-safety-in-oauth-flows-through-new-oauth-custom-uri-scheme-restrictions/), all new Android OAuth clients ship with custom URI schemes (like `com.personal.myassistant:/oauth2redirect`) **disabled by default** — to prevent malicious apps from impersonating yours by registering the same scheme. The redirect is technically still supported, but you have to explicitly opt in.

**Fix:**

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click the **name** of your Android OAuth Client ID
3. Scroll to **Advanced settings** at the bottom (expand if collapsed)
4. Toggle **Enable Custom URI Scheme** to **ON**
5. **Save** → wait ~30 seconds → retry **Connect Google Drive**

> If the toggle doesn't appear on your client, delete it and recreate it — the option is typically exposed during creation. Same package name + SHA-1; just paste the new Client ID back into the app.

###### 2. `"403 access_denied — Access blocked: My Assistant has not completed the Google verification process"`

**When it appears:** Right after fix #1 works. You get past the custom-scheme error, the Google sign-in page loads, you pick your account, and *then* Google blocks you with this message.

**Why:** Your app is in **Testing mode** on the OAuth consent screen (which is correct — see below). In Testing mode, only Google accounts on the **Test users** allowlist can sign in. The account you tried to sign in with isn't on the list yet.

> Don't be tempted to click **"Publish App"** to escape this — that's the wrong fix. Publishing triggers Google's formal verification process (weeks of review) and is meant for apps with public users. For a personal app you keep in Testing mode forever and just add Test users.

**Fix:**

1. [Google Cloud Console → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Confirm **Publishing status: Testing** and **User type: External**
3. Scroll to the **Test users** section
4. Click **+ ADD USERS** → enter the exact Gmail address you're trying to sign in with → **Save**
5. Wait ~30 seconds → retry **Connect Google Drive** in the app

After this, the OAuth flow shows a yellow "Google hasn't verified this app" warning screen — that's expected for any unverified app. Click **Advanced** → **Go to My Assistant (unsafe)** → **Continue**. Since you wrote the app, "unsafe" isn't a real concern.

**Capacity:** Testing mode supports **up to 100 test users**, with no time limit for `drive.appdata`-scoped apps. Plenty for personal / family use.

###### 3. UX: success toast appears only after closing the Settings modal

**When it appeared:** Right after the first two fixes worked, OAuth completed successfully but the Settings modal still showed the "Connect Google Drive" button — you had to close and reopen the modal to see `Status: ✓ Healthy` and the new action buttons, and the success toast only popped after you closed it.

**Why:** Android's WebView pauses repaints while the Capacitor in-app browser overlays the app. DOM changes we make in the OAuth callback execute fine in JavaScript, but the WebView doesn't commit those changes to the screen until the user interacts (touches the screen) — which "wakes" the WebView from the suspended state.

**Fix:** Already shipped in code. The OAuth completion path in ```1:1:www/js/core/cloudBackup.js
// cloudBackup.js _handleOAuthRedirect
``` now:

- Defers the success toast + UI refresh by 200ms via `setTimeout`, giving the WebView time to wake up after the browser closes
- Explicitly removes the `hidden` class from the Settings modal in case it got dismissed during the OAuth round trip
- Runs a belt-and-suspenders second UI refresh at 800ms in case the first repaint still got pre-empted by the browser-teardown animation

You shouldn't see this behavior in current builds. If you do, force-stop the app and reopen — the deferred refresh handles every reasonable transition state.

##### Quick reference (less common issues)

| Symptom | Cause / Fix |
|---|---|
| "Decryption failed" during restore | Wrong master password, or corrupted file. The password must match the one in use **at the time of that specific backup**. |
| "OAuth state mismatch" | App was killed mid-flow. Tap **Connect Google Drive** again. |
| "Google did not return a refresh_token" | Already consented before. Go to [Google Account → Security → Third-party apps](https://myaccount.google.com/permissions) → remove "My Assistant" → reconnect. |
| `Status: ⚠ Error` with `invalid_grant` | Refresh token revoked (you cleared app permissions). The integration auto-disables itself — just tap **Connect Google Drive** again. |
| Connect button does nothing | Run `npm install && npx cap sync android` and rebuild — the `@capacitor/app` + `@capacitor/browser` plugins may not be installed yet. |
| `redirect_uri_mismatch` | Package name in the OAuth client (Cloud Console) doesn't match `com.personal.myassistant`. Edit the client and fix the package name. |
| `disallowed_useragent` | Google rejecting the WebView. Should not happen with `@capacitor/browser` (uses Chrome Custom Tabs). If you ever swap to a raw WebView, this will appear — switch back to Custom Tabs. |
| Want to change the debounce / retention | Edit `DB.cloudBackup.debounceMinutes` (default 5) or `DB.cloudBackup.keepCount` (default 10) via DevTools, or expose them in your own settings UI. |
| Built a release APK, OAuth stops working | The release keystore has a different SHA-1. Add it to the same OAuth client in Cloud Console (Credentials → Android client → Add fingerprint). |
| Switched to a new computer, OAuth stops working | New machine = new `~/.android/debug.keystore` = new SHA-1. Add the new SHA-1 to the OAuth client. |

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
│       │   ├── database.js     # Data schema (incl. cloudBackup config)
│       │   ├── storage.js      # LocalStorage wrapper + cloud upload trigger
│       │   ├── cloudBackup.js  # Google Drive OAuth + auto-backup module
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

