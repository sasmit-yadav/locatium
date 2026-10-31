import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFloatingPanel } from './copilot/useFloatingPanel';
import { useLangStore, useT } from '../i18n';
import { usePrefersReducedMotion } from '../design-system/usePrefersReducedMotion';
import {
  MessageCircle,
  Send,
  X,
  MapPin,
  Sparkles,
  Loader2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Languages,
  BookOpen,
  Check,
} from 'lucide-react';
import { askLocatiumStream, confirmAssistantAction, clearAssistantMemory, getAssistantMemory } from '../services/assistant';
import { getFacilityGap, getLandForecast } from '../services/analysis';
import {
  startRecording,
  transcribeAudio,
  isRecordingSupported,
  speak,
  stopSpeaking,
  isSpeechSupported,
} from '../services/voice';
import { useDashboardStore } from '../stores/useDashboardStore';
import { InlineMarkdown } from './ui/InlineMarkdown';
import { downloadInvestorReportById } from '../services/investor';

// Ordered for a first-time visitor: orientation, then budget, then vocabulary, then analysis.
const GREETING = {
  en: "Hi — I'm sitting on this Haryana map with you. Never bought land before? Ask in plain words. Type or tap the mic, in English, हिंदी or Hinglish. Click a spot, or say what you want — I'll score it, flag risks, walk next steps, and actually save or email a report when you tap Confirm.",
  hi: 'नमस्ते — मैं इस हरियाणा नक्शे पर आपके साथ हूँ। पहली बार ज़मीन खरीद रहे हैं? आसान शब्दों में पूछिए — लिखकर या माइक दबाकर, हिंदी, English या Hinglish में। नक्शे पर कोई जगह चुनें या बताएँ क्या चाहिए — मैं स्कोर बताऊँगा, जोखिम दिखाऊँगा, अगले कदम समझाऊँगा, और Confirm दबाने पर रिपोर्ट सेव या ईमेल भी करूँगा।',
};
const FRESH_START = {
  en: 'Fresh start. What should we look at — a pin on the map, a district shortlist, or land ₹?',
  hi: 'नई शुरुआत। क्या देखें — नक्शे पर कोई जगह, किसी ज़िले के विकल्प, या ज़मीन की कीमत?',
};
/** Hindi display text for the starter chips; the English text is what gets sent. */
const STARTER_LABELS_HI = {
  'I am new — how does this work?': 'मैं नया हूँ — यह कैसे काम करता है?',
  'I have ₹2 crore, where should I look?': 'मेरे पास ₹2 करोड़ हैं, कहाँ देखूँ?',
  'What is a circle rate?': 'सर्कल रेट क्या होता है?',
  'ye jagah industrial ke liye kaisi hai?': 'ये जगह फैक्ट्री के लिए कैसी है?',
  'What should I do after I like a zone?': 'कोई इलाका पसंद आने के बाद क्या करूँ?',
  'gurgaon me best warehouse under 5 cr': 'गुड़गाँव में 5 करोड़ से कम में सबसे अच्छा गोदाम',
};
const starterLabels = (lang, chips) => (lang === 'hi' ? chips.map((c) => STARTER_LABELS_HI[c] || c) : null);

const STARTER_CHIPS = [
  'I am new — how does this work?',
  'I have ₹2 crore, where should I look?',
  'What is a circle rate?',
  'ye jagah industrial ke liye kaisi hai?',
  'What should I do after I like a zone?',
  'सर्कल रेट क्या होता है?',
  'gurgaon me best warehouse under 5 cr',
];

function MethodChip({ method }) {
  if (!method) return null;
  const map = {
    llm: 'AI copilot · grounded',
    llm_cached: 'AI copilot · cached',
    rule_based: 'Live data copilot',
    rule_based_fallback: 'Data fallback',
    rule_based_guardrail: 'Verified data only',
    clarify: 'Need a detail',
    error: 'Error',
  };
  return (
    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ds-text-tertiary">
      {map[method] || method}
    </span>
  );
}

