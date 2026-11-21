# apadaAlert: setup notes for the team

How to run, connect and deploy apadaAlert. For what the app is and does, see [README.md](README.md).

## Run it on your computer

Needs Node.js 20 or newer.

```powershell
npm install
```

```powershell
npm run dev
```

Then open http://localhost:3000 (citizen app), http://localhost:3000/dashboard and http://localhost:3000/crew.

The app runs with no keys at all. It then uses a built-in demo database (saved in `data/dev-db.json`) and the fixed question list instead of Gemini.

## Keys

Copy `.env.example` to `.env` and fill in the values. `.env` is ignored by git, so it never goes to GitHub. Restart `npm run dev` after changing it.

| Name | What it is |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key (https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Text model, `gemini-3.5-flash-lite` |
| `GEMINI_TTS_MODELS` | Optional. Voice models tried in order |
| `GEMINI_TTS_VOICE` | Optional. Voice name, `Sulafat` by default |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account key JSON, on one line |

### Firebase Firestore

1. In https://console.firebase.google.com, create a project, then **Build > Firestore Database > Create database** (production mode, location asia-south1).
2. In the **Rules** tab, paste `firestore.rules` and publish. Browsers can't touch the database directly; only the server can.
3. **Project settings > Service accounts > Generate new private key.** Keep the downloaded file private, outside the project folder.
4. Turn it into one line and copy it:

```powershell
Get-Content .\your-key-file.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 5 | Set-Clipboard
```

The free Spark plan is enough: photos are shrunk to about 200 KB and stored in Firestore.

## Deploy on Vercel

1. Import the GitHub repository in Vercel (framework preset: Other). `vercel.json` sets everything else.
2. Add the keys above under **Settings > Environment Variables**, then **Redeploy**.
3. Check `https://<your-app>.vercel.app/api/health`. It should show `"gemini": true` and `"store": "firestore"`.

All API calls go to one function as `/api/router?path=<route>` (see `public/js/apiurl.js`), so no rewrite rules are needed.

## Prepare the AI voices before a demo

The free Gemini plan allows about 10 voice requests a day per model. Make the fixed danger-question voices once; they are saved in Firestore for every phone:

```powershell
node scripts/prepare-voices.js
```

It skips phrases already saved. If it stops at the daily limit, run it again after the reset (1:30 PM IST).

## Rebuild icons

Icons come from Material Symbols (the UX4G standard). To add one, put its name in `scripts/make-icon-set.js`, then:

```powershell
npm install --no-save @material-symbols/svg-400
```

```powershell
node scripts/make-icon-set.js
```
