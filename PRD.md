# apadaAlert: Product Requirements Document

**Event:** PromptWars x Code1 Innovators (Hack2skill)
**Problem statement:** PS05, Northeast Connect: Community Emergency Assistant
**Domain:** North East Development and Disaster Management
**Product name:** apadaAlert
**Version:** 1.3 (hackathon demo build)
**Date:** 21 Nov 2026
**Submission deadline:** 22 Nov 2026, 5:00 PM IST
**Hosting:** GitHub (code), Vercel (website and API), Firebase Firestore (database)
**AI:** Google Gemini API, key from Google AI Studio

---

## 1. One-line summary

apadaAlert ("apada" means disaster) is an installable web app that helps people in North East India get through floods, landslides and earthquakes. An AI companion talks with them in their own language and, the moment they are in danger, switches to simple tap-only questions. Their SOS goes to a rescue control room straight away, and each answer adds detail to it. The app warns them when a rescue helicopter is close so they can signal it. Later phases add full offline mode and a phone-to-phone Bluetooth network that works with no internet or mobile signal at all.

## 2. Problem

- Floods hit Assam and its neighbouring states every year. Hilly areas of Meghalaya, Mizoram, Manipur, Nagaland, Arunachal Pradesh and Sikkim are prone to landslides. The whole region is in a high earthquake risk zone.
- During a disaster the network is weak or keeps dropping. A help request sent at the wrong moment is lost.
- People in danger can't think clearly or type long messages. They need to be asked the right questions, one at a time.
- Safety information is usually only in English. Many affected people are more comfortable in Assamese, Bengali or Hindi.
- Rescue teams often don't know where stranded people are, how many there are, or who needs help first (elderly people, children, disabled people, the injured).
- Stranded people often don't know a helicopter is close until it has already passed. They miss the chance to signal it.

## 3. Phases

| Phase | What it is | When |
|---|---|---|
| **Phase 1: Online web app (demo)** | Installable web app on Vercel. Needs internet for the AI and the map. The SOS button and the saved danger questions still open without a network, and the SOS waits on the phone until the network returns. No login. | **Hackathon build** |
| **Phase 2: Offline mode** | The whole app works with no internet: guides, offline safety steps, saved map, QR relay. | Future |
| **Phase 3: Native app and Bluetooth mesh** | Android app that adds a phone-to-phone Bluetooth network, background location, and on-device helicopter sound detection. | Future |

Section 8 lists the Phase 1 features in detail. Section 9 covers Phases 2 and 3.

## 4. Goals for Phase 1

| # | Goal | How we know it works |
|---|---|---|
| G1 | No SOS is ever lost | An SOS sent while the network is down reaches the control room within seconds of the network returning, with no duplicates |
| G2 | Rescuers know who to reach first | Every SOS on the dashboard carries location, household details and an urgency rank |
| G3 | Stranded people can signal rescuers | When a rescue helicopter comes within range, people with an active SOS are alerted and the phone starts signalling |
| G4 | Usable by anyone | Four languages, voice input, large buttons, tap-only questions in danger, readable on a low-end Android phone |
| G5 | AI that adds real value | The AI companion talks the user through it and, in danger, picks the next tap-only question; AI explains each SOS to rescuers; AI checks hazard photos; AI translates alerts |

### Out of scope for the hackathon

- Login and accounts. This is a demo, so the citizen app, dashboard and crew page all open without signing in (see section 13).
- Full offline mode (Phase 2).
- Bluetooth mesh and other native app features (Phase 3).
- A real connection to NDRF, SDRF or ASDMA systems. Our rescue dashboard stands in for their control room.
- Sending SMS through a paid gateway.

### Stretch goals

Built only if time is left after everything else works:

- Push notifications (Firebase Cloud Messaging). The in-app alert already covers the demo.
- Auto-SOS check-in timer (F5).
- The alert SMS demo log (part of F14).

## 5. Users

| Persona | Situation | Needs |
|---|---|---|
| **Resident in danger** (main user) | Lives in a flood or landslide area, low-end Android phone, weak network, may prefer Assamese or Bengali | Know what to do right now, call for help, be found |
| **Family member** | Lives elsewhere, worried | Get the SOS message and location |
| **Community reporter / volunteer** | Local person with a phone and a connection | Report flooded roads and landslides |
| **Control-room operator** (stands in for NDRF / SDRF / district control room) | At a desk with internet | See every SOS on a map, know who is most urgent, track rescues, send alerts |
| **Rescue crew** (helicopter or boat team) | In the field with a phone | Share their position, see the nearest SOS requests |

## 6. Design principles

1. **Send first, ask after.** The SOS leaves the phone the moment the user says they're in danger. Questions only add detail.
2. **Built for bad networks.** Save first, send later, retry until it's confirmed.
3. **No typing in a crisis.** Big tap-only answers, read aloud, one question at a time.
4. **Speak the user's language.** Assamese, Bengali, Hindi and English from day one.
5. **Light and fast.** Small download, no heavy frameworks, kind to battery.
6. **Honest.** Demo data is clearly labelled. The app says where chats are saved. AI guidance always says "if life is in danger, call 112 first".