function ScoreCard({ scored }) {
  if (!scored?.overallScore && scored?.overallScore !== 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-2 text-[11px]">
      <div>
        <div className="text-ds-text-tertiary">Score</div>
        <div className="text-base font-semibold text-ds-accent">{scored.overallScore}/100</div>
      </div>
      <div>
        <div className="text-ds-text-tertiary">Verdict</div>
        <div className="font-medium text-ds-text-primary">{scored.verdict || '—'}</div>
      </div>
      {scored.landValue?.estimatedPerSqYardInr ? (
        <div className="col-span-2">
          <div className="text-ds-text-tertiary">Est. land</div>
          <div className="font-medium">
            ₹{Number(scored.landValue.estimatedPerSqYardInr).toLocaleString('en-IN')}/sq yd
            {scored.landValue.circleRatePerSqYardInr
              ? ` · floor ₹${Number(scored.landValue.circleRatePerSqYardInr).toLocaleString('en-IN')}`
              : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OppList({ opportunities, onFly }) {
  if (!opportunities?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {opportunities.slice(0, 4).map((z, i) => (
        <button
          key={z.id || i}
          type="button"
          onClick={() =>
            onFly?.({
              type: 'flyTo',
              lng: z.center?.lng,
              lat: z.center?.lat,
              zoom: 12,
              name: z.name,
              zoneId: z.id,
              label: z.name,
            })
          }
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-2 py-1.5 text-left text-[11px] hover:border-ds-accent"
        >
          <span className="min-w-0 truncate font-medium text-ds-text-primary">
            {i + 1}. {z.name}
            <span className="font-normal text-ds-text-tertiary"> · {z.district}</span>
          </span>
          <span className="shrink-0 tabular-nums text-ds-accent">{z.opportunityScore}</span>
        </button>
      ))}
    </div>
  );
}

export function AskLocatiumWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const t = useT();
  const leftCollapsedForLayout = useDashboardStore((s) => s.leftCollapsed);
  const rightCollapsedForLayout = useDashboardStore((s) => s.rightCollapsed);
  // Re-measure the map area whenever a side panel opens or closes.
  const panel = useFloatingPanel({ open, deps: [leftCollapsedForLayout, rightCollapsedForLayout, expanded] });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [session, setSession] = useState({});
  const siteLang = useLangStore.getState().lang;
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      text: GREETING[siteLang] || GREETING.en,
      method: null,
      actions: [],
      followUps: STARTER_CHIPS.slice(0, 4),
      followUpLabels: starterLabels(siteLang, STARTER_CHIPS.slice(0, 4)),
    },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const recorderRef = useRef(null);

  // Voice + language state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speakingNow, setSpeakingNow] = useState(false);
  // Follows the site language when Hindi is chosen; "auto" otherwise mirrors how you write.
  const [langPref, setLangPref] = useState(() => (siteLang === 'hi' ? 'hi' : 'auto')); // auto | en | hi
  const [voiceError, setVoiceError] = useState('');
  const canRecord = isRecordingSupported();
  const canSpeak = isSpeechSupported();

  const selectedLocation = useDashboardStore((s) => s.selectedLocation);
  const selectionIsExplicit = useDashboardStore((s) => s.selectionIsExplicit);
  const view = useDashboardStore((s) => s.view);
  const flyTo = useDashboardStore((s) => s.flyTo);
  const setInvestorHighlights = useDashboardStore((s) => s.setInvestorHighlights);
  const setActiveInspectorTab = useDashboardStore((s) => s.setActiveInspectorTab);
  const setActiveLeftTab = useDashboardStore((s) => s.setActiveLeftTab);
  const setCommandPaletteOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const toggleLayer = useDashboardStore((s) => s.toggleLayer);
  const toggleRight = useDashboardStore((s) => s.toggleRight);
  const rightCollapsed = useDashboardStore((s) => s.rightCollapsed);
  const setAnalysisOverlay = useDashboardStore((s) => s.setAnalysisOverlay);
  const activateWorkspace = useDashboardStore((s) => s.activateWorkspace);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener('locatium:open-assistant', onOpen);
    return () => window.removeEventListener('locatium:open-assistant', onOpen);
  }, []);

  useEffect(() => {
    getAssistantMemory()
      .then((data) => {
        if (data?.session && Object.keys(data.session).length) setSession(data.session);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, busy]);

  function runAction(action) {
    if (!action) return;
    const params = action.params || action;
    if (action.type === 'flyTo' && params.lng != null && params.lat != null) {
      flyTo({
        lng: params.lng,
        lat: params.lat,
        zoom: params.zoom || 12,
        name: params.name || 'Copilot suggestion',
        type: 'Ask LOCATIUM',
        feature: params.zoneId ? { investorZoneId: params.zoneId, id: params.zoneId } : null,
      });
    }
    if (action.type === 'highlightOpportunities' && params.highlights?.length) {
      setInvestorHighlights(params.highlights);
    }
    if (action.type === 'openInvestor' || action.type === 'openAnalysis') {
      if (rightCollapsed) toggleRight();
      setActiveInspectorTab(action.type === 'openInvestor' ? 'investor' : 'analysis');
    }
    if (action.type === 'toggleLayer' && params.layerId) {
      toggleLayer(params.layerId, params.visible !== false);
      setActiveLeftTab('layers');
    }
    if (action.type === 'applyFilters') {
      window.dispatchEvent(new CustomEvent('locatium:apply-investor-filters', { detail: params }));
      if (rightCollapsed) toggleRight();
      setActiveInspectorTab('investor');
    }
    if (action.type === 'compareZones') {
      window.dispatchEvent(new CustomEvent('locatium:compare-zones', { detail: params.zoneIds || [] }));
      if (rightCollapsed) toggleRight();
      setActiveInspectorTab('investor');
    }
    if (action.type === 'explainTerm' && params.term) submit(`Explain ${params.term} in simple words.`);
    if (action.type === 'explainScore') {
      if (rightCollapsed) toggleRight();
      setActiveInspectorTab('analysis');
    }
    if (action.type === 'startTour') {
      setOpen(false);
      setActiveLeftTab('layers');
      setCommandPaletteOpen(true);
    }
    if (action.type === 'downloadCsv') {
      const ids = new Set(params.zoneIds || []);
      const rows = messages
        .flatMap((message) => message.opportunities || [])
        .filter((zone) => !ids.size || ids.has(zone.id));
      const csvRows = [
        ['Zone', 'District', 'Opportunity score', 'Zone ID'],
        ...rows.map((zone) => [zone.name, zone.district, zone.opportunityScore, zone.id]),
      ];
      const csv = csvRows
        .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
        .join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'locatium-shortlist.csv';
      link.click();
      URL.revokeObjectURL(url);
    }
    if (action.type === 'overlayFacilityGap') {
      getFacilityGap({ district: params.district, limit: 400 })
        .then((data) => {
          setAnalysisOverlay(data);
          toggleLayer('hospitals', true);
          setActiveLeftTab('layers');
        })
        .catch(() => {});
    }
    if (action.type === 'showLandBand') {
      if (params.lng != null && params.lat != null) {
        flyTo({
          lng: params.lng,
          lat: params.lat,
          zoom: params.zoom || 13,
          name: 'Land-price band',
          type: 'Ask LOCATIUM',
          feature: params.zoneId ? { investorZoneId: params.zoneId, id: params.zoneId } : null,
        });
      }
      getLandForecast({
        lat: params.lat,
        lng: params.lng,
        sector: params.sector || 'industrial',
        zoneId: params.zoneId,
      })
        .then((band) => {
          window.dispatchEvent(new CustomEvent('locatium:land-forecast', { detail: band }));
          if (rightCollapsed) toggleRight();
          setActiveInspectorTab('analysis');
        })
        .catch(() => {
          if (rightCollapsed) toggleRight();
          setActiveInspectorTab('analysis');
        });
    }
    if (action.type === 'openFacilities') {
      window.dispatchEvent(new CustomEvent('locatium:open-facility-finder'));
    }
    if (action.type === 'copyEmbed' && params.zoneId) {
      const url = `${window.location.origin}/embed/${encodeURIComponent(params.zoneId)}`;
      navigator.clipboard?.writeText(url).catch(() => {});
    }
    if (action.type === 'openReports') {
      activateWorkspace('reports');
    }
  }

  /**
   * Mutating actions run only after this click. The server still requires `confirmed: true`.
   */
  /** Fetches a generated report with the visitor's token and hands it to the browser as a file. */
  async function downloadReport(reportId, msgIdx) {
    try {
      const { blob, filename } = await downloadInvestorReportById(reportId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const m = next[msgIdx];
        if (!m) return prev;
        next[msgIdx] = { ...m, actionNote: `Download failed: ${err.message}. Try Reports in the top bar.` };
        return next;
      });
    }
  }

  async function runProposal(proposal, msgIdx) {
    setMessages((prev) => {
      const next = [...prev];
      const m = next[msgIdx];
      if (!m) return prev;
      next[msgIdx] = { ...m, actionNote: 'Working…' };
      return next;
    });

    try {
      const result = await confirmAssistantAction(proposal);
      if (proposal.type === 'generateReport' || proposal.type === 'emailReport' || proposal.type === 'addToPipeline') {
        if (rightCollapsed) toggleRight();
        setActiveInspectorTab('investor');
      }
      setMessages((prev) => {
        const next = [...prev];
        const m = next[msgIdx];
        if (!m) return prev;
        next[msgIdx] = {
          ...m,
          proposals: (m.proposals || []).filter((p) => p.type !== proposal.type),
          actionNote: result.message || 'Done.',
          actionReport:
            proposal.type === 'generateReport' && result.result?.reportId
              ? { id: result.result.reportId, filename: result.result.filename }
              : m.actionReport,
        };
        return next;
      });
      // A generated report downloads straight away; the button below lets the visitor fetch it again.
      if (proposal.type === 'generateReport' && result.result?.reportId) {
        downloadReport(result.result.reportId, msgIdx);
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const m = next[msgIdx];
        if (!m) return prev;
        next[msgIdx] = { ...m, actionNote: err.message || 'Could not complete that action.' };
        return next;
      });
    }
  }

  // Stop any narration when the widget closes or unmounts — audio must never outlive the UI.
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);
  useEffect(() => () => stopSpeaking(), []);

  async function toggleRecording() {
    setVoiceError('');
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      if (!rec) return;
      setTranscribing(true);
      try {
        const blob = await rec.stop();
        const result = await transcribeAudio(blob, {
          language: langPref === 'auto' ? undefined : langPref,
        });
        const text = String(result.text || '').trim();
        if (!text) {
          setVoiceError('Did not catch that — try again.');
          return;
        }
        // Send straight through: for a voice user, transcribe-then-ask should feel like one action.
        submit(text);
      } catch (err) {
        setVoiceError(err.message);
      } finally {
        setTranscribing(false);
      }
      return;
    }

    try {
      stopSpeaking();
      recorderRef.current = await startRecording();
      setRecording(true);
    } catch (err) {
      setVoiceError(err.message);
      setRecording(false);
    }
  }

  function narrate(text, locale) {
    if (!speakReplies || !canSpeak || !text) return;
    speak(text, {
      locale: locale || 'en-IN',
      onStart: () => setSpeakingNow(true),
      onEnd: () => setSpeakingNow(false),
      onError: (e) => {
        setSpeakingNow(false);
        setVoiceError(e.message);
      },
    });
  }

  function resetChat() {
    stopSpeaking();
    setSession({});
    clearAssistantMemory().catch(() => {});
    setMessages([
      {
        role: 'assistant',
        text: FRESH_START[useLangStore.getState().lang] || FRESH_START.en,
        method: null,
        actions: [],
        followUps: STARTER_CHIPS.slice(0, 4),
        followUpLabels: starterLabels(useLangStore.getState().lang, STARTER_CHIPS.slice(0, 4)),
      },
    ]);
  }

  const PHASE_LABELS = {
    understanding: 'Understanding your ask…',
    rewritten: 'Resolving what you referred to…',
    grounded: 'Reading live scores & rates…',
    stream_interrupted: 'Connection hiccup — finishing up…',
  };

  async function submit(text) {
    const query = String(text || input).trim();
    if (!query || busy) return;

    const confirmLike =
      /^(yes|yep|yeah|ok|okay|do it|go ahead|please do|add it|save it|email it|haan|ha|kar do|theek hai|ok kar do)(?:\s+(?:add it|save it|email it|do it|please|kar do))?[.!?]*$/i;
    if (confirmLike.test(query)) {
      let lastIdx = -1;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'assistant' && messages[i].proposals?.length) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx >= 0) {
        const proposals = messages[lastIdx].proposals;
        const q = query.toLowerCase();
        const picked =
          (/email/.test(q) && proposals.find((p) => p.type === 'emailReport')) ||
          (/\b(report|pdf)\b/.test(q) && proposals.find((p) => p.type === 'generateReport')) ||
          (/\b(add|pipeline|save)\b/.test(q) && proposals.find((p) => p.type === 'addToPipeline')) ||
          proposals[0];
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', text: query }]);
        await runProposal(picked, lastIdx);
        return;
      }
    }

    setInput('');
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));

    // Append the user turn plus an empty assistant turn that tokens stream into.
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: query },
      { role: 'assistant', text: '', streaming: true, actions: [], followUps: [] },
    ]);
    setBusy(true);
    setPhase(PHASE_LABELS.understanding);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    // Update the trailing assistant message in place as the stream arrives.
    const patchLast = (patch) => {
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === 'assistant') {
            next[i] = { ...next[i], ...(typeof patch === 'function' ? patch(next[i]) : patch) };
            break;
          }
        }
        return next;
      });
    };

    try {
      const lat = selectionIsExplicit ? selectedLocation?.lat : view?.lat;
      const lng = selectionIsExplicit ? selectedLocation?.lng : view?.lng;

      await askLocatiumStream(
        {
          query,
          lat,
          lng,
          sector: session?.state?.sector || 'industrial',
          district: session?.state?.district,
          history,
          session,
          language: langPref === 'auto' ? undefined : langPref,
        },
        {
          signal: abortRef.current.signal,
          onStatus: (phase) => setPhase(PHASE_LABELS[phase] || 'Working…'),
          onMeta: (meta) => {
            // Cards, map actions and chips can render before the prose finishes.
            patchLast({
              method: meta.method,
              disclaimer: meta.disclaimer,
              actions: meta.mapActions || [],
              opportunities: meta.opportunities || [],
              scoredLocation: meta.scoredLocation,
              intents: meta.intents,
              resolvedReferences: meta.resolvedReferences,
            });
            const hl = meta.mapActions?.find((a) => a.type === 'highlightOpportunities');
            if (hl?.params?.highlights?.length) setInvestorHighlights(hl.params.highlights);
          },
          onToken: (chunk) => {
            setPhase('');
            patchLast((cur) => ({ text: (cur.text || '') + chunk }));
          },
          onGuardrail: (g) => {
            // Streamed text contained a figure we could not verify — show the verified version.
            patchLast({
              text: g.replacement,
              guardrailNote: g.message,
              method: 'rule_based_guardrail',
            });
          },
          onFinal: (final) => {
            if (final.session) setSession(final.session);
            patchLast({
              text: final.answer,
              method: final.method,
              disclaimer: final.disclaimer,
              actions: final.mapActions || [],
              proposals: final.actionProposals || [],
              followUps: final.beginner?.isNew && final.beginner.starters?.length
                ? final.beginner.starters
                : final.followUps || [],
              followUpLabels: final.beginner?.isNew && final.beginner.starters?.length ? null : final.followUpLabels || null,
              opportunities: final.opportunities || [],
              scoredLocation: final.scoredLocation,
              intents: final.intents,
              terms: final.beginner?.terms || [],
              streaming: false,
              partial: final.contextSummary?.partial,
              elapsedMs: final.elapsedMs,
            });
            narrate(final.answer, final.language?.speechLocale);
          },
        }
      );
    } catch (err) {
      if (err.name === 'AbortError') {
        patchLast({ streaming: false });
        return;
      }
      patchLast({
        text: `Couldn’t reach the copilot — ${err.message}. Try again, or use Investor filters on the right.`,
        method: 'error',
        streaming: false,
        followUps: STARTER_CHIPS.slice(0, 3),
      });
    } finally {
      setBusy(false);
      setPhase('');
    }
  }

  const pinLabel =
    selectionIsExplicit && selectedLocation?.name
      ? selectedLocation.name
      : t('copilot.noPin');

  const shellBase =
    'pointer-events-auto fixed flex flex-col overflow-hidden border border-ds-border-default bg-ds-surface-raised shadow-2xl shadow-black/20';
  let shellClass;
  let shellStyle;
  if (expanded) {
    shellClass = `${shellBase} inset-3 z-[1200] rounded-2xl`;
    shellStyle = undefined;
  } else if (panel.compact) {
    // Phones: a bottom sheet that leaves the top of the map visible.
    shellClass = `${shellBase} inset-x-0 bottom-0 z-[1200] h-[78vh] rounded-t-2xl`;
    shellStyle = undefined;
  } else {
    shellClass = `${shellBase} z-[1100] rounded-2xl`;
    shellStyle = panel.style;
  }

  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.97 },
        transition: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 },
      };

  return (
    <>
      <AnimatePresence>
        {!open && !(panel.compact && !rightCollapsedForLayout) && (
          <motion.button
            key="launcher"
            type="button"
            onClick={() => setOpen(true)}
            style={panel.launcherStyle || undefined}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            className={`pointer-events-auto fixed z-[1100] flex items-center gap-2 rounded-full border border-ds-border-default bg-ds-surface-raised text-sm font-medium text-ds-text-primary shadow-lg shadow-black/15 transition-colors hover:border-ds-accent hover:text-ds-accent ${
              panel.launcherStyle ? 'px-4 py-2.5' : 'bottom-5 right-[76px] h-14 w-14 justify-center'
            }`}
            aria-label="Ask LOCATIUM copilot"
          >
            <Sparkles size={panel.compact ? 22 : 18} className="text-ds-accent" />
            {panel.compact ? <span className="sr-only">{t('copilot.launcher')}</span> : t('copilot.launcher')}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
      {open && (
        <motion.div
          key="panel"
          role="dialog"
          aria-label="Ask LOCATIUM copilot"
          className={`${shellClass} ${panel.dragging ? 'select-none' : ''}`}
          style={{ ...(shellStyle || {}), transformOrigin: 'bottom right' }}
          {...motionProps}
        >
          {!expanded && !panel.compact ? (
            <div
              onPointerDown={panel.onResizeStart}
              className="absolute left-0 top-0 z-10 h-4 w-4 cursor-nwse-resize rounded-tl-2xl"
              title="Drag to resize"
              aria-hidden
            >
              <span className="absolute left-1 top-1 h-2 w-2 rounded-tl-sm border-l-2 border-t-2 border-ds-text-tertiary/50" />
            </div>
          ) : null}
          <header
            onPointerDown={expanded ? undefined : panel.onDragStart}
            onDoubleClick={expanded || panel.compact ? undefined : panel.redock}
            title={expanded || panel.compact ? undefined : t('copilot.dragHint')}
            className={`flex items-start justify-between gap-2 border-b border-ds-border-subtle bg-gradient-to-r from-ds-accent-subtle to-transparent px-4 py-3 ${
              expanded || panel.compact ? '' : panel.dragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-ds-accent" />
                <div className="whitespace-nowrap text-sm font-semibold text-ds-text-primary">{t('copilot.launcher')}</div>
                {panel.compact || (panel.style && panel.style.width < 400) ? null : (
                  <span className="rounded-full bg-ds-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ds-accent">
                    Copilot
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-ds-text-tertiary">
                <MapPin size={11} />
                <span className="truncate">{t('copilot.pin')}: {pinLabel}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = langPref === 'auto' ? 'en' : langPref === 'en' ? 'hi' : 'auto';
                  setLangPref(next);
                }}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-semibold uppercase text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                title="Answer language — Auto matches how you write"
              >
                <Languages size={14} />
                {langPref === 'auto' ? 'Auto' : langPref === 'hi' ? 'हिं' : 'EN'}
              </button>
              {canSpeak ? (
                <button
                  type="button"
                  onClick={() => {
                    if (speakReplies) stopSpeaking();
                    setSpeakingNow(false);
                    setSpeakReplies((v) => !v);
                  }}
                  className={`rounded-lg p-1.5 hover:bg-ds-surface-sunken ${
                    speakReplies ? 'text-ds-accent' : 'text-ds-text-tertiary hover:text-ds-text-primary'
                  }`}
                  title={speakReplies ? 'Read answers aloud: on' : 'Read answers aloud: off'}
                >
                  {speakReplies ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={resetChat}
                className="rounded-lg p-1.5 text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                title={t('copilot.newChat')}
                aria-label={t('copilot.newChat')}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg p-1.5 text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                title={expanded ? t('copilot.shrink') : t('copilot.expand')}
                aria-label={expanded ? t('copilot.shrink') : t('copilot.expand')}
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                aria-label={t('copilot.close')}
                title={t('copilot.close')}
              >
                <X size={16} />
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}`}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[94%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                    m.role === 'user'
                      ? 'bg-ds-accent text-white'
                      : 'bg-ds-surface-sunken text-ds-text-primary'
                  }`}
                >
                  {m.role === 'assistant' && m.method ? (
                    <div className="mb-1.5">
                      <MethodChip method={m.method} />
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap">
                    <InlineMarkdown text={m.text} />
                    {m.streaming ? (
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ds-accent align-middle" />
                    ) : null}
                  </p>
                  {m.guardrailNote ? (
                    <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] leading-4 text-amber-700 dark:text-amber-400">
                      {m.guardrailNote}
                    </p>
                  ) : null}
                  {m.partial ? (
                    <p className="mt-1.5 text-[10px] leading-4 text-ds-text-tertiary">
                      Some lookups were still running — ask again for the fuller picture.
                    </p>
                  ) : null}
                  {m.role === 'assistant' ? <ScoreCard scored={m.scoredLocation} /> : null}
                  {m.role === 'assistant' ? (
                    <OppList opportunities={m.opportunities} onFly={runAction} />
                  ) : null}
                  {m.terms?.length ? (
                    <div className="mt-2 space-y-1.5">
                      {m.terms.slice(0, 2).map((t) => (
                        <div
                          key={t.term}
                          className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-2 text-[11px]"
                        >
                          <div className="flex items-center gap-1 font-semibold text-ds-text-primary">
                            <BookOpen size={11} className="text-ds-accent" />
                            {t.term}
                          </div>
                          <p className="mt-0.5 text-ds-text-secondary">{t.explanation}</p>
                          {t.why ? (
                            <p className="mt-0.5 text-ds-text-tertiary">Why it matters: {t.why}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {m.actions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.slice(0, 6).map((a) => (
                        <button
                          key={`${a.type}-${a.label}`}
                          type="button"
                          onClick={() => runAction(a)}
                          title={a.hint || undefined}
                          className="inline-flex items-center gap-1 rounded-lg border border-ds-border-default bg-ds-surface-raised px-2 py-1 text-[11px] font-medium text-ds-accent hover:border-ds-accent"
                        >
                          <MapPin size={12} />
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.proposals?.length ? (
                    <div className="mt-2 space-y-1">
                      {m.proposals.slice(0, 3).map((p) => (
                        <button
                          key={p.type}
                          type="button"
                          onClick={() => runProposal(p, idx)}
                          title={p.hint || undefined}
                          className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default bg-ds-surface-raised px-2 py-1.5 text-left text-[11px] font-medium text-ds-text-secondary hover:border-ds-accent hover:text-ds-accent"
                        >
                          <Check size={12} />
                          <span className="min-w-0 flex-1 truncate">
                            {p.confirm || p.label}
                          </span>
                          <span className="shrink-0 text-[9px] uppercase tracking-wide text-ds-text-tertiary">
                            {p.confirmLabel || t('copilot.confirm')}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.followUps?.length && idx === messages.length - 1 && !busy ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.followUps.map((s, i) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => submit(s)}
                          className="rounded-full border border-ds-border-subtle bg-ds-surface-raised px-2.5 py-1 text-[11px] text-ds-text-secondary hover:border-ds-accent hover:text-ds-accent"
                        >
                          {m.followUpLabels?.[i] || s}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.actionNote ? (
                    <p className="mt-1.5 rounded-lg bg-ds-accent/10 px-2 py-1 text-[10px] leading-4 text-ds-accent">
                      {m.actionNote}
                    </p>
                  ) : null}
                  {m.actionReport ? (
                    <button
                      type="button"
                      onClick={() => downloadReport(m.actionReport.id, idx)}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-ds-accent px-3 py-1 text-[11px] font-semibold text-ds-accent hover:bg-ds-accent/10"
                    >
                      {t('copilot.downloadPdf')}
                    </button>
                  ) : null}
                  {m.disclaimer ? (
                    <p className="mt-2 text-[10px] leading-4 text-ds-text-tertiary">{m.disclaimer}</p>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-xs text-ds-text-tertiary">
                <Loader2 size={14} className="animate-spin text-ds-accent" />
                {phase || 'Working…'}
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-ds-border-subtle px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                rows={expanded ? 3 : 2}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                placeholder={
                  recording
                    ? 'Listening… tap the square to finish'
                    : t('copilot.placeholder')
                }
                className="min-w-0 flex-1 resize-none rounded-xl border border-ds-border-default bg-ds-surface-base px-3 py-2 text-sm text-ds-text-primary outline-none placeholder:text-ds-text-tertiary focus:border-ds-accent"
                disabled={busy || recording}
              />
              {canRecord ? (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={busy || transcribing}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
                    recording
                      ? 'animate-pulse border-red-500 bg-red-500 text-white'
                      : 'border-ds-border-default bg-ds-surface-raised text-ds-accent hover:border-ds-accent'
                  }`}
                  aria-label={recording ? 'Stop recording' : 'Ask with your voice'}
                  title={recording ? 'Stop and send' : 'Ask with your voice'}
                >
                  {transcribing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : recording ? (
                    <Square size={14} />
                  ) : (
                    <Mic size={16} />
                  )}
                </button>
              ) : null}
              <button
                type="submit"
                disabled={busy || recording || !input.trim()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ds-accent text-white disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
            {voiceError ? (
              <p className="mt-1.5 text-[10px] leading-4 text-red-500">{voiceError}</p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ds-text-tertiary">
              <MessageCircle size={11} />
              {recording
                ? 'Recording — speak naturally'
                : transcribing
                  ? 'Converting speech to text…'
                  : speakingNow
                    ? 'Reading the answer aloud…'
                    : t('copilot.enterHint')}
            </div>
          </form>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
