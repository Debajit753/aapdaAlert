// Danger-mode question list (PRD F6). Saved on the phone for offline use.
// Also served by GET /api/questions so it can be updated without an app update.
// Translations must be checked by a native speaker before real use.
// Each option's icon is a Material Symbols name from public/js/icons.js.

export const QUESTIONS_VERSION = 2;

export const QUESTIONS = [
  {
    id: "inDanger",
    text: {
      en: "Are you in danger right now?",
      hi: "क्या आप अभी खतरे में हैं?",
      as: "আপুনি এতিয়া বিপদত আছেনে?",
      bn: "আপনি কি এখন বিপদে আছেন?",
    },
    options: [
      { id: "now", icon: "sos", label: { en: "In danger now", hi: "अभी खतरे में", as: "এতিয়াই বিপদত", bn: "এখনই বিপদে" } },
      { id: "worried", icon: "warning", label: { en: "Worried, not yet", hi: "चिंता है, अभी नहीं", as: "চিন্তা হৈছে, এতিয়াও নহয়", bn: "চিন্তিত, এখনও নয়" } },
      { id: "safe", icon: "check_circle", label: { en: "I'm safe", hi: "मैं सुरक्षित हूँ", as: "মই সুৰক্ষিত", bn: "আমি নিরাপদ" } },
    ],
  },
  {
    id: "hazard",
    text: { en: "What is happening?", hi: "क्या हो रहा है?", as: "কি হৈ আছে?", bn: "কী হচ্ছে?" },
    options: [
      { id: "flood", icon: "flood", label: { en: "Flood", hi: "बाढ़", as: "বান", bn: "বন্যা" } },
      { id: "landslide", icon: "landslide", label: { en: "Landslide", hi: "भूस्खलन", as: "ভূমিস্খলন", bn: "ভূমিধস" } },
      { id: "earthquake", icon: "earthquake", label: { en: "Earthquake", hi: "भूकंप", as: "ভূমিকম্প", bn: "ভূমিকম্প" } },
      { id: "other", icon: "help", label: { en: "Other", hi: "कुछ और", as: "অন্য", bn: "অন্য কিছু" } },
    ],
  },
  {
    id: "injured",
    text: { en: "Is anyone hurt?", hi: "क्या कोई घायल है?", as: "কোনোবা আঘাতপ্ৰাপ্ত হৈছেনে?", bn: "কেউ কি আহত?" },
    options: [
      { id: "bad", icon: "personal_injury", label: {
        en: "Badly hurt (heavy bleeding, unconscious, not breathing)",
        hi: "गंभीर घायल (बहुत खून, बेहोश, साँस नहीं)",
        as: "গুৰুতৰ আঘাত (বহুত তেজ, অচেতন, উশাহ নাই)",
        bn: "গুরুতর আহত (অনেক রক্ত, অজ্ঞান, শ্বাস নেই)",
      } },
      { id: "slight", icon: "healing", label: { en: "Slightly hurt", hi: "थोड़ी चोट", as: "অলপ আঘাত", bn: "সামান্য আহত" } },
      { id: "none", icon: "sentiment_satisfied", label: { en: "No one", hi: "कोई नहीं", as: "কোনো নহয়", bn: "কেউ না" } },
    ],
  },
  {
    id: "canMove",
    text: {
      en: "Can you move to a safer place?",
      hi: "क्या आप किसी सुरक्षित जगह जा सकते हैं?",
      as: "আপুনি সুৰক্ষিত ঠাইলৈ যাব পাৰিবনে?",
      bn: "আপনি কি নিরাপদ জায়গায় যেতে পারবেন?",
    },
    options: [
      { id: "yes", icon: "directions_run", label: { en: "Yes", hi: "हाँ", as: "পাৰিম", bn: "হ্যাঁ" } },
      { id: "stuck", icon: "block", label: { en: "No, I'm stuck", hi: "नहीं, फँसे हुए हैं", as: "নোৱাৰো, আবদ্ধ হৈ আছো", bn: "না, আটকে আছি" } },
      { id: "unsure", icon: "help", label: { en: "Not sure", hi: "पता नहीं", as: "নিশ্চিত নহয়", bn: "নিশ্চিত নই" } },
    ],
  },
  {
    id: "waterLevel",
    onlyForHazard: "flood",
    text: { en: "How high is the water?", hi: "पानी कितना ऊपर है?", as: "পানী কিমান ওখলৈ উঠিছে?", bn: "জল কতটা উঁচু?" },
    options: [
      { id: "ankle", icon: "humidity_low", label: { en: "Ankle", hi: "टखने तक", as: "ভৰিৰ গাঁঠিলৈকে", bn: "গোড়ালি পর্যন্ত" } },
      { id: "knee", icon: "humidity_mid", label: { en: "Knee", hi: "घुटने तक", as: "আঁঠুলৈকে", bn: "হাঁটু পর্যন্ত" } },
      { id: "waist", icon: "humidity_high", label: { en: "Waist", hi: "कमर तक", as: "কঁকাললৈকে", bn: "কোমর পর্যন্ত" } },
      { id: "chest", icon: "waves", label: { en: "Chest or higher", hi: "छाती या ऊपर", as: "বুকুলৈকে বা তাতকৈ ওপৰত", bn: "বুক বা তার উপরে" } },
    ],
  },
  {
    id: "allWithYou",
    needsProfile: true,
    text: {
      en: "Are all {n} people from your household with you?",
      hi: "क्या आपके घर के सभी {n} लोग आपके साथ हैं?",
      as: "আপোনাৰ ঘৰৰ আটাইকেইজন ({n} জন) আপোনাৰ লগত আছেনে?",
      bn: "আপনার পরিবারের সবাই ({n} জন) কি আপনার সঙ্গে আছেন?",
    },
    options: [
      { id: "all", icon: "family_restroom", label: { en: "Yes, all", hi: "हाँ, सभी", as: "হয়, সকলো", bn: "হ্যাঁ, সবাই" } },
      { id: "some_elsewhere", icon: "swap_horiz", label: { en: "Some are elsewhere", hi: "कुछ कहीं और हैं", as: "কিছুমান আন ঠাইত আছে", bn: "কেউ কেউ অন্য জায়গায়" } },
      { id: "more_here", icon: "group_add", label: { en: "More people are here", hi: "यहाँ और लोग भी हैं", as: "ইয়াত আৰু মানুহ আছে", bn: "এখানে আরও লোক আছেন" } },
    ],
  },
  {
    id: "people",
    noProfile: true,
    text: { en: "How many people are with you?", hi: "आपके साथ कितने लोग हैं?", as: "আপোনাৰ লগত কিমানজন মানুহ আছে?", bn: "আপনার সঙ্গে কতজন আছেন?" },
    options: [
      { id: "1", icon: "person", label: { en: "Just me", hi: "सिर्फ़ मैं", as: "কেৱল মই", bn: "শুধু আমি" } },
      { id: "2-3", icon: "group", label: { en: "2 to 3", hi: "2 से 3", as: "২ৰ পৰা ৩", bn: "২ থেকে ৩" } },
      { id: "4-6", icon: "groups", label: { en: "4 to 6", hi: "4 से 6", as: "৪ৰ পৰা ৬", bn: "৪ থেকে ৬" } },
      { id: "7+", icon: "groups", label: { en: "More than 6", hi: "6 से ज़्यादा", as: "৬তকৈ বেছি", bn: "৬ জনের বেশি" } },
    ],
  },
  {
    id: "cannotMove",
    noProfile: true,
    multi: true,
    text: {
      en: "Is anyone there who can't move easily?",
      hi: "क्या कोई ऐसा है जो आसानी से चल नहीं सकता?",
      as: "সহজে লৰচৰ কৰিব নোৱাৰা কোনোবা আছেনে?",
      bn: "এমন কেউ আছেন যিনি সহজে চলাফেরা করতে পারেন না?",
    },
    options: [
      { id: "elderly", icon: "elderly", label: { en: "Elderly", hi: "बुज़ुर्ग", as: "বয়সস্থ", bn: "বয়স্ক" } },
      { id: "child", icon: "child_care", label: { en: "Child or baby", hi: "बच्चा या शिशु", as: "শিশু বা কেঁচুৱা", bn: "শিশু বা বাচ্চা" } },
      { id: "pregnant", icon: "pregnant_woman", label: { en: "Pregnant", hi: "गर्भवती", as: "গৰ্ভৱতী", bn: "গর্ভবতী" } },
      { id: "disabled", icon: "accessible", label: { en: "Disabled", hi: "दिव्यांग", as: "দিব্যাংগ", bn: "প্রতিবন্ধী" } },
      { id: "none", icon: "sentiment_satisfied", label: { en: "No one", hi: "कोई नहीं", as: "কোনো নহয়", bn: "কেউ না" } },
    ],
  },
];

/** Most questions shown on the tap screen (PRD F6). */
export const MAX_TAP_QUESTIONS = 6;

/** The words read aloud for a question: the question, then its answers. */
export function spokenQuestion(q, lang, text = (q.text[lang] || q.text.en)) {
  return `${text} ${q.options.map((o) => o.label[lang] || o.label.en).join(", ")}`;
}

/**
 * Questions whose spoken words never change, so their AI voice can be made once and saved.
 * ("Are all {n} people...?" changes with the household size, so it uses the phone's own voice.)
 */
export const FIXED_VOICE_QUESTIONS = QUESTIONS.filter((q) => !q.text.en.includes("{n}"));