## 7. Platform overview

Three front ends and one backend, all deployed together on Vercel. None of them needs a login in the demo.

1. **Citizen app** (installable web app): for residents, reporters and families.
2. **Rescue dashboard** (`/dashboard`): control-room view for operators.
3. **Crew page** (`/crew`): a phone page for the helicopter or boat team that shares their live position.
4. **Backend** (Vercel serverless functions under `/api`): saves SOS requests, chats and reports, calls Gemini, works out helicopter alerts.

```
 Citizen app (phone)          Vercel serverless API              Rescue dashboard
 ┌──────────────────┐        ┌───────────────────────┐          ┌──────────────────┐
 │ Intro + details  │ ─────▶ │ /api/sos              │ ◀──────▶ │ SOS map + queue  │
 │ SOS + outbox     │        │ /api/companion ▶Gemini│  checks  │ urgency ranking  │
 │ saved questions  │ ◀───── │ /api/questions        │  every   │ chat history     │
 │ companion chat   │ checks │ /api/reports          │  3 sec   │ alerts, units    │
 │ strobe, whistle  │        │ /api/units            │          └──────────────────┘
 │ helicopter alert │        │ /api/alerts           │          ┌──────────────────┐
 └──────────────────┘        └──────────┬────────────┘ ◀─────── │ Crew page (GPS)  │
                                        │                       └──────────────────┘
                              Firebase Firestore database
```

**Who is who without a login:** the first time the app opens, the phone creates a random device ID. The profile, chats and SOS requests from that phone are linked to this ID.

## 8. Phase 1 features (hackathon build)

Every feature here is in scope for the hackathon unless it's marked **stretch**. **Build order** (section 14) decides the sequence, so the most important pieces are finished first.

### F1. Installable web app

- Web app manifest with app name, icons, theme colour and standalone display, so it installs to the home screen and opens like an app.
- A service worker saves the app's pages, scripts, translations and the danger question list (F6) on the phone at first load. The app then opens even with no network, and the SOS button and danger questions work. The AI chat, map and live updates need internet.
- A network status pill (Online / Offline / Sending) is always visible.

### F2. Home screen

- Big red **SOS** button.
- Active alert banner (F13) and a "Rescue nearby" banner (F17) when it applies.
- Quick tiles: Talk to companion (AI chat), Guides, Map, Compass to camp, Strobe and whistle, Helplines.
- Last saved location and when it was saved, for example "Saved 4 min ago, accuracy 12 m".

### F3. SOS, last-location save and network-drop protection

- **Location saving:** while the app is open, GPS location is saved on the phone every 2 minutes and each time the SOS screen opens. GPS works without internet.
- **Send first, ask after:**
  1. The user taps SOS (or answers "In danger now" in the companion chat).
  2. The SOS is sent **immediately** with the location and household details. Nothing waits for the questions.
  3. The danger questions (F6) then appear. Each answer is sent as an update to the same SOS.
  4. If the phone dies or the user stops answering, rescuers already have the location and the answers given so far.
- The SOS is first saved to an **outbox on the phone** (IndexedDB) with a unique ID made on the phone, then sent.
- If the network is down, the outbox is sent again:
  - when the browser reports it's back online
  - every time the app is opened
  - with retries that wait longer each time (backoff).
- The server ignores duplicates by the unique ID, so retries never create two SOS entries.
- While an SOS is active, new locations and battery level are sent as updates to the same SOS every 2 minutes.
- The user sees status: **Saved on phone, Sent, Received by control room, Team dispatched, Rescued**.
- The user can cancel an SOS sent by mistake. The dashboard shows it as cancelled.
- **Payload:** ID, device ID, time, latitude, longitude, accuracy, time of the GPS fix, battery level, hazard, danger-mode answers (F6), optional voice note as text, household details (F4), language, source (app / auto / SMS).
- **Acceptance:** with the app open, turn on airplane mode, tap SOS and answer two questions. It shows "Saved on phone". Turn airplane mode off. The SOS and both answers appear on the dashboard within 10 seconds with no duplicate.

### F4. Intro and household details (no login)

There's no account, password or sign-in. The first time the app opens, a short intro collects what rescuers need.

1. **Language:** English, Hindi, Assamese or Bengali.
2. **Three intro cards:** what the app does, how SOS works, and how the helicopter alert works.
3. **Your details:**
   - name and phone number
   - number of people in the household
   - how many are elderly, children, pregnant or disabled
   - medical needs (free text)
   - emergency contacts (up to 3)
4. **Consent, in one line:** "When you send an SOS, your location and these details go to the rescue control room. Your chats with the AI companion are saved on our server and processed by Google Gemini."
5. **Permissions:** location (needed), microphone (for voice, asked when first used).

- The SOS button is visible on every intro screen. Someone opening the app for the first time in an emergency can skip straight to it.
- The details are saved on the phone and can be edited later from the menu. They go to the control room only as part of an SOS.
- Details are attached automatically to every SOS and used for the urgency ranking (F16).

### F5. Auto-SOS check-in timer (stretch)

