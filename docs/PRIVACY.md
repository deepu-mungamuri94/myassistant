# Privacy Policy — My Assistant

**Effective date:** [EFFECTIVE DATE — PLACEHOLDER]

**App:** My Assistant (Android package `com.personal.myassistant`)
**Contact:** [CONTACT EMAIL — PLACEHOLDER]

---

## 1. Introduction & who this covers

My Assistant is a personal finance assistant app for Android. This policy explains what
information the app handles, where it is kept, and the limited situations in which some of
your information leaves your device.

This policy applies to you if you install and use the My Assistant Android app. It covers
the app itself and the optional third-party services the app can connect to on your behalf
(described in Section 4).

**The most important thing to understand:** My Assistant has **no first-party server or
backend of its own.** We do not operate any cloud service that receives, stores, or processes
your data. The app runs entirely on your device. The only times your information leaves your
phone are (a) when *you* ask the built-in AI assistant a question, (b) when the app looks up
public stock/fund prices, and (c) if *you* choose to turn on optional encrypted backup to your
own Google Drive. Each of these is explained below.

---

## 2. What data the app processes (by category)

You enter your own financial and personal information into the app. The app stores and works
with the following categories of data **on your device**. Nothing in this section is sent to
us — we have no servers to send it to.

### Financial information
- **Payment cards** — card name, full card number, expiry, CVV, card type, credit limit,
  outstanding balance, statement/bill dates, EMIs, and benefits.
- **Card bills** — amounts, due dates, minimum due, and payment status.
- **Card groups and bank ordering** — how you organize cards and banks.
- **Expenses** — title, description, amount, category, date, and payment method.
- **Income and payslip profile** — CTC, basic pay, HRA, PF, tax slabs, deductions, insurance,
  bonus, leave, and related figures.
- **Actual salary credits and additional income** — recorded bank credits and other income
  with amounts and dates.
- **Investments** — portfolio and monthly holdings (name, type, goal, quantity, price, amount,
  tenure, interest rate), share prices, and SIP plans.
- **Recurring expenses and planned expenses (Plans)** — names, amounts, and dates.
- **Loans** — bank, loan type, reason, amount, interest rate, tenure, and EMI dates.
- **Cash and savings** — current balance and history.
- **Settlement and exchange/gold-rate data** — bill-settlement selections and reference rates.

### Personal information
- **Login credentials / password vault** — services, usernames, passwords, and notes that you
  choose to store. This is highly sensitive information kept only for your own reference.
- **Money lent** — the name of a person you lent money to (third-party information you enter),
  along with amounts, dates, purpose, and notes.
- **Security state** — your app PIN (stored only as a cryptographic hash, never as the PIN
  itself), whether biometric unlock is enabled, and your master password used for backup
  encryption.

### App activity and settings
- **Chat history** — transcripts of conversations you have with the built-in AI assistant.
  These are stored locally on your device.
- **App settings** — your chosen AI provider, model, priorities, pay schedule, and similar
  preferences.
- **AI provider API keys** — if you enter your own API keys for an AI provider, they are
  stored on your device and used to authenticate requests to that provider.
- **Cloud backup configuration** — if you enable Google Drive backup: a public OAuth client
  ID, your display email, backup status/timestamps, and an encrypted copy of your Google Drive
  refresh token.

The app also stores a few small non-sensitive interface preferences on your device (for
example, which dashboard categories you have hidden, and whether you dismissed a monthly
budget reminder).

---

## 3. Where your data is stored

**All of your data is stored on your device.** The app keeps it in the app's local storage,
inside the app's private sandbox on Android.

**Honest disclosure — data is not yet encrypted at rest.** At this time your on-device data is
stored in **plaintext** (unencrypted) in the app's local storage. Encryption-at-rest is a known
pending improvement and is **not** implemented yet. This means:

- If someone gains access to the app's private storage on your device (for example, on a rooted
  or compromised device, or through a device-level exploit), the stored data — including
  sensitive items such as saved passwords, full card numbers, and CVVs — could be readable.
- Your app **PIN is not stored in plaintext.** It is protected with a salted, slow one-way hash
  (PBKDF2 with SHA-256, 200,000 iterations), so the PIN itself cannot be read back from storage.
