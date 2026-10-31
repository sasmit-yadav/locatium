/**
 * Hindi labels for everything the copilot shows besides its answer: action buttons,
 * confirm prompts, follow-up chips and the disclaimer.
 *
 * Follow-up chips keep their English text as the query that is sent back (the intent
 * matcher is tuned on it); only the visible label is translated, via `followUpLabels`.
 */

const ACTION_HI = {
  flyTo: { label: 'नक्शे पर दिखाएँ' },
  highlightOpportunities: { label: 'सबसे अच्छे विकल्प नक्शे पर दिखाएँ' },
  toggleLayer: { label: 'नक्शे की परत दिखाएँ' },
  openInvestor: { label: 'ज़मीन खोज खोलें' },
  openAnalysis: { label: 'विश्लेषण खोलें' },
  applyFilters: { label: 'ये फ़िल्टर लगाएँ' },
  compareZones: { label: 'साथ-साथ तुलना करें' },
  explainTerm: { label: 'इस शब्द का मतलब' },
  explainScore: { label: 'स्कोर कैसे बना?' },
  tour: { label: 'घुमाकर दिखाएँ' },
  downloadCsv: { label: 'सूची डाउनलोड करें (CSV)' },
  overlayFacilityGap: { label: 'अस्पताल/स्कूल की कमी दिखाएँ' },
  showLandBand: { label: 'ज़मीन की कीमत का दायरा दिखाएँ' },
  openFacilities: { label: 'पास की सुविधाएँ खोजें' },
  copyEmbed: { label: 'एम्बेड लिंक कॉपी करें' },
  openReports: { label: 'रिपोर्ट खोलें' },
  addToPipeline: { label: 'मेरी सूची में जोड़ें', confirm: 'यह जगह अपनी डील सूची में जोड़ें?' },
  addToPortfolio: { label: 'पोर्टफ़ोलियो में सेव करें', confirm: 'यह जगह अपने पोर्टफ़ोलियो में सेव करें?' },
  saveSearch: { label: 'यह खोज सेव करें', confirm: 'इन फ़िल्टर को नाम देकर सेव करें?' },
  createAlert: { label: 'बदलाव पर सूचना दें', confirm: 'मिलती-जुलती जगहें बदलने पर आपको ईमेल करें?' },
  generateReport: { label: 'PDF रिपोर्ट बनाएँ', confirm: 'इस जगह की PDF रिपोर्ट बनाएँ?' },
  emailReport: { label: 'यह रिपोर्ट मुझे ईमेल करें', confirm: 'यह रिपोर्ट आपके ईमेल पर भेजें?' },
};

const FOLLOW_UP_HI = {
  'What are the risks on #1?': '#1 के जोखिम क्या हैं?',
  'What are the risks here?': 'यहाँ जोखिम क्या हैं?',
  'Too expensive — show cheaper': 'बहुत महँगा — सस्ते विकल्प दिखाएँ',
  'Walk me through diligence': 'जाँच-पड़ताल के कदम बताइए',
  'Add #1 to pipeline': '#1 को सूची में जोड़ें',
  'Land price band here': 'यहाँ ज़मीन की कीमत का दायरा',
  'What is missing nearby — hospitals and schools?': 'पास में क्या कमी है — अस्पताल और स्कूल?',
  'Generate a PDF for #1': '#1 की PDF बनाएँ',
  'Score this site for industry': 'इस जगह को उद्योग के लिए स्कोर करें',
  'Best industrial in Gurugram under 5 crore': 'गुरुग्राम में 5 करोड़ से कम में सबसे अच्छी औद्योगिक जगह',
  'I am new — how does this work?': 'मैं नया हूँ — यह कैसे काम करता है?',
  'What should I do after I like a zone?': 'कोई इलाका पसंद आने के बाद क्या करूँ?',
};

const DISCLAIMER = {
  en: 'Grounded on live LOCATIUM data — verify on the map and official sources before decisions.',
  hi: 'LOCATIUM के लाइव डेटा पर आधारित — फ़ैसले से पहले नक्शे और सरकारी स्रोतों पर ज़रूर जाँचें।',
};

function localizeAction(action, lang) {
  if (lang !== 'hi' || !action) return action;
  const hi = ACTION_HI[action.type];
  if (!hi) return action;
  const name = action.params?.name;
  const label = action.type === 'flyTo' && name && name !== 'Selected site' ? `${name} नक्शे पर दिखाएँ` : hi.label;
  return { ...action, label, confirm: action.confirm ? hi.confirm || action.confirm : action.confirm, confirmLabel: 'पक्का करें' };
}

/** Adds Hindi display text to a copilot turn without changing what the chips send. */
function localizeTurn(envelope, lang) {
  if (!envelope || lang !== 'hi') return envelope;
  const followUps = Array.isArray(envelope.followUps) ? envelope.followUps : [];
  return {
    ...envelope,
    disclaimer: DISCLAIMER.hi,
    mapActions: (envelope.mapActions || []).map((a) => localizeAction(a, lang)),
    actionProposals: (envelope.actionProposals || []).map((a) => localizeAction(a, lang)),
    followUpLabels: followUps.map((f) => FOLLOW_UP_HI[f] || f),
  };
}

module.exports = { localizeTurn, localizeAction, DISCLAIMER, ACTION_HI, FOLLOW_UP_HI };
