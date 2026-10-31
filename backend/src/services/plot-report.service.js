/**
 * One-page "Check my plot" PDF in English or Hindi, built from buildPlotSummary().
 * Noto Sans / Noto Sans Devanagari are bundled (OFL licence) so Hindi shapes correctly.
 */
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONTS = {
  en: { regular: path.join(FONT_DIR, 'NotoSans-Regular.ttf'), bold: path.join(FONT_DIR, 'NotoSans-Bold.ttf') },
  hi: {
    regular: path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
    bold: path.join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'),
  },
};

const LABELS = {
  en: {
    title: 'Check my plot',
    subtitle: 'Plain-language land check · LOCATIUM',
    location: 'Location',
    score: 'Overall score',
    good: 'What is good here',
    watch: 'Watch out for',
    land: 'Land price',
    source: 'Source',
    verify: 'Verify current rates at',
    cost: 'Estimated total cost',
    costFor: (a) => `For ${a} sq yd`,
    lines: { land: 'Land', stampDuty: 'Stamp duty', registration: 'Registration fee', legal: 'Lawyer / paperwork', brokerage: 'Broker fee' },
    total: 'Total',
    emi: (e, y) => `Loan EMI about ${e} per month for ${y} years`,
    checklist: 'Before you pay anything — check these',
    none: 'Nothing notable found.',
    disclaimer:
      'LOCATIUM is a screening tool, not legal or investment advice. Figures come from official map layers and published circle rates and can be out of date. Always verify the land record, title and approvals with the authorities and a lawyer before buying.',
    generated: 'Generated',
  },
  hi: {
    title: 'प्लॉट जाँच रिपोर्ट',
    subtitle: 'आसान भाषा में ज़मीन की जाँच · LOCATIUM',
    location: 'जगह',
    score: 'कुल स्कोर',
    good: 'यहाँ क्या अच्छा है',
    watch: 'इन बातों का ध्यान रखें',
    land: 'ज़मीन की कीमत',
    source: 'स्रोत',
    verify: 'मौजूदा दरें यहाँ जाँचें',
    cost: 'अनुमानित कुल खर्च',
    costFor: (a) => `${a} वर्ग गज़ के लिए`,
    lines: { land: 'ज़मीन', stampDuty: 'स्टांप ड्यूटी', registration: 'रजिस्ट्री फीस', legal: 'वकील / कागज़ी काम', brokerage: 'ब्रोकर फीस' },
    total: 'कुल',
    emi: (e, y) => `लोन की EMI लगभग ${e} प्रति माह, ${y} साल के लिए`,
    checklist: 'कोई भी पैसा देने से पहले — ये जाँचें',
    none: 'कोई खास बात नहीं मिली।',
    disclaimer:
      'LOCATIUM एक शुरुआती जाँच का साधन है, कानूनी या निवेश सलाह नहीं। आँकड़े सरकारी नक्शों और प्रकाशित सर्कल रेट से हैं और पुराने हो सकते हैं। खरीदने से पहले ज़मीन का रिकॉर्ड, मालिकाना हक़ और मंज़ूरियाँ सरकारी दफ़्तर और वकील से ज़रूर जाँचें।',
    generated: 'बनाई गई',
  },
};

const COLORS = { ink: '#0F172A', muted: '#475569', accent: '#2563EB', good: '#15803D', watch: '#B45309', weak: '#B91C1C', line: '#E2E8F0', soft: '#F1F5F9' };
const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