- Turns on when there is an active alert for the user's area (if the user has opted in), or when the user switches it on by hand.
- The app asks **"Are you OK?"** at a chosen interval (15, 30 or 60 minutes) with a sound and vibration.
- If there's no answer within 5 minutes, it creates an SOS automatically (source: auto) with the last saved location.
- **Limit:** browsers only run timers while the app is open or recently in the background. The reliable background version is Phase 3.

### F6. AI companion chat with danger mode (Gemini)

An AI companion the user can talk to before, during and after a disaster. When the user is calm, it chats normally. The moment there are signs of danger, it stops chatting and switches to **danger mode**: one simple question at a time with big tap-only answers. The user doesn't have to type or think. It only asks what rescuers need most, in order of importance.

#### Companion mode (normal chat)

- Chat by typing or by voice, in English, Hindi, Assamese or Bengali. Every reply can be read aloud, so the user can hold a spoken conversation.
- Calm, warm and short: at most 3 sentences per reply.
- **Knows what the app knows.** Every message to Gemini includes the user's context, so answers are about *their* situation, not general advice:
  - active alerts for their area
  - the nearest relief camp and its distance
  - their SOS status ("received", "team dispatched")
  - any rescue unit nearby
  - their household as counts only (for example "4 people, 1 elderly"). The name and phone number are never sent to Gemini.
- **What it helps with:**
  - Preparing: "What should I pack?", "Where is the nearest camp?"
  - Explaining alerts in simple words.
  - Keeping the user company while they wait for rescue: reassurance, a short breathing exercise, what to do meanwhile.

#### Danger mode (tap-only questions)

**When it switches on:**
- The user taps SOS on the home screen.
- The user taps the **"I'm in danger"** button, which is always on the chat screen.
- Gemini spots danger in what the user says or types, for example "water is coming in" or "my father is hurt".
- Danger keywords are found in any of the four languages. This check runs on the phone, so it's instant and works without Gemini.
- A helicopter alert (F17) or a severe alert for the user's area is active when the user opens the chat.

**How it looks:**
- One question on screen at a time, in large text, read aloud automatically.
- 2 to 5 big answer buttons with icons.
- A **"Speak instead"** button for anyone who would rather answer by voice.
- **Call 112** stays visible on every question.
- Progress dots show how many questions are left.

**Question 1 decides whether an SOS is sent.** This stops false alarms when danger mode was triggered by a keyword in a normal chat.

| Answer to "Are you in danger right now?" | What happens |
|---|---|
| **In danger now** | The SOS is sent immediately (F3). The remaining questions add detail. |
| **Worried, not yet** | No SOS. The app shows "Do this now" steps and a **Send SOS** button the user can tap if things get worse. |
| **I'm safe** | No SOS. Back to normal chat. |
| No answer | No SOS is sent automatically. The question stays on screen with the **Call 112** button. |

When danger mode starts from the SOS button, question 1 is skipped. Tapping SOS already means "In danger now".

**The questions, most important first:**

| # | Question | Answer buttons | Why rescuers need it |
|---|---|---|---|
| 1 | Are you in danger right now? | In danger now / Worried, not yet / I'm safe | Decides whether to send an SOS |
| 2 | What is happening? | Flood / Landslide / Earthquake / Other | The type of rescue needed |
| 3 | Is anyone hurt? | Badly hurt (bleeding a lot, unconscious, not breathing) / Slightly hurt / No one | Medical priority |
| 4 | Can you move to a safer place? | Yes / No, I'm stuck / Not sure | Whether rescuers must come to the exact spot |
| 5 | (floods only) How high is the water? | Ankle / Knee / Waist / Chest or higher | How fast the danger is growing |
| 6 | Are all [4] people from your household with you? | Yes, all / Some are elsewhere / More people are here | Confirms the saved household details |

If no household details were saved in the intro, question 6 is replaced by two questions: "How many people are with you?" (Just me / 2 to 3 / 4 to 6 / More than 6) and "Is anyone there who can't move easily?" (Elderly / Child or baby / Pregnant / Disabled / No one).

**Rules:**
- **At most 6 questions on the tap screen.** The SOS has already been sent, so anything left over is asked afterwards by the companion in chat.
- **With Gemini:** Gemini picks the next question. It skips anything already known from the user's earlier messages or household details, and can reword a question to fit what the user already said. Gemini is only asked when the person has typed or spoken something in chat. After a plain SOS tap there is nothing to skip, so the saved order is used instantly.
- **Without Gemini:** if Gemini doesn't reply within 4 seconds, or there's no network, the app uses the saved question list (see below). The questions never stop.
- **Location and battery are never asked.** They come from GPS and the phone automatically.

**After the last question:**
1. The screen shows **"Do this now"**: 3 to 5 short steps for their exact situation, read aloud, with **Call**, **Copy as SMS** and **Strobe** buttons.
2. The chat goes back to companion mode, keeps the user company, and gives SOS status updates as they come in.

#### Saved question list (works offline)

