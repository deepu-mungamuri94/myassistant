# Google Play Store Listing — My Assistant

> **Package:** `com.personal.myassistant` · **Category:** Finance · **Content rating target:** Everyone
>
> This document is the **copy + asset spec** for the Play Console listing. It contains the exact
> text to paste and briefs for the visual assets. **It does NOT produce the visual assets.**
> The feature graphic and all screenshots are **OWNER / DESIGNER TODOs** — they must be captured
> from the running app (screenshots) and designed/rendered (feature graphic) by the owner before
> submission. See sections 3 and 4.
>
> **Honesty guardrails baked into this copy (do not "improve" past these):**
> - Do **NOT** claim "bank-grade encryption", "military-grade encryption", or that on-device data
>   is encrypted at rest. On-device data is stored in plaintext in the WebView's local storage;
>   at-rest encryption is a known pending item. The copy below only claims what is true:
>   your PIN is hashed+salted, and **cloud backups are encrypted** with your master password.
> - Do **NOT** imply there is an account, a login server, or that we hold your data. There is no
>   first-party backend; everything runs on your device.
> - AI is **optional and bring-your-own-key**: the app calls third-party AI providers only if you
>   add your own API key, and only a financial *summary* is sent (never card numbers, CVV, credit
>   limits, card balances, or your password vault). The copy states this plainly.

---

## 1. Store listing text

### App title
> **My Assistant — Finance**

- **Character count: 22 / 30** ✅ (the em-dash counts as one character)
- Notes: "My Assistant" alone (12 chars) is the installed launcher/app name (`strings.xml`,
  `capacitor.config.json`). The " — Finance" qualifier disambiguates it in Play search, since
  "My Assistant" is generic. If you prefer the bare launcher name, use **`My Assistant`**
  (**12 / 30**). Do not exceed 30 characters either way.

### Short description
> **On-device finance tracker + optional AI assistant. Data stays on your phone.**

- **Character count: 76 / 80** ✅
- Notes: Leads with the two honest differentiators (on-device + optional AI). No encryption claim.

### Full description
> **My Assistant is a private, on-device personal finance tracker.**
>
> Track cards, expenses, income, investments, loans, SIPs, and future plans in one clean app —
> and optionally ask an AI assistant about your money. There is no account to create and no
> sign-up. Everything you enter is stored locally on your own phone.
>
> **What you can do**
> • Expenses — log spending by category, see where your money goes, spot recurring payments.
> • Cards — keep track of your cards, benefits, bills, and card-based EMIs in one place.
> • Income & salary — record salary credits, additional income, and your pay schedule.
> • Investments — track a portfolio, monthly investments, SIPs, and live share/fund prices.
> • Loans — record loans, interest rates, EMIs, and remaining balances for cash-flow planning.
> • Plans — set future planned expenses with target dates and amounts.
> • Money lent — remember who owes you what.
> • Dashboard & insights — a monthly overview with charts and AI-written spending insights.
>
> **AI assistant (optional — bring your own key)**
> Ask questions like "How much did I spend on food last month?" or "Can I afford this plan?"
> The AI features are **optional** and require **your own API key** from a supported provider
> (Google Gemini, OpenAI ChatGPT, Perplexity, or Groq). Keys are entered by you and stored on
> your device. When you use the assistant, only a **financial summary** relevant to your question
> is sent to the provider you configured. We **never** send your full card numbers, CVV, credit
> limits, card outstanding balances, or your saved passwords — those never leave your phone.
> If you add no key, the AI features simply stay off; the rest of the app works fully offline.
>
> **Privacy & your data**
> • No first-party servers. There is no "My Assistant" account and we do not collect or receive
>   your data. Your financial records live in your phone's local app storage.
> • Locked with a PIN. Your PIN is protected with salted PBKDF2-SHA256 hashing, and you can add
>   biometric (fingerprint) unlock if your device supports it.
> • Optional cloud backup to YOUR Google Drive. If you turn it on, backups are **encrypted with
>   your own master password (AES-256-GCM)** before they are uploaded to a private folder in your
>   own Google account. You hold the password; without it a backup can't be read.
> • Stock/fund prices are fetched using ticker symbols only — no personal or financial amounts
>   are sent to price providers.
>
> **Important**
> • You need your own AI provider API key to use the AI assistant. Provider usage is subject to
>   that provider's own terms and may incur costs on your provider account.
> • This app is a personal record-keeping and organization tool. It is **not** financial, tax, or
>   investment advice, and it does not connect to your bank. Always verify important numbers
>   yourself.
> • An internet connection is used for AI answers, live prices, and optional Drive backup. Core
>   tracking works offline.

