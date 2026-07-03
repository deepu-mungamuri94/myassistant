# Google Play Data Safety — Fill-in Worksheet

**App:** My Assistant (`com.personal.myassistant`) · **Play category:** Finance
**Last reviewed:** 2026-07-03 · **Source of truth:** code audit (see file/line citations throughout)

> This is a transcription worksheet for the Play Console **App content → Data safety** section.
> Answer each field in the Console exactly as filled in below. Every claim is backed by a code
> citation. Where the honest answer is "No" (data does not leave the device), that is called out
> explicitly — see the critical modeling note next.

---

## 0. The one modeling rule that governs this whole form

Google Play defines two verbs:

- **Collected** = data leaves the user's device and is transmitted off the device (to *you* or to a
  third party you route it through), for any purpose. Processing that happens **only** on the device
  and never transmitted is **NOT** "collected."
- **Shared** = data is transferred to a **third party** (a separate company/entity).

**Consequences for this app:**

1. **There is NO first-party server/backend.** We never receive any user data ourselves.
2. **Almost all data lives only in on-device `localStorage`** (one JSON blob, key `myassistant_db`,
   `storage.js:7,54,151`). Data that is *only* stored on-device and never transmitted is **NOT
   collected** in Play's sense — even though it is highly sensitive (passwords, full card numbers,
   CVV, income, cash balances). Do **not** declare these as collected.
3. **Data that IS transmitted off-device** falls into three egress paths only:
   - **AI providers** (Gemini / ChatGPT / Perplexity / Groq) — user-configured. Receives a
     financial *summary/subset*. Because these are third-party companies, this is both **Collected
     AND Shared**.
   - **Google Drive backup** (optional, user opts in with their own Google account) — receives an
     **encrypted** blob. Third party → **Collected AND Shared**.
   - **Stock/market price APIs** (Yahoo, Finnhub, Alpha Vantage, mfapi.in, frankfurter.app) —
     receive **ticker symbols / search strings only**, never personal or financial-amount data.
     See §5 for the honest assessment of whether this is even reportable data.

So the Data safety form is driven almost entirely by **what the AI providers and the Drive backup
receive**, plus one honest judgment call on stock symbols. Everything else is on-device-only and
therefore **not collected**.

---

## 1. Top-level Console questions (answer these first)

| Console question | Answer | Justification |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | AI-provider egress + Drive backup transmit user data off-device (`provider.js:475`, `cloudBackup.js:244-251`). |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Every egress uses HTTPS/TLS: AI providers (`provider.js:363` `fetchWithTimeout` → gemini/chatgpt/perplexity/groq), Drive/OAuth (googleapis.com), stock APIs (all `https://`). No cleartext HTTP egress. |
| Do you provide a way for users to request that their data be deleted? | **Yes** (in-app + uninstall) | In-app wipe clears the localStorage blob (`navigation.js:861`); uninstall removes all local data. Cloud backups are deletable from the user's own Drive. See §6. |

> **Note on "encrypted in transit" vs "encrypted at rest":** the Data safety form only asks about
> **in transit**. Answer **Yes** truthfully. Do **NOT** volunteer or imply encryption-at-rest — the
> on-device blob is **plaintext at rest** (a known pending item, `storage.js:54`). The Console does
> not ask about at-rest here, so simply do not claim it. See §7 for the security-practices section.

---

## 2. Data types to DECLARE as Collected + Shared (these leave the device)

For **every** row below, the shared, cross-cutting answers are:

- **Collected:** Yes
- **Shared:** Yes (third party — the AI provider company, or Google for Drive)
- **Processing is ephemeral?** No (be conservative — we cannot guarantee the third party does not retain it)
- **Is this data required, or can users opt out of collection?** **Users can choose whether this data is collected → "Optional."** All AI features require the user to (a) enter their own API key and (b) actively ask a question / trigger insights. No key + no query = nothing sent. (`provider.js:317-343` short-circuits when no key.)
- **Purpose:** **App functionality** (only). No analytics, no advertising, no personalization tracking, no fraud/security-provider use.
- **Encrypted in transit:** Yes.

### 2a. Financial info

Play's "Financial info" group has sub-types: *User payment info*, *Purchase history*, *Credit
score*, *Other financial info*. This app sends **"Other financial info"** (financial summaries,
holdings, spending, income aggregates). It does **NOT** send *User payment info* (card numbers) —
see §3.

