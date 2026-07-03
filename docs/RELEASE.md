# Release & Signing Guide

How to produce a **signed** Android App Bundle (`.aab`) for the Google Play
Store. Debug builds (`gradlew installDebug`) are fine for local development but
**cannot be published** — Play requires an app signed with a release key.

> **Secrets policy:** the release keystore and its passwords are **never**
> committed. `android/keystore.properties`, `*.keystore`, and `*.jks` are
> gitignored. If you're reading this in the repo and expecting to find the key
> or password here — they are deliberately absent. See [Backup](#backup--recovery).

---

## Prerequisites

- **JDK 17** — the Android Gradle Plugin requires Java 17. A debug/config build
  under Java 11 fails with *"Android Gradle plugin requires Java 17 to run."*
  On this machine a Zulu 17 JDK is available at:

  ```
  /Users/dmungamuri/Documents/openjdk_17.0.13.0.101_17.55.14_aarch64/zulu-17.jdk/Contents/Home
  ```

  Export it for the commands below:

  ```bash
  export JAVA_HOME="/Users/dmungamuri/Documents/openjdk_17.0.13.0.101_17.55.14_aarch64/zulu-17.jdk/Contents/Home"
  ```

  (Android Studio's bundled JBR at
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home` also works.)

- Android SDK (already configured via `android/local.properties`).
- `npm install` and a synced web layer (`npx cap sync android`) — see the
  README's Installation section.

---

## One-time: create the upload keystore

You generate this **once**. It is a permanent identity for the app: every
future update must be signed with the same key (or Play's upload key, if you
enroll in Play App Signing). **Choose a strong password and back it up before
doing anything else** (see [Backup](#backup--recovery)).

```bash
cd android
export JAVA_HOME="/Users/dmungamuri/Documents/openjdk_17.0.13.0.101_17.55.14_aarch64/zulu-17.jdk/Contents/Home"

"$JAVA_HOME/bin/keytool" -genkeypair -v \
  -keystore app/myassistant-upload.keystore \
  -alias myassistant-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Deepu Mungamuri, O=My Assistant, C=IN"
# You will be prompted for a keystore password. Pick a strong one.
# When asked for a key password, press Enter to reuse the store password
# (the build config assumes storePassword == keyPassword).
```

- `-validity 10000` ≈ 27 years. Play requires a key valid well beyond your
  expected release timeline; don't shorten this.
- The keystore lands at `android/app/myassistant-upload.keystore` (gitignored).

## One-time: create `keystore.properties`

The build reads signing credentials from `android/keystore.properties`
(gitignored). Create it with the password you chose above:

```properties
# android/keystore.properties  — DO NOT COMMIT (gitignored)
storeFile=app/myassistant-upload.keystore
storePassword=<the password you chose>
keyAlias=myassistant-upload
keyPassword=<same password>
```

- `storeFile` is resolved **relative to `android/`** (the Gradle root project),
  so `app/myassistant-upload.keystore` → `android/app/myassistant-upload.keystore`.
- If you used a *different* key password, set `keyPassword` accordingly.

### How the build wires this up

`android/app/build.gradle` loads `keystore.properties` if present and applies a
`signingConfigs.release` to the `release` build type. **If the file is absent**
(fresh clone, CI without secrets, or you only want a debug build) the release
build simply stays debug-signed and the project still configures/builds — no
error. So the keystore is required only when you actually cut a Play release.

---

## Build a signed release AAB

```bash
cd android
export JAVA_HOME="/Users/dmungamuri/Documents/openjdk_17.0.13.0.101_17.55.14_aarch64/zulu-17.jdk/Contents/Home"

# Always sync the latest web assets first (tests run via the prebuild gate):
cd .. && npm run build && cd android

./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

Verify it's signed with your key (not the debug key):

```bash
"$JAVA_HOME/bin/jarsigner" -verify -verbose -certs \
  android/app/build/outputs/bundle/release/app-release.aab | head -20
# Expect "jar verified." and your CN=Deepu Mungamuri certificate.
```

> An APK for sideloading/testing instead of an AAB:
> `./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.

---

## Before each release

- **Bump the version** in `android/app/build.gradle`:
  - `versionCode` — integer, must increase every upload (1 → 2 → 3 …).
  - `versionName` — human-facing string (e.g. `"1.0"` → `"1.1"`).
- Run the test suite (`npm test`) — the pre-commit and `prebuild` gates already
  enforce this, but confirm green before tagging a release.

---

## Backup & Recovery

**Losing the keystore or its password means you can never update the published
app** — Play will reject any upload not signed with the original key, and you'd
have to publish a brand-new listing under a new package name.

Back up **both** of these to at least two secure locations **outside this repo**
(password manager, encrypted drive, offline copy):

1. `android/app/myassistant-upload.keystore` (the key file)
2. The store/key password(s) and the alias (`myassistant-upload`)

**Recommended:** enroll in **Play App Signing**. Google then holds the *app
signing key* and you only manage an *upload key*; if you lose the upload key,
Google can reset it. This is the default for new apps and strongly advised.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Android Gradle plugin requires Java 17 to run` | `JAVA_HOME` points at JDK 11 | Export the JDK 17 path (see Prerequisites). |
| `Could not find property 'release' on SigningConfig container` | `keystore.properties` missing but a release-signing task expected it | Create `keystore.properties` (see above), or run a debug build. |
| `Keystore file ... not found` | `storeFile` path wrong | Path is relative to `android/`; confirm the keystore exists at `android/app/myassistant-upload.keystore`. |
| `Failed to read key ... Wrong password` | store/key password mismatch | Ensure `storePassword`/`keyPassword` match what you set with `keytool`. |
| App unstyled / charts missing in release | vendored libs not synced | `bash www/vendor/download-vendors.sh && npx cap sync android`. |

---

## Play Store submission checklist (beyond signing)

Signing is one gate; a finance app also needs these before/at submission:

- [ ] **Privacy policy URL** — mandatory for the Finance category.
- [ ] **Data Safety form** — declare data collected, on-device storage, and that
      expense/investment data is sent to third-party AI providers.
- [ ] **Store assets** — feature graphic (1024×500), ≥2 screenshots, descriptions.
- [ ] **Permissions review** — justify or trim storage/media permissions
      (`AndroidManifest.xml`); add `android:maxSdkVersion="32"` to the deprecated
      `READ/WRITE_EXTERNAL_STORAGE` if retained.
- [ ] **targetSdkVersion** — currently `35` (meets the current Play requirement).

See the security review notes for the recommended at-rest-encryption and
consent-notice hardening before a public finance-app launch.