- The full danger question list, with every answer button in all four languages, is saved on the phone the first time the app loads.
- When the phone is online, the app checks the server for a newer version of the list, so the control room can improve the questions without an app update.
- When the phone is **offline**, danger mode runs entirely from the saved list. The answers are saved on the phone and sent to the control room with the SOS when the network returns.
- Offline, the companion can't chat (that needs Gemini). The chat screen shows the saved questions, the safety guides and the helplines instead.

#### Where chats are saved

- **Online:** every chat message and reply is saved on our server (Firestore), linked to the phone's device ID. The user's chat history comes back if they reopen the app, and the control room can read the conversation of anyone with an active SOS, which gives rescuers extra context.
- **Offline:** messages and answers are saved on the phone and uploaded when the network returns.
- The user is told this in the intro (F4). There is a **Delete my chats** button in the menu.

#### What Gemini returns

Every reply is structured JSON, so the app can show buttons rather than just text:

```
{
  mode: "chat" | "danger",
  reply: "short text in the user's language",
  question?: { id, text, options: [ { id, label, icon } ], multi: true | false },
  collected: { inDanger, hazard, injured, canMove, waterLevel, people, cannotMove[] },
  severity?: "critical" | "high" | "moderate",
  steps?: [ "...", "..." ],
  sms?: "160 characters or fewer"
}
```

#### Safety rules for the AI

- Every chat screen says: "If life is in danger, call 112 first."
- Never says help is on the way unless the SOS status from the control room says so.
- Gives only basic first aid steps, never a diagnosis.
- In danger mode, replies are one short sentence, with no small talk.
- If the user mentions self-harm or is in severe distress, the companion shares the Tele-MANAS helpline (14416) and stays supportive.

### F7. Safety guides

- Flood, landslide and earthquake, each split into **Before, During and After**.
- In all four languages, with read aloud.
- Saved on the phone with the rest of the app (F1), so they open without a network.

### F8. Helplines

- Tap-to-call: 112 (all emergencies), 108 (ambulance), 101 (fire), 1070 (state emergency operations centre), 1077 (district control room), 1078 (NDMA disaster helpline), 1091 (women), 1098 (children), 14416 (Tele-MANAS mental health support).
- Calling doesn't need data.

### F9. Community hazard map

- Leaflet map with OpenStreetMap tiles, centred on the user's location.
- Layers: hazard reports, relief camps, rescue units (F17), the user's location.
- **Report a hazard:** tap the map or use GPS, choose a type (road flooded, landslide, road blocked, bridge damaged, relief camp open), add a note and an optional photo.
- Reports use the same outbox as SOS, so a dropped network doesn't lose them.
- **Duplicates merged:** reports of the same type within 300 m and 6 hours are shown as one pin, "Confirmed by N reports".

### F10. AI photo check (Gemini vision)

- When a hazard report has a photo, the server asks Gemini whether the photo shows the reported hazard. Gemini returns a verdict (matches / unclear / does not match), a confidence level and a short reason.
- Pins are marked **AI verified**, **Unverified** or **Flagged**. Flagged reports are hidden from citizens but stay visible on the dashboard.
- Photos are shrunk on the phone to about 200 KB before upload and stored in Firestore. This keeps the project on Firebase's free plan.

### F11. Relief camps and compass

- List of relief camps with name, capacity, facilities and distance. This is **demo data** in the hackathon build, clearly labelled.
- **Compass to the nearest camp:** uses GPS and the phone's direction sensor to show an arrow, the distance and the direction. Once the camp list has loaded, it keeps working without internet.
- Falls back to a direction in words (for example "1.2 km north-east") if the direction sensor isn't available.

### F12. Torch strobe and whistle

- **Strobe:** full-screen white flashes in the SOS Morse pattern (three short, three long, three short). Uses the camera flash where the browser allows it.
- **Whistle:** a loud, high-pitched sound made in the browser, so no audio file is needed.
- Keeps the screen awake while active (Wake Lock API).
- Starts automatically when a helicopter alert fires (F17).

### F13. Alerts

- The control room creates an alert from the dashboard: hazard, area (a circle on the map), severity and message in English. Gemini translates it into Assamese, Bengali and Hindi.
- Citizens see it as an in-app banner. The app checks for new alerts when it opens and every minute while it's open.
- **Stretch:** push notifications through Firebase Cloud Messaging, so the alert arrives even when the app is closed.

### F14. SMS fallback

- **From the user:** if data isn't working but there is mobile signal, the app opens the phone's SMS app with the SOS already written: coordinates, a map link, hazard and number of people. It goes to the user's emergency contacts. The user taps send. A web app can't send SMS without the user tapping send.
- **Copy as SMS:** any "Do this now" result from the companion can be copied as a 160-character message.
- **Stretch: alert SMS demo log.** When an alert is created, the server writes the SMS messages it *would* send through a gateway to a log the dashboard shows.

### F15. Languages and voice

