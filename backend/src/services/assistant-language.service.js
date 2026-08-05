/**
 * Language handling for Ask LOCATIUM — Hindi (Devanagari), English, and Hinglish.
 *
 * Why this module exists: the NLU normaliser strips anything outside `[\w\s./-]`, and JavaScript's
 * `\w` is ASCII-only, so Devanagari input was being erased before intent detection ever ran —
 * Hindi-script questions could not work at all. Rather than rewrite the (well-tested) English
 * pattern matcher, we bridge into it: detect the script, map domain vocabulary from Devanagari to
 * the English keywords the matcher already knows, and tell the model which language to answer in.
 *
 * Design stance: keep numerals in Latin digits in every language. "₹22,203/sq yd" must stay
 * unambiguous for someone making a money decision, even in a Hindi answer.
 */

/** Devanagari Unicode block. */
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Domain vocabulary: Devanagari → the English token the existing NLU patterns match on.
 * Only terms that carry intent/entity meaning — this is a bridge, not a translator.
 */
const HI_TO_EN = [
  // intent verbs / questions
  ['कितना', 'kitna'], ['कितनी', 'kitni'], ['कहाँ', 'kahan'], ['कहां', 'kahan'],
  ['कौन', 'kaun'], ['कैसा', 'kaisa'], ['कैसी', 'kaisi'], ['क्या', 'kya'],
  ['बताओ', 'batao'], ['बताइए', 'batao'], ['दिखाओ', 'dikhao'], ['दिखाइए', 'dikhao'],
  ['ढूंढो', 'dhundo'], ['खोजो', 'find'], ['सुझाव', 'suggest'], ['तुलना', 'compare'],
  ['मदद', 'help'], ['समझाओ', 'explain'], ['सबसे', 'best'], ['अच्छा', 'good'],
  ['अच्छी', 'good'], ['बेहतर', 'better'], ['सही', 'good'],
  // land / money
  ['ज़मीन', 'land'], ['जमीन', 'land'], ['भूमि', 'land'], ['प्लॉट', 'plot'],
  ['कीमत', 'price'], ['दाम', 'price'], ['रेट', 'rate'], ['भाव', 'rate'],
  ['बजट', 'budget'], ['करोड़', 'crore'], ['लाख', 'lakh'], ['रुपये', 'rs'], ['रुपए', 'rs'],
  ['सर्कल', 'circle'], ['कलेक्टर', 'collector'], ['वर्ग', 'sq'], ['गज', 'yard'],
  ['एकड़', 'acre'], ['लागत', 'cost'], ['निवेश', 'investment'], ['खर्च', 'cost'],
  // sectors
  ['औद्योगिक', 'industrial'], ['उद्योग', 'industrial'], ['फैक्ट्री', 'factory'],
  ['कारखाना', 'factory'], ['गोदाम', 'warehouse'], ['वेयरहाउस', 'warehouse'],
  ['आवासीय', 'residential'], ['रिहायशी', 'residential'], ['मकान', 'housing'],
  ['घर', 'housing'], ['कॉलोनी', 'colony'], ['व्यावसायिक', 'commercial'],
  ['दुकान', 'shop'], ['ऑफिस', 'office'], ['कृषि', 'agricultural'], ['खेती', 'agricultural'],
  ['खेत', 'farm'],
  // place / infra
  ['जगह', 'jagah'], ['इलाका', 'area'], ['क्षेत्र', 'area'], ['ज़िला', 'district'],
  ['जिला', 'district'], ['यहाँ', 'yaha'], ['यहां', 'yaha'], ['वहाँ', 'waha'],
  ['वहां', 'waha'], ['पास', 'paas'], ['नज़दीक', 'nearest'], ['नजदीक', 'nearest'],
  ['दूरी', 'distance'], ['सड़क', 'road'], ['हाईवे', 'highway'], ['रेल', 'rail'],
  ['हवाई', 'airport'], ['मेट्रो', 'metro'], ['अस्पताल', 'hospital'], ['स्कूल', 'school'],
  ['बिजली', 'power'], ['पानी', 'water'], ['सुविधा', 'facility'],
  // scoring / policy
  ['स्कोर', 'score'], ['रैंक', 'rank'], ['जोखिम', 'risk'], ['खतरा', 'risk'],
  ['नीति', 'policy'], ['नियम', 'rules'], ['मंजूरी', 'approval'], ['अनुमति', 'permission'],
  ['लाइसेंस', 'licence'], ['प्रदूषण', 'pollution'], ['पर्यावरण', 'environment'],
  ['फॉर्मूला', 'formula'], ['गणना', 'calculation'],
];

