/**
 * Beginner support for Ask LOCATIUM.
 *
 * A first-time investor stalls on vocabulary long before they stall on analysis: "circle rate",
 * "CLU", "HSIIDC", "sq yd" are all assumed knowledge in this domain. This module supplies
 * plain-language glossary entries (English + Hindi), detects jargon the user is likely stuck on,
 * and provides onboarding prompts.
 *
 * Onboarding follows current practice for complex tools: no long upfront tour. Show value fast,
 * teach in place, and offer the next useful step rather than a feature tour.
 */

/**
 * Glossary. `en`/`hi` are deliberately non-technical — written for someone who has never
 * bought land. `why` explains why the concept matters to a buying decision.
 */
const GLOSSARY = {
  'circle rate': {
    term: 'Circle rate (collector rate)',
    en: 'The minimum price per unit of land the government will officially recognise for a sale in that area.',
    hi: 'सरकार द्वारा तय की गई न्यूनतम कीमत, जिस पर उस इलाके में ज़मीन की रजिस्ट्री हो सकती है।',
    why: 'It is a legal floor, not the market price. You usually pay at or above it, and stamp duty is calculated on it.',
    aliases: ['collector rate', 'dc rate', 'government rate', 'sarkari rate'],
  },
  clu: {
    term: 'CLU — Change of Land Use',
    en: 'Official permission to use a plot for a different purpose than it is currently classified for, such as farming land used for a factory.',
    hi: 'ज़मीन का उपयोग बदलने की सरकारी अनुमति — जैसे खेती की ज़मीन पर फैक्ट्री बनाना।',
    why: 'Without CLU you cannot legally build industrial or commercial property on agricultural land. It costs money and takes time.',
    aliases: ['change of land use', 'land use change'],
  },
  eia: {
    term: 'EIA — Environmental Impact Assessment',
    en: 'A study required before certain projects, checking the effect on air, water, land and nearby communities.',
    hi: 'कुछ परियोजनाओं से पहले ज़रूरी अध्ययन, जो हवा, पानी, ज़मीन और आसपास के लोगों पर असर जाँचता है।',
    why: 'If your project needs it, budget for months of approval time before construction can start.',
    aliases: ['environmental clearance', 'environment impact'],
  },
  hsiidc: {
    term: 'HSIIDC',
    en: 'Haryana State Industrial and Infrastructure Development Corporation — the state body that develops and allots planned industrial estates.',
    hi: 'हरियाणा राज्य औद्योगिक एवं आधारभूत संरचना विकास निगम — राज्य की संस्था जो नियोजित औद्योगिक क्षेत्र बनाती और आवंटित करती है।',
    why: 'Land inside an HSIIDC estate usually comes with roads, power and water already planned, and a cleaner title — often simpler than buying private farmland.',
    aliases: ['hsiidc estate', 'industrial model township'],
  },
  hsvp: {
    term: 'HSVP',
    en: 'Haryana Shahari Vikas Pradhikaran — the state urban development authority that plans sectors and allots plots.',
    hi: 'हरियाणा शहरी विकास प्राधिकरण — शहरी सेक्टर बनाने और प्लॉट आवंटित करने वाली संस्था।',
    why: 'HSVP plots sit inside planned sectors, so approvals and utilities are usually more predictable.',
    aliases: ['huda'],
  },
  imt: {
    term: 'IMT — Industrial Model Township',
    en: 'A large planned industrial area with built-in infrastructure, such as IMT Manesar.',
    hi: 'बड़ा नियोजित औद्योगिक क्षेत्र जिसमें बुनियादी सुविधाएँ पहले से मौजूद होती हैं, जैसे IMT मानेसर।',
    why: 'Good for manufacturing because power, roads and logistics access are designed in from the start.',
    aliases: [],
  },
  'sq yd': {
    term: 'Square yard (sq yd / gaj)',
    en: 'The unit land is usually priced in here. One acre is 4,840 sq yd.',
    hi: 'ज़मीन की कीमत आमतौर पर इसी इकाई में बताई जाती है। एक एकड़ = 4,840 वर्ग गज।',
    why: 'Always check whether a quoted price is per sq yd or per acre — the difference is roughly 4,840 times.',
    aliases: ['square yard', 'gaj', 'sqyd', 'per yard'],
  },
  acre: {
    term: 'Acre',
    en: 'A land area unit equal to 4,840 square yards, about the size of a large sports field.',
    hi: 'ज़मीन के क्षेत्र की इकाई, 4,840 वर्ग गज के बराबर।',
    why: 'Industrial plots are usually discussed in acres, while rates are quoted per sq yd.',
    aliases: ['ekad', 'ekar'],
  },
  'licensed colony': {
    term: 'Licensed colony',
    en: 'A private residential or commercial development that has received an official development licence.',
    hi: 'निजी कॉलोनी जिसे विकास का सरकारी लाइसेंस मिल चुका है।',
    why: 'A licence signals the layout and approvals are recognised — unlicensed colonies carry far more legal risk.',
    aliases: ['licenced colony'],
  },
  'opportunity score': {
    term: 'Opportunity score',
    en: 'LOCATIUM\'s 0-100 rating combining location quality, land cost, zoning, utilities and availability.',
    hi: 'LOCATIUM की 0 से 100 की रेटिंग, जो लोकेशन, ज़मीन की कीमत, ज़ोनिंग, सुविधाएँ और उपलब्धता को जोड़ती है।',
    why: 'It is a screening aid to rank options, not a valuation or a recommendation to buy.',
    aliases: ['score', 'rating'],
  },
  'environmental suitability': {
    term: 'Environmental suitability',
    en: 'How free the site is from environmental constraints. A higher number means fewer problems.',
    hi: 'साइट पर पर्यावरणीय अड़चनें कितनी कम हैं। ज़्यादा अंक = कम दिक्कत।',
    why: 'The direction confuses people: high is good here. Low suggests forest, flood or air-quality issues nearby.',
    aliases: ['env suitability', 'environmental risk'],
  },
  'stamp duty': {
    term: 'Stamp duty',
    en: 'A government tax paid when property is registered in your name.',
    hi: 'संपत्ति की रजिस्ट्री के समय चुकाया जाने वाला सरकारी शुल्क।',
    why: 'A real cost on top of the land price — include it when you compare total outlay.',
    aliases: ['registration charges', 'registry cost'],
  },
  khasra: {
    term: 'Khasra number',
    en: 'The plot number used in village land records to identify a specific parcel.',
    hi: 'गाँव के भू-अभिलेख में ज़मीन के टुकड़े की पहचान करने वाला नंबर।',
    why: 'Needed to verify ownership and boundaries in the revenue records.',
    aliases: ['khasra number', 'khewat'],
  },
  crore: {
    term: 'Crore / lakh',
    en: 'Indian number units: 1 lakh = 100,000 and 1 crore = 10,000,000 (100 lakh).',
    hi: 'भारतीय संख्या इकाइयाँ: 1 लाख = 1,00,000 और 1 करोड़ = 1,00,00,000।',
    why: 'Budgets here are almost always stated in lakh or crore.',
    aliases: ['lakh', 'lac'],
  },
  freehold: {
    term: 'Freehold vs leasehold',
    en: 'Freehold means you own the land outright. Leasehold means you hold it for a fixed number of years.',
    hi: 'फ्रीहोल्ड = ज़मीन पूरी तरह आपकी। लीजहोल्ड = तय वर्षों के लिए अधिकार।',
    why: 'Changes what you can build, resell and mortgage — check before committing.',
    aliases: ['leasehold'],
  },
  'master plan': {
    term: 'Master plan / development plan',
    en: 'The official map showing what each area of a town is meant to be used for in future.',
    hi: 'सरकारी नक्शा जो बताता है कि शहर के किस हिस्से का भविष्य में क्या उपयोग होगा।',
    why: 'Buying against the master plan is how people get stuck with land they cannot develop.',
    aliases: ['development plan', 'controlled area'],
  },
  jamabandi: {
    term: 'Jamabandi',
    en: 'The village land-record extract that shows who is recorded as owner or cultivator of a parcel.',
    hi: 'गाँव का भू-अभिलेख जो बताता है कि ज़मीन किसके नाम दर्ज है।',
    why: 'It is the starting point for title checks. LOCATIUM does not scrape jamabandi — get a certified copy from revenue records.',
    aliases: ['jamabandi copy', 'record of rights'],
  },
  mutation: {
    term: 'Mutation (intkal)',
    en: 'The update of revenue records after a sale, inheritance or gift so the new owner’s name appears.',
    hi: 'बिक्री या विरासत के बाद राजस्व रिकॉर्ड में नए मालिक का नाम चढ़ाना।',
    why: 'A registered deed without mutation still leaves the old name on village records — banks and buyers notice.',
    aliases: ['intkal', 'intkaal', 'dakhil kharij'],
  },
  'power of attorney': {
    term: 'Power of attorney sale',
    en: 'Someone is authorised to sign on the owner’s behalf. A common way land is transacted, and a common source of disputes.',
    hi: 'मालिक की ओर से किसी और को हस्ताक्षर का अधिकार — ज़मीन सौदों में आम, विवादों में भी आम।',
    why: 'Treat POA deals as higher legal risk until a lawyer traces the chain to a registered conveyance.',
    aliases: ['poa', 'gpa', 'attorney sale'],
  },
  'agricultural ceiling': {
    term: 'Agricultural land ceiling',
    en: 'A legal cap on how much farmland one person or family may hold in the state.',
    hi: 'कानून द्वारा एक व्यक्ति या परिवार के पास कितनी कृषि भूमि हो सकती है, इसकी सीमा।',
    why: 'Buying above the ceiling, or buying farmland you cannot legally hold, can unwind the deal.',
    aliases: ['land ceiling', 'ceiling act'],
  },
  far: {
    term: 'FAR — Floor Area Ratio',
    en: 'How much floor space you may build compared with the plot area. A higher FAR means more buildable area on the same land.',
    hi: 'प्लॉट के क्षेत्र की तुलना में कितना फर्श क्षेत्र बनाया जा सकता है।',
    why: 'It caps what you can construct, so it changes the economics of a plot even when the land rate looks cheap.',
    aliases: ['floor area ratio', 'fsi'],
  },
  conveyance: {
    term: 'Conveyance deed',
    en: 'The registered document that actually transfers ownership of the land.',
    hi: 'रजिस्टर्ड दस्तावेज़ जो ज़मीन का मालिकाना हक वास्तव में स्थानांतरित करता है।',
    why: 'An allotment letter or agreement to sell is not the same as conveyance — title is incomplete until this is registered.',
    aliases: ['sale deed', 'conveyance deed'],
  },
  'plot allotment': {
    term: 'Plot allotment',
    en: 'HSIIDC or HSVP offering a specific plot, usually by application or auction, subject to their terms.',
    hi: 'HSIIDC या HSVP द्वारा आवेदन या नीलामी से प्लॉट देना, उनकी शर्तों के साथ।',
    why: 'Allotted plots come with estate bylaws and timelines. Missing a condition can cost the allotment.',
    aliases: ['allotment letter', 'hsiidc allotment'],
  },
};