- Interface, intro, guides, companion chat, danger questions and alerts in **English, Hindi, Assamese and Bengali**.
- **Voice input** through the browser's speech recognition (en-IN, hi-IN, bn-IN, as-IN).
- **Read aloud:** the danger questions and the helicopter alert use a natural **Gemini AI voice** in the person's language (English, Hindi, Assamese, Bengali). Each phrase is made once, saved in Firestore and on the phone, so it plays instantly and offline. Changing text (safety steps, chat, guides) uses the phone's built-in voice, because the free AI voice allows about 20 new phrases a day. `scripts/prepare-voices.js` prepares all fixed phrases before the demo.
- **Assamese voice is not guaranteed.** Chrome's support for Assamese speech and read-aloud varies by phone. If it isn't available, the app shows Assamese as text and offers voice in Bengali or Hindi. This must be tested on the demo phone before the demo.
- Translations must be checked by a native speaker before the demo (see open questions).

### F16. Rescue dashboard (control room)

- A separate page (`/dashboard`). No login in the demo.
- **Live map** of all SOS requests and rescue units. The page checks the server every 3 seconds.
- **Queue ranked by urgency.** A fixed formula gives each SOS a score from 0 to 100, so the ranking is instant, the same every time, and easy to explain:

  | Factor | Points |
  |---|---|
  | Someone badly hurt | +35 |
  | Stuck, can't move to safety | +20 |
  | Water at chest height or higher / waist / knee | +20 / +12 / +5 |
  | Each elderly, child, pregnant or disabled person | +4 each, up to +12 |
  | More than 6 people | +5 |
  | Waiting time | +1 per 10 minutes, up to +8 |

- **Gemini's part:** it reads the answers, the voice note and the chat, and writes a one-line reason for the operator, for example "Elderly woman can't walk, water at waist height, waiting 25 minutes". It can also flag something the formula missed. If Gemini isn't available, the score still works.
- Each SOS shows: time, source, location, accuracy and age of the GPS fix, battery, household details, danger-mode answers, score and reason, and the **chat history** with the companion.
- **Status buttons:** Received, Team dispatched, Rescued, Cancelled. The citizen app shows the change.
- Also: hazard report review (approve or reject flagged reports), alert creation (F13) and the rescue unit list (F17).

### F17. Rescue helicopter nearby alert

Lets a stranded person know a rescue helicopter (or boat) is close, so they can get ready and signal it.

- **Where the helicopter's position comes from:** the rescue crew opens the **crew page** (`/crew`) on a phone in the helicopter, enters a call sign and unit type (helicopter, boat, ground team), and taps Start. No login in the demo. The page shares the crew's GPS position every 10 seconds. For the demo, a second phone plays the helicopter. The operator can also add and move a demo unit from the dashboard.
- **Who gets alerted:** everyone with an active SOS.
- **When:** the server checks the distance between each unit and each active SOS. There are two alerts. A helicopter at about 180 km/h covers 3 km in a minute, so the distances leave time to react:
  - **Approaching:** within 10 km: "Rescue helicopter about 10 km away. Get ready to signal."
  - **Signal now:** within 3 km: "Rescue helicopter is very close. Signal now!"
- **How it reaches the phone:** an in-app full-screen alert. While an SOS is active the app checks for nearby units every 15 seconds, and every 5 seconds once a unit is within 15 km. Push notifications are a stretch goal.
- **What the phone does:** vibrates, plays the whistle, starts the strobe (F12), sends a fresh location update, and shows short instructions in the user's language:
  - Move to an open roof or open ground. Stay away from wires and trees.
  - Wave a bright cloth. Use the strobe if it's dark.
  - Don't run toward the helicopter. Wait for the crew's signal.
- **Crew side:** the crew page lists the nearest active SOS requests with distance, direction and urgency score. The crew sees where people are as they fly.
- **Limits:** the app must be open on the stranded person's phone. The crew's phone needs a network to share its position. Browsers may block sound until the user has tapped the screen once; tapping SOS counts. Detecting helicopters by sound without any network is Phase 3.
- **Acceptance:** Phone A has an active SOS. Phone B on the crew page comes within 3 km (or the operator moves the demo unit). Phone A shows the alert, vibrates and starts the strobe within 10 seconds.

### F19. Official alerts, weather and people nearby

**Official government alerts on Home**
- The server reads **SACHET**, the National Disaster Management Authority's public alert feed (alerts from IMD, CWC and state disaster authorities), every 10 minutes.
- It keeps alerts from the last 24 hours that mention North East India (states, districts, towns, rivers or the issuing office) and shows the newest 3, with "Show all".
- Each alert shows who issued it (for example "Issued by IMD Shillong") and links to the official source. Shown in English, as issued.
- Alerts created in the control room carry an "Issued by" label (NDRF, SDRF, ASDMA, District administration, IMD or Control room). In the demo this label is chosen by the operator; a real launch would verify the sender.

**Weather where you are**
- A card at the top of Home: temperature, conditions in the person's language, chance of rain in the next 6 hours, and wind.
- A heavy-rain warning appears when heavy rain is falling or expected.
- From Open-Meteo (free, no key), fetched by our server with the location rounded to about 1 km, kept for 10 minutes. The last reading still shows offline.
- The AI companion also knows the weather and the official alerts, so it can answer "Will it rain here?"