- Your **master password** (used to encrypt backups) *is* currently stored in plaintext within
  the same on-device storage. It is removed from any backup you export or upload, but it remains
  on the device. As a result, the encryption applied to backups does **not** protect your data
  against someone who can already read your device's local storage.

To reduce risk, Android's own backup mechanisms are disabled for this app (the app is configured
with `allowBackup=false`), so your local data is **not** swept into Android auto-backup or
`adb backup`.

We are working toward encrypting data at rest in a future update. Until then, please treat the
security of your physical device (screen lock, keeping the OS updated, avoiding rooted/untrusted
devices) as an important part of protecting your information.

---

## 4. Third parties that receive data

The app never sends your data to us, because we have no servers. Data leaves your device only
in the specific cases below.

### 4.1 AI assistant providers (only when you ask a question)
When you use the built-in AI assistant, the app sends your question along with a **financial
summary** to the AI provider you have configured. Depending on your settings, that provider may
be one of:

- **Google Gemini**
- **OpenAI (ChatGPT)**
- **Perplexity**
- **Groq**

**What is sent:** your typed question plus context relevant to that question, which may include:
your expense records (title, description, amount, category, date, and the *nickname/name* of a
card used to pay — never the card number); your investment holdings (name, type, goal, value,
quantity, price, currency); a high-level profile snapshot (such as your average monthly income,
active SIP totals, and pending plan totals); your credit-card **names, benefit descriptions, and
your notes**; and dashboard insight data such as loan details (name, rate, EMI, remaining
balance, tenure), card-EMI summaries, recurring-payment names, and investment-by-month figures.

**What is never sent to AI is listed in Section 5.**

You provide your own API key for these providers, and your use of each provider is also subject
to that provider's own privacy policy and terms. Requests are sent over encrypted (HTTPS)
connections.

### 4.2 Stock and fund price services (ticker symbols only)
To show current prices, the app contacts public market-data services. These receive **only
stock ticker symbols, company search terms, or mutual-fund scheme codes** — never your personal
or financial-amount data. These services include:

- **Yahoo Finance**, **Finnhub**, and **Alpha Vantage** — stock quotes and symbol search.
- **mfapi.in** — Indian mutual-fund NAV lookups.
- **frankfurter.app** — USD-to-INR exchange rate.

All requests are sent over encrypted (HTTPS) connections. No account, personal, or financial-
amount information is included.

### 4.3 Google Drive (optional, encrypted backup you turn on)
Backup is **off by default.** If you choose to enable it, you sign in with **your own Google
account** and the app stores an **encrypted** copy of your data in a hidden, app-specific folder
in your Google Drive (the app only requests access to its own dedicated folder, not your whole
Drive).

- The backup is encrypted **on your device before upload** using **AES-256-GCM**, with the
  encryption key derived from **your master password** (via PBKDF2-SHA256). Only the encrypted
  blob is uploaded — Google receives ciphertext, not readable data.
- Before encryption, the backup omits your PIN hash, biometric flag, master password, and login
  tokens.
- The app also reads your Google account email (to display which account is connected).
- Your Google Drive refresh token is itself stored encrypted (AES-256-GCM) on the device;
  short-lived access tokens are kept only in memory.

Your use of Google Drive is subject to Google's own privacy policy and terms.

### 4.4 What we do NOT share
We do **not** sell your data, and we do **not** share it with advertisers, data brokers, or any
analytics/marketing companies. See Section 6.

---

## 5. What is NEVER sent to the AI assistant

The app is deliberately built so that the following are **never** included in anything sent to
any AI provider. These exclusions have been verified in the app's source code:

- **Full card numbers (PAN)** — never sent.
- **Card CVV / security codes** — never sent.
- **Card credit limits** — never sent.
- **Card outstanding (revolving) balances** — never sent.
- **Card expiry dates and statement/bill dates** — never sent.
- **Raw card-EMI arrays** — not sent (only high-level EMI summaries such as a card nickname,
  reason, amount, and counts are used for cash-flow insights).
- **Your entire login credentials / password vault** — never sent to any AI provider under any
  circumstance.