/** Suggested opening prompts for a first-time visitor, per language. */
const STARTER_PROMPTS = {
  en: [
    'I am new — how does this work?',
    'I have ₹2 crore, where should I look?',
    'What is a circle rate?',
    'Score this location for a factory',
  ],
  hi: [
    'मैं नया हूँ — यह कैसे काम करता है?',
    'मेरे पास 2 करोड़ हैं, कहाँ देखूँ?',
    'सर्कल रेट क्या होता है?',
    'इस जगह को फैक्ट्री के लिए जाँचें',
  ],
  hinglish: [
    'main naya hoon — ye kaise kaam karta hai?',
    '2 crore me kahan invest karun?',
    'circle rate kya hota hai?',
    'ye jagah factory ke liye kaisi hai?',
  ],
};

/** Terms the user appears to be asking about or may not know. */
function detectTerms(query) {
  const q = String(query || '').toLowerCase();
  const found = [];
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    const needles = [key, ...(entry.aliases || [])];
    if (needles.some((n) => q.includes(n))) found.push({ key, ...entry });
  }
  return found;
}

/**
 * Latin patterns can use `\b`; Devanagari cannot. JavaScript's `\b` is defined over ASCII word
 * characters, so `\bक्या\b` never matches — the boundary assertion fails on both sides. Devanagari
 * alternatives are therefore tested as plain substrings.
 */
