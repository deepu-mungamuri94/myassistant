# Quick Start Guide - My Assistant

Complete setup guide to get running in 10 minutes.

## Prerequisites

1. Node.js 18+
2. Android Studio
3. Google Gemini API Key (free from https://makersuite.google.com/app/apikey)
4. Java 17+

## Setup Steps

### 1. Install Dependencies
```bash
cd /Users/dmungamuri/AndroidStudioProjects/myassistant
npm install
```

### 2. Build and Sync
```bash
npm run build
npm run open:android
```

### 3. Run in Android Studio
- Wait for Gradle sync
- Connect device or start emulator
- Click Play button
- App launches!

### 4. Configure App
- Tap Settings (⚙️)
- Enter Gemini API Key
- Set Master Password
- Save

### 5. Test AI
- Menu → AI Chat
- Ask: "What can you help me with?"

## Troubleshooting

**App won't launch**: Clear build and rebuild
**AI not responding**: Check API key and internet
**Java error**: Install Java 17+

See README.md for detailed documentation.
