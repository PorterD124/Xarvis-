# Xarvis - AI Voice Assistant

Xarvis is a high-performance, real-time AI voice assistant powered by the **Gemini 2.5 Flash Live API**. It features low-latency voice interaction, sophisticated personalities, and direct integration with Google Sheets for activity logging.

## 🚀 Features

- **Real-time Voice Interaction**: Low-latency conversation using Gemini Live.
- **Multiple Personalities**: Choose between Xarvis (Classic), Xarvis (Feminine), or FRIDAY.
- **Google Sheets Integration**: Automatically log your conversations and activities directly via browser.
- **Serverless Architecture**: 100% Client-Side built with React, Vite, and Firebase Auth.

## 🛠️ Setup Instructions

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd jarvis
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory and add your API keys:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
```

*Note: The `VITE_` prefix is required for the frontend to access the Gemini key.*

### 4. Run Locally

```bash
npm run dev
```

### 5. Deploy to Firebase

```bash
npm run deploy
```

## 📜 Scripts

- `npm run dev`: Starts the Vite development server.
- `npm run build`: Builds the frontend for production.
- `npm run deploy`: Builds and deploys the app to Firebase Hosting.
- `npm run lint`: Runs TypeScript type checking.

## 🛡️ Security Note

The `.env` file is included in `.gitignore` to prevent your private API keys from being leaked. Never share your `.env` file publicly.