| Data type (Play sub-type) | What actually leaves the device | Recipient | Citation |
|---|---|---|---|
| **Other financial info** — expenses | Expense rows: title, description, amount, category, date; for card-paid expenses the card **nickname/name** plus the **paymentMethod object** (which contains an internal card UUID — NOT the card number/PAN/CVV, which are never sent; this internal id is non-sensitive and remains within the already-declared expenses → AI providers data flow) | AI providers | `provider.js:701-723`; enrichment adds `cardName` but retains `expense.paymentMethod` (with internal card id) `queryEngine.js:490-502`; two-phase send `chat.js:241-265` |
| **Other financial info** — investments / holdings | Holding name, type, goal, computed INR amount, price/NAV, currency, quantity, timestamps; plus FX/gold rates and portfolio total | AI providers | `provider.js:724-785` |
| **Other financial info** — income aggregate | **Derived** average monthly income (last 6 months) only — NOT per-credit rows | AI providers | `provider.js:47-70,250-263` |
| **Other financial info** — SIP / plans / recurring | Active SIP names+amounts+monthly total; pending plan names+amounts+dates; recurring-payment **names** | AI providers | SIP/plan snapshot `provider.js:47-70`; recurring names in dashboard insights `dashboard.js:4961,5921` |
| **Other financial info** — loans & card-EMI (cash-flow) | Loan name, interest rate, EMI, remaining balance, tenure; card-EMI **metadata** (card nickname, EMI reason, amount, counts) | AI providers | dashboard insights `dashboard.js:5161-5196,5921` |
| **Other financial info** — market rates | Exchange rate, gold rate per gram (numeric) | AI providers | `provider.js:724-785` |
| **Other financial info** — encrypted backup blob | The **entire DB as one AES-256-GCM-encrypted blob** (contents opaque to Google; see §4) | Google Drive | `cloudBackup.js:244-251` |

> **Modeling choice for the backup:** the encrypted blob *contains* many data types, but Google
> receives only opaque ciphertext it cannot read. Two defensible declaration styles — pick one and
> be consistent:
> - **(Recommended, simplest & safe):** Declare "Other financial info" as Shared with Google Drive,
>   note in the optional free-text that it is an end-to-end-encrypted backup the recipient cannot
>   decrypt. This is conservative and avoids under-declaring.
> - **(Alternative):** Some publishers argue an end-to-end-encrypted blob the recipient cannot read
>   is not "collection" of the underlying types. Play guidance is ambiguous here; the recommended
>   option above is the lower-risk answer for a Finance app.

### 2b. Personal info

| Data type (Play sub-type) | What actually leaves the device | Recipient | Citation | Notes |
|---|---|---|---|---|
| **Personal info → Other info** (via free-text prompts) | The **user's typed question** to the AI, which may contain any personal detail the user chooses to type | AI providers | `chat.js:109,175,206,216` → `provider.js:475` | Free-text can contain anything; declare conservatively. Purpose: App functionality. Optional (only sent when the user asks a question). |
| **App activity → other user-generated content** (the prompt as content) | Same typed prompt / question content | AI providers | same as above | Alternative/adjacent Play bucket for user-authored prompt text. Declare under whichever the Console offers; do not double-count if both apply — pick "Other user-generated content." |

> The **email address** shown for the Drive account (`cloudBackup.js:414,419`) is fetched from Google's
> own userinfo endpoint and stored only on-device for display; never transmitted by the app to any
> third party beyond the user's own Google authentication. It is stripped from the uploaded backup
> (`cloudBackup.js:234`). It is generally **not** declarable as collected-by-the-app (stored
> on-device only for UI; never transmitted elsewhere), but if you want maximum caution you may list
> **Personal info → Email address**, Shared with Google, Optional. Recommended: **do not declare** —
> it never leaves Google's own auth surface.

### 2c. App info & performance

The AI **API keys** (`settings.geminiApiKey`, etc., `database.js:43-46,64`) are sent to the
respective provider **as an authentication credential**, not as content. Auth credentials used to
call a service are generally **not** declarable as "collected user data." **Do not declare API keys**
as a collected data type. (They are, however, stored plaintext on-device — relevant to §7, not to
the collection matrix.)

---

## 3. Data types that are explicitly NOT COLLECTED (on-device only — declare "No")