/** Devanagari district names → canonical English (feeds the existing district matcher). */
const HI_DISTRICTS = [
  ['गुरुग्राम', 'Gurugram'], ['गुड़गांव', 'Gurugram'], ['गुडगांव', 'Gurugram'],
  ['फरीदाबाद', 'Faridabad'], ['सोनीपत', 'Sonipat'], ['पानीपत', 'Panipat'],
  ['करनाल', 'Karnal'], ['अंबाला', 'Ambala'], ['अम्बाला', 'Ambala'], ['हिसार', 'Hisar'],
  ['रोहतक', 'Rohtak'], ['रेवाड़ी', 'Rewari'], ['झज्जर', 'Jhajjar'], ['पलवल', 'Palwal'],
  ['नूह', 'Nuh'], ['मेवात', 'Nuh'], ['भिवानी', 'Bhiwani'], ['सिरसा', 'Sirsa'],
  ['फतेहाबाद', 'Fatehabad'], ['जींद', 'Jind'], ['कैथल', 'Kaithal'],
  ['कुरुक्षेत्र', 'Kurukshetra'], ['यमुनानगर', 'Yamunanagar'], ['पंचकूला', 'Panchkula'],
  ['महेंद्रगढ़', 'Mahendragarh'], ['नारनौल', 'Mahendragarh'], ['चरखी दादरी', 'Charkhi Dadri'],
  ['दादरी', 'Charkhi Dadri'],
];

/** Romanised-Hindi markers used to spot Hinglish in Latin script. */
const HINGLISH_MARKERS = [
  'kitna', 'kitni', 'kahan', 'kaha', 'kaun', 'kon', 'kaisa', 'kaisi', 'kya', 'batao',
  'dikhao', 'dhundo', 'jagah', 'zameen', 'jameen', 'daam', 'keemat', 'bhav', 'paisa',
  'yaha', 'yahan', 'waha', 'wahan', 'idhar', 'udhar', 'paas', 'accha', 'acha', 'sasta',
  'mahanga', 'chahiye', 'chaiye', 'karna', 'karne', 'lena', 'lene', 'mein', 'hai', 'hain',
  'nahi', 'nahin', 'kar', 'ke liye', 'ka', 'ki', 'ko', 'se', 'aur', 'ya', 'bhi', 'sab',
  'thoda', 'zyada', 'jyada', 'kam', 'bada', 'chota', 'wala', 'wali', 'karod', 'crore',
];

const DEVANAGARI_DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

/**
 * Classify the language of a user turn.
 * @returns {{language: 'hi'|'en'|'hinglish', script: 'devanagari'|'latin'|'mixed', confidence: number}}
 */
function detectLanguage(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { language: 'en', script: 'latin', confidence: 0 };

  const devChars = (raw.match(/[ऀ-ॿ]/g) || []).length;
  const latinChars = (raw.match(/[A-Za-z]/g) || []).length;
  const totalLetters = devChars + latinChars;

  if (totalLetters === 0) return { language: 'en', script: 'latin', confidence: 0.2 };

  const devRatio = devChars / totalLetters;
  if (devRatio > 0.6) {
    return { language: 'hi', script: 'devanagari', confidence: Math.min(1, devRatio) };
  }
  if (devRatio > 0.15) {
    // Genuinely mixed script — treat as Hinglish so the reply can mirror it.
    return { language: 'hinglish', script: 'mixed', confidence: 0.7 };
  }

  const words = raw.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length) {
    const hits = words.filter((w) => HINGLISH_MARKERS.includes(w)).length;
    // Two markers, or one in a short question, is a reliable Hinglish signal.
    if (hits >= 2 || (hits === 1 && words.length <= 6)) {
      return { language: 'hinglish', script: 'latin', confidence: Math.min(1, 0.5 + hits * 0.15) };
    }
  }
  return { language: 'en', script: 'latin', confidence: 0.8 };
}

/**
 * Bridge Devanagari text into the tokens the English NLU already matches.
 * Returns text with domain terms and district names replaced, digits Latinised.
 * The original is always kept for the prompt — this output is for intent matching only.
 */
function bridgeToEnglishTokens(text) {
  let out = String(text || '');
  if (!DEVANAGARI.test(out)) return out;

  for (const [hi, en] of HI_DISTRICTS) {
    if (out.includes(hi)) out = out.split(hi).join(` ${en} `);
  }
  for (const [hi, en] of HI_TO_EN) {
    if (out.includes(hi)) out = out.split(hi).join(` ${en} `);
  }
  out = out.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
  // Drop leftover Devanagari (grammar particles we don't map) so it can't confuse matching.
  out = out.replace(/[ऀ-ॿ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/** Instruction appended to the system prompt so the reply mirrors the user's language. */
function replyLanguageInstruction(language) {
  switch (language) {
    case 'hi':
      return 'The user wrote in Hindi (Devanagari). Reply in simple conversational Hindi using Devanagari script. Keep all numbers, ₹ amounts, units (sq yd, acre, km) and proper nouns (district and zone names) in Latin script/numerals so they stay unambiguous.';
    case 'hinglish':
      return 'The user wrote in Hinglish (Hindi-English mix, Roman script). Reply in the same natural Hinglish register — Roman script, everyday mixed vocabulary. Keep all numbers, ₹ amounts, units and place names in English/Latin numerals.';
    default:
      return 'The user wrote in English. Reply in clear, plain English.';
  }
}

module.exports = {
  detectLanguage,
  bridgeToEnglishTokens,
  replyLanguageInstruction,
  HI_DISTRICTS,
  HI_TO_EN,
};