- **Your PIN hash, master password, and biometric setting** — never sent to AI.
- **The "money lent" list** (including the other person's name) — never sent to AI.
- **Raw payment-method details for an expense** — the app forwards only a resolved card
  *name* for display, never the underlying card identifier or number.

When a card is involved in AI features, only the card's **name, benefit text, and your own
notes** are shared.

---

## 6. Data the app does NOT collect

We have verified in the app's code that My Assistant does **not** include any of the following:

- **No first-party servers or accounts.** There is no My Assistant cloud service and no
  My Assistant login. We cannot see your data.
- **No analytics or usage tracking.** The app contains no analytics or telemetry SDKs (for
  example, no Google Analytics, Firebase Analytics, Mixpanel, Amplitude, Segment, or similar).
- **No crash/error reporting services.** No Crashlytics, Sentry, Bugsnag, or comparable tools.
- **No advertising or ad networks.** No AdMob, ad SDKs, or ad identifiers are used, and no
  advertising or marketing profiles are built.
- **No third-party trackers or attribution SDKs.**
- **No location collection.** The app does not request or collect device location.

The only network connections the app makes are the ones you trigger and control, as described
in Section 4.

---

## 7. Security

We take reasonable measures to protect your information, while being honest about current
limitations:

- **App lock:** Access to the app is protected by a PIN. The PIN is stored only as a salted,
  slow one-way hash (PBKDF2 with SHA-256, 200,000 iterations) — the PIN itself is never stored.
  Repeated wrong PIN entries trigger a temporary lockout to slow brute-force attempts.
- **Biometric unlock (optional):** You may enable fingerprint/biometric unlock, handled by the
  Android system biometric APIs.
- **Encryption in transit:** All network requests (to AI providers, price services, and Google
  Drive) use encrypted HTTPS connections.
- **Encrypted cloud backup:** Optional Google Drive backups are encrypted with AES-256-GCM using
  a key derived from your master password before they leave the device.
- **Android backup disabled:** The app disables Android's system backup so your local data is
  not copied off-device by the operating system.
- **Known limitation — encryption at rest:** As stated in Section 3, on-device data is **not**
  yet encrypted at rest, and the master password is currently stored in plaintext on the device.
  Please protect your device with a screen lock and keep it updated.

No method of electronic storage or transmission is perfectly secure, and the physical security
of your device is an important part of keeping your data safe.

---

## 8. Data retention & your control

- **You are in control.** All of your data lives on your device. You can view, edit, and delete
  any of it from within the app at any time.
- **Export:** You can export an encrypted backup of your data (encrypted with your master
  password).
- **Delete / wipe:** The app provides the ability to wipe your data. You can also clear the app's
  data from Android system settings.
- **Uninstalling the app** removes the app's local data from your device. If you enabled Google
  Drive backup, any backup file stored in your Google Drive remains there until you delete it
  from your Google account; you can remove it at any time through Google Drive.
- **AI providers and Google:** Data you send to an AI provider, or backups you store in Google
  Drive, are retained according to those companies' own policies. Please review their privacy
  policies for details, and use their account controls to manage that data.
- **Retention by us:** Because we operate no servers, we do not retain any of your data. There is
  nothing for us to delete on your behalf.

---

## 9. Children's privacy

My Assistant is a personal finance tool intended for adults. It is **not directed to children**,
and we do not knowingly collect information from children. The app has no servers and does not
collect data centrally, but the app is not intended for use by children under the age of 13 (or
the minimum age required in your jurisdiction). If you believe a child has used the app on a
device you control, you can wipe the app's data as described in Section 8.

---

## 10. Changes to this policy

We may update this policy from time to time, for example to reflect new features (such as the
planned encryption-at-rest improvement) or changes in the third-party services the app can
connect to. When we make changes, we will update the "Effective date" at the top of this policy
and publish the revised version with the app. Significant changes will be reflected in the app or
its listing. Your continued use of the app after an update means you accept the revised policy.

---

## 11. Contact

If you have questions about this policy or about your privacy while using My Assistant, contact:

**[CONTACT EMAIL — PLACEHOLDER]**

---

*This policy describes My Assistant as an on-device application with no first-party backend. It
was written to be accurate to how the app actually works, including its current limitations.*