**People nearby (in Companion)**
- A second tab in Companion: a simple chat with everyone within 30 km, similar in spirit to bitchat. No account needed; people appear as their first name and a short tag (for example "Ritu #ev01") with their distance.
- One-tap messages: I'm safe, Need help, Water and food, Have a boat, Road flooded. "Need help" also opens the SOS questions, so a request to neighbours can become an SOS to rescuers.
- Location is rounded to about 1 km before it is saved, so exact homes aren't revealed. Messages last 24 hours.
- Anyone can report a message. It is hidden once 3 different people report it.
- Messages wait in the outbox if the network drops and send themselves later.
- The control room sees the chat in a **Chat** tab, to spot needs (water, boats, blocked roads) that never became an SOS.
- Phase 3 adds the same chat over Bluetooth in the Android app, with no internet at all.

### F18. Feature tour (for judges)

- A screen (`/#tour`, also under More) with one card per feature and a button that demonstrates each one.
- The first screen has a "Judge? Skip to the feature tour" link that fills in sample details.
- Includes two simulations so everything can be shown from one phone: a switch that simulates a network drop, and a demo helicopter that flies to the person's SOS.
- A "Reset the demo" button clears the phone's data and shows the intro again.

## 9. Future phases

### Phase 2: Offline mode

| Feature | What it does |
|---|---|
| **Offline "Do this now" steps** | A rule-based engine on the phone turns the danger-mode answers into safety steps with no internet, using a pre-translated step library in all four languages. In Phase 1 the questions work offline, but the tailored steps need Gemini. |
| **Download my area** | One tap saves map tiles around the user (about 5 km radius, zoom 12 to 16), with the size shown first. Needs a map tile provider whose terms allow offline caching, since OpenStreetMap's own servers don't allow bulk downloads. |
| **QR pass-it-on SOS** | With no network, the SOS becomes a QR code. Anyone with a connection scans it with the app and uploads it for them. Same unique ID, so no duplicates. |
| **Background sync** | The outbox sends itself even after the app is closed, on browsers that support it (Android Chrome). |
| **Flight-tracking data** | Optional extra source for F17 using public aircraft tracking (ADS-B) data. Military rescue helicopters often don't appear in public data, so the crew page remains the main source. |

### Phase 3: Native Android app and Bluetooth mesh

Web browsers can't do the following, so they need a native app. Android comes first; it can reuse the web app's screens.

**Bluetooth mesh network (similar idea to bitchat)**

- **Why it needs a native app:** web pages can connect to a Bluetooth device but can't advertise themselves to other phones, so two phones running a website can't find each other. iPhone browsers don't support Web Bluetooth at all.
- **How it works:** every phone running the app advertises and scans over Bluetooth Low Energy. Messages hop from phone to phone (store and forward). Each hop covers roughly 10 to 100 m depending on walls and terrain. Each message carries a unique ID, so phones don't forward the same message twice, and a hop limit (for example 7 hops), so it doesn't spread forever.
- **What travels over the mesh:**
  - **SOS packets** (location, danger-mode answers, household summary): every phone keeps them. The moment *any* phone in the chain gets internet, it uploads them to the server, so it acts as a gateway. This plugs straight into the Phase 1 SOS system and dashboard.
  - **"I'm safe" messages** for family and neighbours.
  - **Local chat:** a public channel for the area, plus private messages.
  - **Alerts relayed** from phones that received them online.
- **Privacy and safety:** private messages are end-to-end encrypted. SOS packets are signed so they can't be faked or changed along the way. No account or phone number is needed to join the mesh.
- **Battery:** scanning slows down when the battery is low; SOS packets always get priority.

**Other native features**

- **Helicopter sound detection on the phone:** an on-device sound recognition model (for example YAMNet, which can recognise a "helicopter" sound) listens while an SOS is active. When it hears a helicopter it triggers the same alert, strobe and whistle as F17, with no network at all.
- **Background location and check-in timer** that keep running when the app is closed.
- **Sending SMS directly** with the user's permission, where Android allows it.

**Before real use (not a demo):** login for operators and crews, phone number verification for citizens, and limits on who can read SOS data.

**Other later work:** real connection to NDRF, SDRF and ASDMA systems and official flood bulletins; a real SMS gateway and SMS-in (people text a number to create an SOS); river level and rainfall data; a volunteer boat and vehicle registry; a missing person and family reunification board.

## 10. Data model (Firestore)