function renderPlotReport(summary, { cost = null, place = null } = {}) {
  const L = summary.lang === 'hi' ? 'hi' : 'en';
  const lab = LABELS[L];
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `LOCATIUM — ${lab.title}` } });
  doc.registerFont('r', FONTS[L].regular);
  doc.registerFont('b', FONTS[L].bold);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 80;
  const left = 40;
  const ensure = (h) => {
    if (doc.y + h > doc.page.height - 60) doc.addPage();
  };
  const heading = (text, color = COLORS.ink) => {
    ensure(40);
    doc.moveDown(0.6).font('b').fontSize(12.5).fillColor(color).text(text, left, doc.y, { width: W });
    doc.moveDown(0.2);
  };
  const bullets = (items, color) => {
    if (!items.length) {
      doc.font('r').fontSize(10).fillColor(COLORS.muted).text(lab.none, left + 12, doc.y, { width: W - 12 });
      return;
    }
    for (const item of items) {
      ensure(22);
      const y = doc.y;
      doc.circle(left + 4, y + 7, 2.4).fill(color);
      doc.font('r').fontSize(10.5).fillColor(COLORS.ink).text(item, left + 14, y, { width: W - 14 });
      doc.moveDown(0.25);
    }
  };

  // Header band
  doc.rect(0, 0, doc.page.width, 78).fill(COLORS.accent);
  doc.font('b').fontSize(20).fillColor('#FFFFFF').text(lab.title, left, 22, { width: W });
  doc.font('r').fontSize(10).fillColor('#DBEAFE').text(lab.subtitle, left, 50, { width: W });
  doc.y = 96;

  // Location + score card
  const loc = summary.location || {};
  const district = summary.land?.district;
  const sameDistrict = (a, b) => {
    const norm = (x) => String(x || '').toLowerCase().replace('gurgaon', 'gurugram');
    return norm(a).includes(norm(b));
  };
  const placeLine = place ? (district && !sameDistrict(place, district) ? `${place} · ${district}` : place) : district;
  const cardTop = doc.y;
  doc.roundedRect(left, cardTop, W, 74, 8).fill(COLORS.soft);
  doc.font('r').fontSize(9).fillColor(COLORS.muted).text(lab.location, left + 14, cardTop + 12);
  doc.font('b').fontSize(12).fillColor(COLORS.ink).text(placeLine || `${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}`, left + 14, cardTop + 26, { width: W - 160 });
  doc.font('r').fontSize(9).fillColor(COLORS.muted).text(`${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}`, left + 14, cardTop + 46);
  const tone = summary.scoreWord === 'good' ? COLORS.good : summary.scoreWord === 'average' ? COLORS.watch : COLORS.weak;
  doc.font('r').fontSize(9).fillColor(COLORS.muted).text(lab.score, left + W - 140, cardTop + 12, { width: 126, align: 'right' });
  doc.font('b').fontSize(22).fillColor(tone).text(`${summary.score ?? '—'}/100`, left + W - 140, cardTop + 24, { width: 126, align: 'right' });
  doc.font('b').fontSize(10).fillColor(tone).text(summary.scoreLabel || '', left + W - 140, cardTop + 52, { width: 126, align: 'right' });
  doc.y = cardTop + 86;
  if (summary.headline) doc.font('b').fontSize(14).fillColor(COLORS.ink).text(summary.headline, left, doc.y, { width: W });

  heading(lab.good, COLORS.good);
  bullets(summary.good || [], COLORS.good);
  heading(lab.watch, COLORS.watch);
  bullets(summary.watch || [], COLORS.watch);

  heading(lab.land);
  bullets(summary.land?.lines || [], COLORS.accent);
  if (summary.land?.source) {
    const s = summary.land.source;
    doc.font('r').fontSize(9).fillColor(COLORS.muted).text(
      `${lab.source}: ${s.label}${s.district ? ` — ${s.district}` : ''}${s.effectiveFrom ? ` (${s.effectiveFrom})` : ''}. ${lab.verify} ${s.verifyUrl}`,
      left + 14,
      doc.y,
      { width: W - 14 }
    );
  }

  if (cost) {
    heading(`${lab.cost} — ${lab.costFor(Math.round(cost.areaSqYd).toLocaleString('en-IN'))}`);
    for (const line of cost.lines) {
      ensure(18);
      const y = doc.y;
      doc.font('r').fontSize(10.5).fillColor(COLORS.ink).text(lab.lines[line.key] || line.key, left + 14, y, { width: W / 2 });
      doc.text(inr(line.amount), left + W / 2, y, { width: W / 2 - 4, align: 'right' });
      doc.moveDown(0.15);
    }
    ensure(22);
    doc.moveTo(left + 14, doc.y).lineTo(left + W, doc.y).strokeColor(COLORS.line).stroke();
    const y = doc.y + 4;
    doc.font('b').fontSize(11.5).fillColor(COLORS.ink).text(lab.total, left + 14, y, { width: W / 2 });
    doc.text(inr(cost.total), left + W / 2, y, { width: W / 2 - 4, align: 'right' });
    if (cost.loan) {
      doc.moveDown(0.3).font('r').fontSize(9.5).fillColor(COLORS.muted).text(lab.emi(inr(cost.loan.emi), cost.loan.tenureYears), left + 14, doc.y, { width: W - 14 });
    }
  }

  heading(lab.checklist);
  (summary.checklist || []).forEach((item, i) => {
    ensure(40);
    const y = doc.y;
    doc.font('b').fontSize(10.5).fillColor(COLORS.accent).text(`${i + 1}.`, left, y, { width: 16 });
    doc.font('b').fontSize(10.5).fillColor(COLORS.ink).text(item.title, left + 18, y, { width: W - 18 });
    doc.font('r').fontSize(9.5).fillColor(COLORS.muted).text(item.detail + (item.url ? `  ${item.url}` : ''), left + 18, doc.y, { width: W - 18 });
    doc.moveDown(0.35);
  });

  ensure(70);
  doc.moveDown(0.8).font('r').fontSize(8.5).fillColor(COLORS.muted).text(lab.disclaimer, left, doc.y, { width: W });
  doc.moveDown(0.3).text(`${lab.generated}: ${new Date().toISOString().slice(0, 10)} · locatium`, left, doc.y, { width: W });

  doc.end();
  return done;
}

module.exports = { renderPlotReport, LABELS };