- **Character count: 2,887 / 4,000** ✅ (well within limit; leaves room for localized edits)
- Notes: No "encryption at rest" claim for on-device data. Cloud-backup encryption is stated
  because it is verified in code (AES-256-GCM via master password). AI is framed as optional +
  BYO-key, with the exact exclusions from the data inventory.

---

## 2. Category, tags, and content rating

### Category & contact
- **Application type:** App
- **Category:** **Finance** (matches the Play "Finance" category the app targets)
- **Tags (Play "app tags", pick up to 5 relevant):** Personal finance · Budgeting · Expense tracker · Money manager · Investment tracking
- **Store settings to have ready:**
  - **Privacy Policy URL** — **REQUIRED** for the Finance category (also required because the app
    sends data to third-party AI providers). OWNER TODO: host a privacy policy and paste the URL.
  - **Support email** — OWNER TODO.
  - **Website** (optional) — OWNER TODO.

### Content rating (IARC questionnaire) — answer notes
Fill the IARC questionnaire honestly; expected result is **Everyone / PEGI 3**. Guidance:
- **Violence / sexual content / profanity / controlled substances / gambling:** **None.** The app
  is a finance tracker with no such content. (Note: it does **not** offer real-money gambling,
  simulated gambling, or lootboxes — answer "No" to all gambling items.)
- **User-generated content / social features / user communication:** **None.** No chat between
  users, no forums, no sharing to other users. (The "AI chat" is a private request to a
  third-party API, not user-to-user communication.)
- **Shares user location:** **No.** The app requests no location permission and shares no location.
- **Digital purchases:** **No** in-app purchases in the app itself. (Any cost is on the user's own
  third-party AI provider account, outside Play billing.)
- **Personal information collected/shared:** You will declare data handling in the **Data Safety**
  form (separate from IARC), not the content-rating questionnaire. See the note below.

### Data Safety form — cross-reference (separate Console section, must be consistent with this copy)
Not part of this text package, but must agree with the description. Ground truth for it:
- **Financial info** (expenses, income, investments, loans, cards metadata) and **app info**
  (settings) are handled **on-device**; **a summary is shared with third-party AI providers** the
  user configures, and **stock symbols** with price APIs. Optional **encrypted backup** to the
  user's own Google Drive.