These are **sensitive** but **never transmitted off the device**. Under Play's definition they are
**not "collected."** Do **NOT** declare them. Kept here so the reviewer/owner can see the reasoning.

| On-device data | Play group it *would* fall in | Why NOT collected | Citation |
|---|---|---|---|
| **Login credentials / password vault** (service, username, cleartext password, notes) | Personal info | Never sent to AI (verified: zero references to credentials/passwords anywhere in `www/js/ai/`); stays in localStorage | `credentials.js:17-27`; grep of `www/js/ai/` = empty |
| **Full card number (PAN), CVV, credit limit, card outstanding balance, expiry, statement/bill dates** | Financial info → **User payment info** | Explicitly **excluded** from every AI payload — appear in `www/js/ai/` only inside SECURITY comments, never read into a payload; cards-mode sends only `{name, benefits, benefitsFetchedAt, userNotes}` | allow-list `provider.js:671-694`; SECURITY comments `provider.js:673,814`; card model `cards.js:122-127` |
| **Card bills** (amount, due date, min due, paid state) | Financial info | Not present in any AI payload; on-device only | `database.js:33` |
| **Detailed income / payslip profile** (CTC, basic, HRA, PF %, tax slabs, 80C/80D, insurance) | Financial info | Only a *derived average* leaves the device (see §2a); the raw profile does not | `income.js:43-97`; snapshot `provider.js:47-70` |
| **Actual salary credits / additional income (per-row)** | Financial info | Only the derived 6-month average is sent; per-credit rows stay local | `database.js:19-20`; `provider.js:47-70` |
| **Money lent** (person name = third-party PII, amount, purpose, notes) | Personal info | Not found in any AI payload; on-device only | `moneyLent.js:11-24` |
| **Cash & savings** (balance + history) | Financial info | Not sent anywhere; on-device only | `database.js:29` |
| **Chat history transcripts** | App activity | Stored locally; transcripts are not re-sent as a data source (live prompts are sent at query time and counted in §2b) | `database.js:22` |
| **Security state** (PIN hash, salt, biometric flag, **masterPassword**) | Personal info | Never sent to AI; stripped from the uploaded backup before encryption | never in AI payload; strip `cloudBackup.js:221-242`, `storage.js:201` |
| **Settlement data, card groups, bank order, app settings** | Financial / App info | Low-sensitivity, on-device only, not transmitted | `database.js:25,37,40,42-58` |

---

## 4. Google Drive backup — Shared, but end-to-end encrypted (verified)

- **Optional:** Yes — user must explicitly opt in with **their own** Google account (OAuth2
  Authorization-Code + PKCE, `drive.appdata` hidden per-app-folder scope). Off by default.
- **What Google receives:** a single **AES-256-GCM-encrypted** blob. Verified: the DB payload is
  `JSON.stringify`'d then `Crypto.encrypt(dataStr, masterPassword)` **before** upload
  (`cloudBackup.js:244-251`). Encryption = PBKDF2-SHA256 **100,000** iterations, random 16-byte
  salt + 12-byte IV, output = base64(salt‖IV‖ciphertext) (`crypto.js:10-69`, verified: `AES-GCM`
  length 256, 100000 iterations).
- **Stripped before encryption:** PIN hash, biometric flag, **master password**, and the OAuth
  token section are removed from the payload before it is encrypted/uploaded
  (`cloudBackup.js:221-242`). Public `clientId` is retained.
- **Refresh token:** the persisted Drive refresh token is itself AES-256-GCM-encrypted with the
  master password (`cloudBackup.js:400-403`); access tokens are memory-only.
- **Encrypted in transit:** Yes (HTTPS to `googleapis.com` / `oauth2.googleapis.com`).
- **Data-safety declaration:** Shared with Google (third party) → see §2a recommended modeling.

> **Do NOT claim the backup protects on-device data.** The `masterPassword` that encrypts the backup
> is itself stored **plaintext** in the same on-device blob (`database.js:73`; read at
> `storage.js:177`, `cloudBackup.js:213`). It is stripped from the *uploaded* copy but remains in the
> *local* copy — so backup encryption gives no protection against an attacker who can already read
> local storage. This is an at-rest limitation (§7), not a Data-safety in-transit claim.

---

## 5. Stock / market price APIs — honest assessment (likely NOT collected)

