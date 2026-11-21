# apadaAlert

**AI disaster companion and rescue SOS for North East India.**
Built for PromptWars x Code1 Innovators, problem statement PS05 (Northeast Connect: Community Emergency Assistant).

"Apada" means disaster. apadaAlert helps people get through floods, landslides and earthquakes. Its AI companion talks with them in English, Hindi, Assamese or Bengali. The moment they are in danger, it switches to simple tap-only questions. Their SOS reaches a rescue control room at once, and the phone alerts them when a rescue helicopter is close so they can signal it.

> This is a hackathon demo. It is not a replacement for 112. In an emergency, call 112.

## What's inside

| Part | Address | Who uses it |
|---|---|---|
| Citizen app (installable web app) | `/` | People in a disaster area |
| Rescue dashboard | `/dashboard` | Control-room operators (stands in for NDRF / SDRF) |
| Crew page | `/crew` | Helicopter, boat or ground rescue team |

### Main features

- **Send first, ask after.** Tapping SOS sends location and household details at once. The quick questions then add detail to the same SOS.
- **AI companion with danger mode.** A normal chat, by voice or text, in four languages. When danger is detected, it switches to one big tap-only question at a time, at most 6. Gemini picks the next question and skips anything it already knows; a saved question list takes over if Gemini is slow or offline.
- **Works through network drops.** Each SOS, answer and report waits in an outbox on the phone and sends itself when the network returns, with no duplicates. The app, guides and danger questions open with no network.
- **Rescue helicopter alert.** When a rescue unit comes within 10 km, the phone says "get ready". Within 3 km it vibrates, whistles, and flashes SOS in Morse code.
- **Control room.** A live map, a queue ranked by a fixed urgency formula, a one-line Gemini reason, the person's chat history, status updates and alerts translated automatically.
- **Official alerts and weather:** live government alerts for North East India from SACHET (NDMA: IMD, CWC, state disaster authorities), and the weather where you are (Open-Meteo).
- **People nearby:** a chat with everyone within 30 km (I'm safe, Need help, Have a boat...), moderated by reports, visible to the control room.
- **Also:** hazard map with merged reports and AI photo checks, relief camps with a compass, a strobe and whistle, safety guides, helplines, and an SMS fallback.

## For judges: see every feature in 2 minutes

Open the app and tap **"Judge? Skip to the feature tour"** on the first screen (or open `/#tour` later, or **More > Feature tour**). It fills in sample details and shows one card per feature, each with a button that demonstrates it:

| Card | What the button does |
|---|---|
| 1. Send first, ask after | Sends a demo SOS and opens the quick questions |
| 2. Tap-only danger questions | Opens the questions without sending an SOS |
| 3. AI companion | Opens the chat |
| 4. Network drop protection | A switch that simulates no network: send an SOS, see "Saved on phone", switch back and watch it send |
| 5. Rescue helicopter alert | Flies a demo helicopter to your SOS: "Get ready" at 10 km, "Signal now!" at 3 km |
| 6. Strobe and whistle | Starts the SOS strobe and whistle |
| 7 and 8. Dashboard and crew page | Open the rescuer side in a new tab |
| 9 to 12 | Hazard map, compass, guides and helplines, four languages |

Keep the dashboard (`/dashboard`) open on a second screen while you try cards 1, 4 and 5: every SOS, answer and helicopter shows up there live.

## Run it on your computer

Needs Node.js 20 or newer.

```powershell
npm install
```

```powershell
npm run dev
```

Then open http://localhost:3000 (citizen app), http://localhost:3000/dashboard and http://localhost:3000/crew.

The app runs with no keys at all. It then uses a built-in demo database (saved in `data/dev-db.json`) and the fixed question list instead of Gemini. Add the keys below to switch on the AI and Firestore.

## Connect Gemini, Firebase and Vercel

### 1. Gemini API key (Google AI Studio)

1. Go to https://aistudio.google.com/apikey and sign in.
2. Click **Create API key** and copy it.

### 2. Firebase Firestore (database)

1. Go to https://console.firebase.google.com and click **Add project** (for example `apadaalert`). Google Analytics can be off.
2. **Build > Firestore Database > Create database.** Choose **production mode** and the location **asia-south1 (Mumbai)**.
3. Open the **Rules** tab, paste the contents of `firestore.rules` from this project, and click **Publish**. Browsers can't touch the database directly; only the server can.
4. Gear icon > **Project settings > Service accounts > Generate new private key**. A `.json` file downloads. Keep it private.
5. Turn that file into one line and copy it (change the file name to yours):

```powershell
Get-Content .\your-key-file.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 5 | Set-Clipboard
```

The free Spark plan is enough. Photos are shrunk to about 200 KB and stored in Firestore, so no paid plan is needed.

### 3. Keys on your computer

Copy `.env.example` to `.env` and fill in:

```
GEMINI_API_KEY=your key
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...the one line...}
```

`.env` is in `.gitignore`, so it never goes to GitHub. Restart `npm run dev` after changing it.

### 4. GitHub and Vercel (hosting)

1. Create an empty repository on GitHub and push this folder to it.
2. Go to https://vercel.com, sign in with GitHub, click **Add New > Project** and import the repository. Framework preset: **Other**. Leave the build settings empty; `vercel.json` already sets them.
3. Under **Environment Variables**, add `GEMINI_API_KEY` and `FIREBASE_SERVICE_ACCOUNT` with the same values.
4. Click **Deploy**. Every push to GitHub deploys again.

Check that it's connected: open `https://your-app.vercel.app/api/health`. It should say `"gemini": true` and `"store": "firestore"`.

If Gemini replies with a "model not found" error, set `GEMINI_MODEL` to a model ID listed in Google AI Studio.

## AI voice in the person's own language

In danger mode, the quick questions and the helicopter alert are read aloud by a natural Gemini voice in English, Hindi, Assamese or Bengali. Most phones have no built-in Assamese voice, so this matters most there.

- Each phrase is made once, saved in Firestore, and then saved on every phone that uses it, so it plays instantly and also with no network.
- The free Gemini plan allows only **10 voice requests a day per model**. The server tries two models, so about 20 a day. That is why only fixed phrases use the AI voice; changing text (safety steps, chat, guides) uses the phone's own voice.
- **Before the demo, prepare all the voices once** (about 32 phrases for four languages):

```powershell
node scripts/prepare-voices.js
```

It skips phrases already saved. If it stops at the daily limit, run it again after the limit resets (midnight US Pacific time, which is 1:30 PM IST).

## Demo script (3 minutes)

1. **Install:** open the Vercel link on an Android phone and add it to the home screen. Pick a language, go through the intro and enter sample details (4 people, 1 elderly). Use sample names and numbers, not real ones.
2. **Companion:** ask by voice "Is there any alert near me?" Then say "water is coming into the house". The chat switches to big tap-only questions.
3. **Send first, ask after:** tap "In danger now". The SOS appears on the dashboard straight away. Each tap after that adds detail, and the score rises.
4. **Network drop:** turn on airplane mode and tap SOS. The questions still work and it shows "Saved on phone". Turn airplane mode off and it reaches the dashboard.
5. **Rescue:** on the dashboard, open the SOS, read the AI reason and the chat, and mark it "Team dispatched". The phone shows the update.
6. **Helicopter:** click **Send demo helicopter here** on the dashboard (or use the crew page on a second phone). The phone shows "get ready", then vibrates, whistles and flashes "Signal now!"
7. **Alert:** create an alert on the dashboard. Gemini translates it, and it shows on the phone.
8. **Roadmap:** full offline mode, and a Bluetooth mesh where SOS messages hop from phone to phone until one finds a network.

Before the demo, test voice on the demo phone. If Assamese voice doesn't work there, show Assamese as text and use Hindi or Bengali for the spoken parts.

## Design

- **Theme:** white, with one accent red for SOS and soft tints for everything else.
- **Font:** SF Pro on Apple devices (it is the system font there). On Android and Windows the app uses Inter, the closest open match. Apple's licence doesn't allow hosting SF Pro files on a website, so the app doesn't ship them.
- **Icons:** Material Symbols Outlined, following the Government of India's [UX4G design system](https://www.ux4g.gov.in/foundations/iconography): outlined by default, filled only for the active tab. Inlined as SVG in `public/js/icons.js` so they work offline. Apache License 2.0. To add one, see `scripts/make-icon-set.js`.
- **Logo:** a location pin sending out a signal, because the app's job is to get your location to rescuers.
- **Companion:** its avatar is a friendly face in a speech bubble, in calm green, shown beside its messages.
- **Navigation:** a back button on every screen except Home, and on each quick question so an answer can be changed.

## Project layout

```
api/router.js          One Vercel function for every /api route
lib/handlers.js        All API routes (SOS, companion, chat, reports, alerts, units, dashboard)
lib/gemini.js          Every Gemini call (chat, next question, steps, SOS reason, photo check, translation)
lib/db.js              Firestore, or the demo store when no Firebase key is set
lib/score.js           Fixed urgency formula
public/index.html      Citizen app
public/js/             App code (danger mode, chat, SOS outbox, map, strobe, voice, icons, feature tour...)
public/data/           Question list, guides, demo camps (shared by the app and the server)
public/dashboard.html  Control room
public/crew.html       Crew page
public/sw.js           Service worker (opens without a network)
server.js              Local development server
PRD.md                 Product requirements
```

## Honest limits

- **No login (demo).** Anyone with the link can open the dashboard and crew page. A real launch needs operator and crew login first.
- **Chats go to Google.** Chats are saved on our server and processed by Gemini. On the free AI Studio tier, Google may use that data to improve its products. The name and phone number are never sent to Gemini.
- **Bluetooth mesh needs a native app.** Browsers can't let two phones find each other over Bluetooth. It's on the roadmap (Phase 3).
- **Helicopter position comes from the crew page,** because military rescue helicopters often don't broadcast it publicly. The stranded person's app must be open to show the alert.
- **SMS needs a tap.** A web app can open the SMS app with the message written, but the user has to tap send.
- **Demo data.** Relief camps, the starting alert and some hazard reports are samples, labelled "demo".
- **Translations** in Hindi, Assamese and Bengali should be checked by a native speaker.