- Declare **data is NOT encrypted at rest on the device** (do not tick "encrypted in transit and
  at rest" for on-device storage). Data **is** encrypted in transit to all network endpoints.
- Full card number, CVV, credit limit, card outstanding balance, and the password vault are
  **never shared** with AI. Keep the Data Safety declaration aligned with the "Privacy & your data"
  paragraph above.

---

## 3. Screenshot shot-list — **OWNER TODO (capture from the running app)**

> These images **cannot** be generated by this document. The owner must run the app (emulator or
> device), navigate to each screen with realistic-but-non-sensitive sample data, and capture a
> screenshot. **Do not show real card numbers, CVV, real passwords, or a real Drive email** in any
> screenshot. Use dummy data.

**Play requirements for phone screenshots (verify current Console rules at upload):**
- **Count:** minimum **2**, maximum **8**. Provide **6** for a strong listing (below).
- **Format:** PNG or JPEG (PNG recommended for crisp UI text).
- **Aspect ratio:** between **9:16 (portrait)** and **16:9 (landscape)**. This app is portrait —
  shoot **portrait 9:16**.
- **Dimensions:** each side between **320 px and 3840 px**; the longer side must be **≤ 2× the
  shorter side**. **Recommended: 1080 × 1920 px** (or 1440 × 3120 to match a modern device).
  Keep every screenshot the **same dimensions** for a uniform gallery.
- (Optional but recommended) add a short caption/marketing banner baked into each frame; keep the
  actual UI unobstructed.

**Shots to capture (in gallery order):**
1. **Splash / login (PIN unlock).** Caption: *"Locked with a PIN — your finances, private by default."*
2. **Dashboard / monthly overview.** Caption: *"See your whole month at a glance."*
3. **Expenses list (with category chips/charts).** Caption: *"Track every expense by category."*
4. **AI chat answering a money question.** Caption: *"Ask your AI assistant — bring your own key."*
   (Use a benign prompt like "How much did I spend on food last month?" with dummy data.)
5. **Plans (planned expenses) — amber accent page.** Caption: *"Plan ahead for what's coming."*
6. **Investments / portfolio (or Cards page).** Caption: *"Portfolio, SIPs and live prices in one place."*

> **Optional extra assets (only if you have the frames):**
> - **7-inch & 10-inch tablet screenshots** — only needed if you market the app as tablet-optimized;
>   otherwise skip. Same format rules; larger dimensions.
> - **Promo/feature video (YouTube URL)** — optional.

---

## 4. Feature graphic design brief (1024 × 500) — **OWNER / DESIGNER TODO**

> The feature graphic is a **hard requirement** to publish. This document **does not** produce it —
> it is a brief a designer or an image-generation tool can execute. Deliver as **PNG or JPEG,
> exactly 1024 × 500 px, no alpha/transparency, RGB**. Assume Play may overlay a play button or
> crop edges slightly, so keep all text and the logo **well inside a ~924 × 400 safe area**
> (roughly 50 px padding on the sides, 50 px top/bottom).

**Concept:** clean, modern fintech card — "calm control of your money, privately."

**Layout (left-to-right):**
- **Left third:** the app's rounded avatar/logo mark on a soft circle. Use the app's existing brand
  gradient for the mark: **indigo→violet (#667eea → #764ba2)** — this is the app's splash/menu
  gradient, so the graphic matches first launch.
- **Center:** the wordmark **"My Assistant"** (bold, large) with the tagline beneath in a lighter
  weight: **"Private, on-device finance — with an optional AI assistant."** Keep the tagline short
  enough to stay legible when the banner is scaled down in the Play carousel.
- **Right third:** 2–3 lightweight UI motifs floating at a slight tilt — a small **donut/expense
  chart**, a **card tile**, and a **plan/target chip**. Render these as simplified vector shapes,
  not real screenshots (screenshots have their own slots).

**Color:**
- **Primary background:** a smooth diagonal gradient using the app's brand indigo→violet
  (**#667eea → #764ba2**), top-left to bottom-right, matching the splash screen.
- **Accent pops:** draw from the app's **per-page color families** so the graphic feels native:
  the header **blue→cyan (#2563eb → #0891b2)** for the chart motif, **emerald/green** for a positive
  balance figure, and **amber/orange (~#f59e0b, the Plans accent)** for the "plan/target" chip.
  Use accents sparingly (one element each) so the banner stays clean, not rainbow.
- **Text:** white or near-white (#FFFFFF / #F8FAFC) for maximum contrast on the indigo background.

**Typography & mood:**
- Sans-serif, modern, friendly-but-trustworthy (e.g., Inter / system UI). Wordmark bold; tagline
  regular. Generous spacing.
- **Mood:** calm, private, in-control, premium-but-approachable. Avoid clutter, avoid stock photos
  of money/cash, avoid anything implying a bank connection or "guaranteed returns."

**Must NOT include (compliance):**
- No "bank-grade / military-grade / fully encrypted" claims or lock-with-shield imagery that
  implies at-rest encryption of on-device data.
- No real card numbers, logos of banks/card networks, or third-party AI provider logos/trademarks.
- No claims of financial returns or advice.

---

## Asset checklist (for the owner, before submitting)
- [ ] App title, short description, full description pasted (counts above).
- [ ] Category = Finance; tags set; **Privacy Policy URL** + support email filled.
- [ ] IARC content-rating questionnaire completed (expect Everyone/PEGI 3).
- [ ] **Data Safety** form completed and consistent with section 2 (on-device storage NOT marked
      encrypted at rest; AI/data-sharing disclosed; exclusions honored).
- [ ] **App icon** 512 × 512 (32-bit PNG) uploaded. *(Separate from the feature graphic; OWNER TODO.)*
- [ ] **Feature graphic** 1024 × 500 designed per section 4. *(OWNER/DESIGNER TODO — not produced here.)*
- [ ] **≥ 2 (recommended 6) phone screenshots**, portrait 9:16, ~1080 × 1920, per section 3.
      *(OWNER TODO — captured from the running app with dummy data.)*
- [ ] Signed release AAB built (see `docs/RELEASE.md`).