Recipients: Yahoo Finance (`query1`/`query2`), Finnhub, Alpha Vantage, mfapi.in, frankfurter.app
(`stockapi.js:12-13,182,212`; `investments.js:3595-4507`).

**What is sent:** ticker **symbols** / company or fund **search strings**, and FX currency pairs.
**No personal identifiers, no amounts, no account data, no holdings quantities** accompany these
calls — the request is just "price of symbol X."

**Assessment:** A bare ticker symbol (e.g. `AAPL`, `INFY`) is **not personal or financial-amount
data about the user** — it is a public market-data lookup. On its own it is **not user data** under
Play's definitions, so it is **not "collected."**

- **Recommended declaration:** **Do not declare** the stock-symbol traffic as a collected data type.
- **Caveat to keep in mind (documented, not a declaration):** the *set of symbols a user queries*
  could in principle hint at holdings. We never send quantities/amounts or an identifier alongside
  the symbol, and these are unauthenticated public endpoints (Finnhub/Alpha Vantage use hardcoded
  shared demo tokens, `stockapi.js:12-13`), so there is no per-user linkage. This remains below the
  reporting bar. If the owner wants to be maximally conservative, they *could* note investment
  interest under "Other financial info" — but the recommended, defensible answer is **not to
  declare**, because no amount or identity is transmitted.
- The dev-only CORS proxy `allorigins.win` is **gated to localhost** (`stockapi.js:52,54`) and does
  **not** run in the shipped Android app — exclude it entirely.

---

## 6. Data deletion & retention (Console: "Data deletion" question)

- **In-app deletion:** The app provides a full wipe that clears the on-device data blob
  (localStorage key `myassistant_db` cleared, `navigation.js:906`). Individual records
  (expenses, cards, investments, credentials, etc.) can also be deleted per-item in their modules.
- **Uninstall:** Removes all local data. Android auto-backup is **disabled**
  (`AndroidManifest.xml:5-7`: `allowBackup=false`, `fullBackupContent=false`, custom
  `dataExtractionRules`), so the plaintext blob is **not** swept into Android cloud/adb backup and
  does not survive uninstall via that channel.
- **AI providers:** We do not control third-party retention. Since we operate no server, we cannot
  delete data from a provider on the user's behalf; the free-text/data sent is per-query and
  user-initiated. State this plainly if the Console offers a free-text field.
- **Google Drive backup:** Lives in the user's **own** Drive (hidden app-data folder). The user
  deletes it from their own Google account / by revoking access; disabling backup in-app stops
  further uploads and the app can revoke the OAuth token (`oauth2.googleapis.com/revoke`).
- **Console answer:** "Users **can** request that their data be deleted" → **Yes**, via in-app wipe
  and uninstall (and, for the optional cloud copy, via their own Drive).

---

## 7. Security practices (Console: "Security practices" question)

| Console prompt | Answer | Detail / citation |
|---|---|---|
| Is data encrypted in transit? | **Yes** | All egress over HTTPS/TLS (AI, Drive/OAuth, stock APIs). No cleartext HTTP. `provider.js:363`, all provider files, `cloudBackup.js`. |
| Can users request data deletion? | **Yes** | See §6. In-app wipe (`navigation.js:906`) + uninstall. |
| **(Do NOT claim) data encrypted at rest** | **N/A — not asserted** | The on-device blob is **plaintext at rest** (known pending item, `storage.js:54`). The Console's Data-safety security section does not require an at-rest attestation; simply do not claim encryption at rest. AI API keys and `masterPassword` are also plaintext at rest (`database.js:43-46,64,73`). |

**Additional true security facts you MAY cite in free-text (all verified):**

- **PIN** is **not** stored in plaintext: salted **PBKDF2-SHA256 @ 200,000 iterations**, `pinVersion 2`
  (`security.js:214,230-233`; `crypto.js:107-122`), with brute-force lockout defense
  (`security.js:243-258`). Legacy unsalted SHA-256 is retained only to verify+migrate old PINs.
- **Optional biometric unlock** via the Capacitor biometric plugin.
- **Cloud backup is end-to-end encrypted** (AES-256-GCM, §4) — the Drive copy is unreadable to Google.
- **Android auto-backup disabled** so the local blob is not exfiltrated via OS backup
  (`AndroidManifest.xml:5-7`).

> Honesty guardrail: do not state or imply that on-device stored data (passwords, PAN, CVV, income,
> `masterPassword`, API keys) is encrypted at rest — it is not (yet).