```
SOS {
  id (uuid from phone), deviceId, createdAt, updatedAt,
  lat, lon, accuracyM, locatedAt (time of the GPS fix), battery,
  hazard: flood | landslide | earthquake | other | unknown,
  answers { inDanger, injured, canMove, waterLevel, people, cannotMove[] },
  note, language,
  source: app | auto | sms | qr (phase 2) | mesh (phase 3), relayedBy?,
  profile { name, phone, people, elderly, children, pregnant, disabled, medical, contacts[] },
  score 0..100, scoreParts [ { factor, points } ], aiReason,
  status: queued | received | dispatched | rescued | cancelled,
  history [ { at, status, by } ]
}

ChatMessage {
  id, deviceId, at, role: user | companion,
  text, mode: chat | danger,
  questionId?, answerIds[]?, sosId?,
  sentOffline: true | false
}

QuestionList {
  version, updatedAt,
  questions [ { id, order, onlyForHazard?, multi,
                text { en, hi, as, bn },
                options [ { id, icon, label { en, hi, as, bn } } ] } ]
}

HazardReport {
  id, deviceId, createdAt, type, lat, lon, note, photo? (about 200 KB),
  aiCheck { verdict: matches | unclear | no_match, confidence, reason },
  clusterId, visible
}

RescueUnit {
  id, callSign, type: helicopter | boat | ground,
  lat, lon, heading, speedKmh, updatedAt, active
}

RescueAlertSent { unitId, sosId, level: approaching | signal_now, at }   (stops repeat alerts)

Camp  { id, name, lat, lon, capacity, facilities[], demo: true }
Alert { id, createdAt, hazard, severity, centre { lat, lon }, radiusKm,
        message { en, hi, as, bn }, active }
```

## 11. API (Vercel serverless functions)

