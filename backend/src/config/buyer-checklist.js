/**
 * "Verify before you buy" — the checks a first-time buyer in Haryana should make before
 * paying anything, each with the official portal where it can be done. Bilingual, so the
 * same list feeds the web page and the English/Hindi PDF.
 */
module.exports = [
  {
    key: 'jamabandi',
    en: { title: 'Check the owner in the land record (Jamabandi)', detail: 'Search the village and khasra number. The seller’s name must match the record, and note any loan or court case marked on it.' },
    hi: { title: 'ज़मीन के रिकॉर्ड (जमाबंदी) में मालिक जाँचें', detail: 'गाँव और खसरा नंबर से खोजें। बेचने वाले का नाम रिकॉर्ड से मेल खाना चाहिए; उस पर दर्ज कर्ज़ या केस भी देखें।' },
    url: 'https://jamabandi.nic.in',
    portal: 'Jamabandi (Revenue Dept.)',
  },
  {
    key: 'mutation',
    en: { title: 'Confirm the latest mutation (intkal)', detail: 'The last sale or inheritance must already be entered. An unrecorded transfer is a common source of disputes.' },
    hi: { title: 'आखिरी इंतकाल (म्यूटेशन) की पुष्टि करें', detail: 'पिछली बिक्री या विरासत रिकॉर्ड में दर्ज होनी चाहिए। बिना दर्ज हस्तांतरण अक्सर विवाद की वजह बनता है।' },
    url: 'https://jamabandi.nic.in',
    portal: 'Jamabandi (Revenue Dept.)',
  },
  {
    key: 'encumbrance',
    en: { title: 'Look for loans or past sales on the land', detail: 'Ask the sub-registrar for past registered deeds on this property, and ask the seller for a bank no-dues letter if it was mortgaged.' },
    hi: { title: 'ज़मीन पर कर्ज़ या पुरानी बिक्री देखें', detail: 'सब-रजिस्ट्रार से इस संपत्ति की पुरानी रजिस्ट्री निकलवाएँ; गिरवी रही हो तो बैंक से नो-ड्यूज़ पत्र माँगें।' },
    url: 'https://igrharyana.gov.in',
    portal: 'IGR Haryana (Registration)',
  },
  {
    key: 'landuse',
    en: { title: 'Check what the land may be used for', detail: 'Find the plot on the development plan. Building a factory, shop or houses on farm land needs CLU (Change of Land Use) approval first.' },
    hi: { title: 'देखें ज़मीन किस काम के लिए इस्तेमाल हो सकती है', detail: 'डेवलपमेंट प्लान में प्लॉट देखें। खेती की ज़मीन पर फैक्ट्री, दुकान या मकान के लिए पहले CLU की मंज़ूरी ज़रूरी है।' },
    url: 'https://tcpharyana.gov.in',
    portal: 'Town & Country Planning (DTCP)',
  },
  {
    key: 'rera',
    en: { title: 'If buying from a builder or colony, check RERA', detail: 'The project and the developer should be registered. Check the approved layout, licence and completion dates.' },
    hi: { title: 'बिल्डर या कॉलोनी से खरीद रहे हैं तो RERA जाँचें', detail: 'प्रोजेक्ट और डेवलपर रजिस्टर्ड होने चाहिए। स्वीकृत नक्शा, लाइसेंस और पूरा होने की तारीख देखें।' },
    url: 'https://haryanarera.gov.in',
    portal: 'Haryana RERA',
  },
  {
    key: 'allotment',
    en: { title: 'For HSIIDC / HSVP plots, confirm the allotment', detail: 'Industrial and sector plots are allotted by the state. Check the allotment letter, transfer permission and any dues with the authority.' },
    hi: { title: 'HSIIDC / HSVP प्लॉट हो तो आवंटन की पुष्टि करें', detail: 'औद्योगिक और सेक्टर प्लॉट सरकार आवंटित करती है। आवंटन पत्र, ट्रांसफर की अनुमति और बकाया राशि संस्था से जाँचें।' },
    url: 'https://hsiidc.org.in',
    portal: 'HSIIDC / HSVP',
  },
  {
    key: 'site',
    en: { title: 'Visit the site and measure it', detail: 'Match the boundaries with the record (a demarcation by the patwari settles doubts), check road access, water, power lines and any flooding signs.' },
    hi: { title: 'मौके पर जाकर नाप-जोख करें', detail: 'सीमाएँ रिकॉर्ड से मिलाएँ (शक हो तो पटवारी से निशानदेही कराएँ), सड़क, पानी, बिजली लाइन और जलभराव के निशान देखें।' },
    url: null,
    portal: null,
  },
  {
    key: 'circle',
    en: { title: 'Compare the price with the circle rate', detail: 'Stamp duty is charged on the higher of your price and the circle rate. A price far above it needs a reason; a deal below it cannot be registered at that value.' },
    hi: { title: 'कीमत को सर्कल रेट से मिलाएँ', detail: 'स्टांप ड्यूटी आपकी कीमत और सर्कल रेट में से जो ज़्यादा हो, उस पर लगती है। बहुत ज़्यादा कीमत की वजह पूछें; सर्कल रेट से कम पर रजिस्ट्री नहीं होती।' },
    url: 'https://igrharyana.gov.in',
    portal: 'IGR Haryana (Registration)',
  },
  {
    key: 'lawyer',
    en: { title: 'Get a property lawyer to check the papers', detail: 'Before paying any token money, have a lawyer read the title chain (at least the last 30 years) and draft the agreement.' },
    hi: { title: 'कागज़ात किसी प्रॉपर्टी वकील से जाँच कराएँ', detail: 'कोई भी बयाना देने से पहले वकील से मालिकाना हक़ की पूरी कड़ी (कम से कम 30 साल) पढ़वाएँ और एग्रीमेंट बनवाएँ।' },
    url: null,
    portal: null,
  },
];