---

## 8. Android permissions → Data-safety mapping

Permissions do **not** by themselves create Data-safety declarations, but reviewers cross-check
them against declared data. Map and justify each:

| Permission (AndroidManifest.xml) | Maps to a data-safety declaration? | Notes / recommended action |
|---|---|---|
| `INTERNET` (line 54) | Indirect — enables **all** egress (AI, Drive, stock). | Required. Backs the §2 collected/shared declarations. |
| `USE_BIOMETRIC` (55) | No collected data. | Local biometric unlock only. Cite under §7 security practices. |
| `USE_FINGERPRINT` (56) | No. | Legacy/deprecated (superseded by `USE_BIOMETRIC` at API 28). Harmless but **recommend removing** to reduce reviewer questions. |
| `READ_EXTERNAL_STORAGE` (57) | No. | **No media/file read path in code.** Likely legacy/unused → **recommend removing** (no `maxSdkVersion` set). Unused permissions on a Finance app draw scrutiny. |
| `WRITE_EXTERNAL_STORAGE` (58) | No. | No write path; no-op on Android 10+ (scoped storage). **Recommend removing** (or gate `maxSdkVersion=28`). |
| `READ_MEDIA_IMAGES` (60) | No. | No image-picking/reading code found. **Recommend removing.** |
| `READ_MEDIA_VIDEO` (61) | No. | No video usage. **Recommend removing** — unnecessary for Finance; invites Play data-safety scrutiny. |
| `READ_MEDIA_AUDIO` (62) | No. | No audio usage. **Recommend removing.** |
| OAuth redirect intent-filter `com.personal.myassistant` (32-37) | Supports §4 (Drive backup). | Correctly declared; required for cloud backup. Not a permission per se. |

> **Action item (not part of the form, but affects approval):** The unused
> `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES/VIDEO/AUDIO` (and legacy
> `USE_FINGERPRINT`) should be **removed from the manifest** before submission. A Finance app that
> requests media/storage permissions with no corresponding functionality is a common cause of Play
> review friction and can contradict a "no photos/media collected" data-safety answer.

---

## 9. Quick copy-paste summary for the Console

**Data collected/shared:** Yes.
**All collected data encrypted in transit:** Yes.
**Users can request deletion:** Yes (in-app wipe + uninstall; cloud copy via user's own Drive).

**Declare (Collected = Yes, Shared = Yes, Purpose = App functionality, Optional = Yes, In transit = encrypted):**
- Financial info → **Other financial info** (expenses, investments/holdings, income aggregate,
  SIP/plans/recurring names, loan & card-EMI cash-flow metadata, market rates) → **AI providers**.
- Financial info → **Other financial info** (encrypted whole-DB backup blob) → **Google Drive**
  (optional; end-to-end encrypted).
- App activity → **Other user-generated content** (the user's typed AI prompt text) → **AI providers**.

**Do NOT declare (on-device only / not user data / auth-only):**
- Passwords/credential vault, full card number, CVV, credit limit, card outstanding, card bills,
  detailed income profile, per-row salary/additional income, money lent, cash & savings, chat
  history, PIN/security state, master password, app settings — **all on-device only, never
  transmitted → not "collected."**
- Stock ticker symbols to price APIs — **public market-data lookups, no amount/identity attached →
  not "collected"** (see §5).
- AI provider API keys — **authentication credential, not collected content.**
- Drive account email — **used only against the user's own Google auth; not transmitted by us.**

---

### Verification footnotes (audited 2026-07-03)

- Manifest backup flags & permissions: `AndroidManifest.xml:5-7,54-62` — confirmed.
- Credentials/passwords never in AI code: grep of `www/js/ai/` for credential/password = empty — confirmed.
- Card PAN/CVV/limit/outstanding never in AI payload: only SECURITY comments in `provider.js:673,814`;
  cards-mode allow-list `provider.js:671-694` maps only name/benefits/benefitsFetchedAt/userNotes — confirmed.
- Backup encryption AES-256-GCM, PBKDF2 100k: `crypto.js:10-69` — confirmed.
- masterPassword plaintext on-device but stripped from backups: `database.js:73`, strip at
  `cloudBackup.js:227`, `storage.js:201` — confirmed.
- Plaintext-at-rest of the whole DB: `storage.js:7,54,151` — confirmed (do not claim at-rest encryption).