const DEFINITION_LATIN =
  /\b(what is|what's|whats|meaning of|means|explain|define|kya hai|kya hota|kya matlab|matlab kya|samjhao)\b/;
const DEFINITION_DEVANAGARI = ['क्या है', 'क्या होता', 'क्या होता', 'मतलब', 'समझाओ', 'समझाइए', 'किसे कहते'];

const BEGINNER_LATIN =
  /\b(new here|i am new|i'm new|im new|beginner|first time|no idea|don't know|dont know|how does this work|help me start|naya hoon|naya hu|naya hun|nahi pata|kuch nahi pata|shuru|kaise shuru)\b/;
const BEGINNER_DEVANAGARI = ['नया हूँ', 'नया हूं', 'नयी हूँ', 'पता नहीं', 'शुरू', 'कैसे काम', 'कहाँ से शुरू'];

/** True when the turn reads like someone asking what something means. */
function isDefinitionQuestion(query) {
  const q = String(query || '').toLowerCase();
  if (DEFINITION_LATIN.test(q)) return true;
  return DEFINITION_DEVANAGARI.some((p) => q.includes(p));
}

/** True when the user signals they are new / needs orientation. */
function isBeginner(query, memory = {}) {
  const q = String(query || '').toLowerCase();
  const signals =
    BEGINNER_LATIN.test(q) || BEGINNER_DEVANAGARI.some((p) => q.includes(p));
  // Early turns with no established filters also behave like a first-time visit.
  const looksFresh = (memory.turnCount || 0) <= 1 && !memory?.state?.district;
  return signals || (looksFresh && isDefinitionQuestion(q));
}

function starterPrompts(language = 'en') {
  return STARTER_PROMPTS[language] || STARTER_PROMPTS.en;
}

/**
 * Glossary block for the prompt. Given to the model as authoritative wording so definitions
 * stay consistent and it does not improvise regulatory meanings.
 */
function renderGlossary(terms, language = 'en') {
  if (!terms?.length) return '';
  const lines = ['GLOSSARY (use this wording; do not invent legal definitions):'];
  for (const t of terms.slice(0, 4)) {
    const body = language === 'hi' ? t.hi : t.en;
    lines.push(`  ${t.term}: ${body} Why it matters: ${t.why}`);
  }
  return lines.join('\n');
}

module.exports = {
  GLOSSARY,
  detectTerms,
  isDefinitionQuestion,
  isBeginner,
  starterPrompts,
  renderGlossary,
};