No endpoint needs a login in the demo.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/sos` | Create or update an SOS (safe to retry, matched by `id`). Works out the urgency score. |
| GET | `/api/sos/:id` | Citizen checks SOS status and any rescue unit nearby |
| GET | `/api/questions` | Latest danger question list, saved on the phone for offline use |
| POST | `/api/companion` | One turn of the AI companion: takes the chat so far, the user's context and language; saves the message and reply; returns a reply or the next danger question as JSON |
| GET | `/api/chat?deviceId` | The user's saved chat history |
| POST | `/api/chat/sync` | Uploads messages and answers that were saved on the phone while offline |
| DELETE | `/api/chat?deviceId` | Delete my chats |
| POST | `/api/reports` | Create a hazard report (photo optional) |
| GET | `/api/reports?lat&lon&radius` | Reports near a point, duplicates merged |
| GET | `/api/camps` | Relief camps |
| GET | `/api/alerts?lat&lon` | Active alerts for an area |
| POST | `/api/units/:id/position` | Crew page sends the unit's position; server checks distances and records helicopter alerts |
| GET | `/api/units` | Active rescue units |
| GET | `/api/dashboard/sos` | Ranked SOS queue with chat history |
| PATCH | `/api/dashboard/sos/:id` | Operator changes an SOS status |
| POST | `/api/dashboard/alerts` | Operator creates an alert |

## 12. Technology

| Layer | Choice | Why |
|---|---|---|
| Front end | Plain HTML, CSS and JavaScript, no build step | Small download, fast on cheap phones, quick to build |
| Install and offline start | Web app manifest, service worker, IndexedDB for the outbox, saved question list and unsent chat | Installable, opens without a network, survives network drops |
| Map | Leaflet 1.9 with OpenStreetMap tiles | Light and open |
| AI | Google Gemini API through the official `@google/genai` SDK, Flash-class model (exact model ID confirmed from Google AI Studio at build time) | Fast, low cost, handles text and images, works in Indian languages |
| Backend | Vercel serverless functions (Node.js) | Same place as the website, free tier, deploys from GitHub |
| Database | **Firebase Firestore**, free Spark plan | Vercel functions can't keep files between requests, so a hosted database is needed. Firestore has a free tier and is a Google product like Gemini |
| Photos | Shrunk to about 200 KB on the phone and stored in Firestore | No paid Firebase plan or card needed |
| Database access | Only the Vercel functions talk to Firestore, using the Firebase Admin SDK with a service account. Firestore rules block all direct access from browsers | One safe path to the data, even without logins |
| Live updates | Dashboard checks the API every 3 seconds. Citizen app checks every 15 seconds while an SOS is active, and every 5 seconds when a rescue unit is near | Simple, reliable on Vercel, fast enough for the helicopter alert |
| Push (stretch) | Firebase Cloud Messaging | Alerts when the app is closed |
| Code and deploy | GitHub repository connected to Vercel; every push deploys | Matches the event's GitHub requirement |

**Security:** the Gemini API key lives only in a Vercel environment variable (`GEMINI_API_KEY`) and is never sent to the browser. The Firebase service account key is also an environment variable. AI and upload endpoints are rate-limited per device and per IP. Text and photo inputs have size limits. The `.env` file is never committed to GitHub.

## 13. Limits and honest notes for judges

- **This is a demo with no login.** Anyone with the link can open the dashboard and the crew page, and anyone could post a fake rescue unit. Use sample names and phone numbers in the demo, not real ones. A real launch needs operator and crew login and phone verification first.
- **Chats are saved and processed by Google.** Chats are stored on our server and sent to Gemini to get a reply. On the free Google AI Studio tier, Google may use that data to improve its products. The name and phone number are never sent to Gemini, and the app tells the user all this in the intro.
- **Phase 1 needs internet for the AI and the map.** The SOS button, saved danger questions and guides open offline, and the SOS waits on the phone until the network returns. Full offline mode is Phase 2.
- **Bluetooth mesh needs a native app.** Browsers can't let two phones find each other over Bluetooth. It's planned for Phase 3, and the server is already built to accept SOS requests relayed from the mesh.
- **Helicopter position comes from the crew page.** Military rescue helicopters often don't broadcast their position publicly, so the crew shares it from a phone that has a network. The stranded person's app must be open to show the alert. Detecting the helicopter by sound comes in Phase 3.
- **NDRF integration is simulated.** Our dashboard stands in for a control room. In production the same API would feed NDRF, SDRF or district emergency centres.
- **SMS needs a user tap.** Browsers don't let web apps send SMS silently.
- **iPhone limits.** Timers stop when the app is in the background. The demo should run on an Android phone.
- **Assamese voice** depends on the phone. There is a text fallback, and voice in Bengali or Hindi.
- **Demo data.** Camps, the starting alerts and some hazard reports are sample data and are labelled as such.
- **AI is advisory.** The companion gives general safety guidance, not medical advice or counselling, and always shows the 112 reminder. The saved danger questions keep working when Gemini is slow or down.

## 14. Build order (hackathon plan)

Built in this order so that if time runs out, the most important parts are already working.

| Stage | Features | Result |
|---|---|---|
| 0 | GitHub repo, Vercel project, Firebase project (Firestore), Gemini and Firebase keys in Vercel settings | Empty app live on a Vercel URL |
| 1 | F1, F2, F4 intro and details, F7, F8, F15 (interface text) | Installable app with intro, guides and helplines in four languages |
| 2 | F3 send-first SOS, F6 saved danger questions, SOS API, F16 map, queue and urgency score | The core story: tap SOS, it's sent at once, answers follow, even through a network drop |
| 3 | F17 crew page and helicopter alert, F12 strobe and whistle | The "helicopter is here, signal now" moment |
| 4 | F6 companion chat with Gemini, chat saving, Gemini picking the danger questions, F15 voice | A spoken AI companion that switches to tap-only questions in danger |
| 5 | F9, F11, F10 | Hazard map, camps and compass, AI photo check |
| 6 | F13 in-app alerts, F14 SMS from the user, F16 Gemini reason and chat history | Alerts, SMS, richer dashboard |
| 7 | Testing on a real phone, README, demo video, final push to GitHub | Ready to submit |
| Stretch | Push notifications, F5 check-in timer, alert SMS log | Only if time is left |

## 15. Demo script (3 minutes)

Before the demo: test voice on the demo phone. If Assamese voice doesn't work, show Assamese as text and use Hindi or Bengali for the spoken parts.

1. **Install and intro:** open the Vercel link and add the app to the home screen. Pick the language, swipe through the intro, and enter sample details (4 people, 1 elderly). No login.
2. **AI companion:** ask by voice "Is there any alert near me?" It answers out loud. Then say "water is coming into the house". The chat switches to danger mode: big tap-only questions, read aloud.
3. **Send first, ask after:** tap "In danger now". The SOS appears on the dashboard at once, before any other question is answered. Each tap after that adds detail on the dashboard live, and the urgency score climbs.
4. **Network drop:** on a second SOS, turn on airplane mode. The saved questions still work. It shows "Saved on phone". Turn airplane mode off and it appears on the dashboard with all its answers.
5. **Rescue:** the operator opens the SOS, reads the AI's one-line reason and the chat history, and marks it "Team dispatched". The citizen's phone shows the update.
6. **Helicopter:** a second phone on the crew page comes close (or the operator moves the demo unit). The citizen's phone vibrates, whistles, starts the strobe and shows "Rescue helicopter is very close. Signal now!"
7. **Alert:** the operator creates a landslide alert. It's translated automatically and shows on the citizen phone.
8. **Roadmap slide:** offline mode and the Bluetooth mesh network, where SOS messages hop phone to phone until one phone finds a network.

## 16. Success metrics

- The full demo script runs end to end on a real Android phone using the live Vercel link.
- An SOS reaches the dashboard within 3 seconds of tapping "In danger now" or the SOS button.
- 100% of SOS requests sent during a network drop reach the dashboard after reconnecting, with no duplicates.
- A helicopter alert shows on the citizen phone within 10 seconds of the unit coming within 3 km.
- A companion reply arrives in under 5 seconds. Each danger question appears in under 4 seconds (the saved question takes over if Gemini is slower).
- Danger mode never asks more than 6 tap questions.
- First load under 500 KB, not counting map tiles.
- Lighthouse marks the app as installable.

## 17. Open questions

1. **Finale time:** the event page lists the finale as 21 Nov, 5 to 6 PM, which is before the submission deadline. Is that right? If the demo is on 21 Nov, the scope must shrink to stages 0 to 3.
2. **Submission:** what does the form ask for (repo link, live link, demo video, prompt log)?
3. **Gemini quota:** does the Google AI Studio key's free quota cover the demo, including photo checks?
4. **Translations:** is there a native Assamese and Bengali speaker on the team to check the text?
5. **Camp data:** use demo camps, or does the team have a real list for one district?
6. **Demo area:** which district or city should the demo centre on? Guwahati is the default.

**Decided:** product name apadaAlert; hosting on GitHub and Vercel; Firebase Firestore on the free plan; Gemini key from Google AI Studio; no login in the demo; chats saved on the server; danger questions saved on the phone.
