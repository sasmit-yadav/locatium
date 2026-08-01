import { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { askLocatium } from '../services/assistant';
import { useDashboardStore } from '../stores/useDashboardStore';

const STARTER_CHIPS = [
  'ye jagah industrial ke liye kaisi hai?',
  'gurgaon me best warehouse under 5 cr',
  'kitna land rate hai yaha',
  'faridabad vs sonipat industrial',
  'CLU / HSIIDC policy batao',
  'How is the score calculated?',
];

function MethodChip({ method }) {
  if (!method) return null;
  const map = {
    llm: 'AI copilot · grounded',
    rule_based: 'Live data copilot',
    rule_based_fallback: 'Data fallback',
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
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [session, setSession] = useState({});
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "I'm your LOCATIUM copilot. Ask anything about this map — scores, land ₹, zones, policy — in English or Hinglish, even if the wording is messy. Click the map for “yaha / this site” questions.",
      method: null,
      actions: [],
      followUps: STARTER_CHIPS.slice(0, 4),
    },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const selectedLocation = useDashboardStore((s) => s.selectedLocation);
  const view = useDashboardStore((s) => s.view);
  const flyTo = useDashboardStore((s) => s.flyTo);
  const setInvestorHighlights = useDashboardStore((s) => s.setInvestorHighlights);
  const setActiveInspectorTab = useDashboardStore((s) => s.setActiveInspectorTab);
  const toggleRight = useDashboardStore((s) => s.toggleRight);
  const rightCollapsed = useDashboardStore((s) => s.rightCollapsed);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener('locatium:open-assistant', onOpen);
    return () => window.removeEventListener('locatium:open-assistant', onOpen);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, busy]);

  function runAction(action) {
    if (!action) return;
    if (action.type === 'flyTo' && action.lng != null && action.lat != null) {
      flyTo({
        lng: action.lng,
        lat: action.lat,
        zoom: action.zoom || 12,
        name: action.name || 'Copilot suggestion',
        type: 'Ask LOCATIUM',
        feature: action.zoneId ? { investorZoneId: action.zoneId, id: action.zoneId } : null,
      });
    }
    if (action.type === 'highlightOpportunities' && action.highlights?.length) {
      setInvestorHighlights(action.highlights);
    }
    if (action.type === 'openInvestor' || action.type === 'openAnalysis') {
      if (rightCollapsed) toggleRight();
      setActiveInspectorTab(action.type === 'openInvestor' ? 'investor' : 'analysis');
    }
  }

  function resetChat() {
    setSession({});
    setMessages([
      {
        role: 'assistant',
        text: 'Fresh start. What should we look at — a pin on the map, a district shortlist, or land ₹?',
        method: null,
        actions: [],
        followUps: STARTER_CHIPS.slice(0, 4),
      },
    ]);
  }

  async function submit(text) {
    const query = String(text || input).trim();
    if (!query || busy) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setBusy(true);
    setPhase('Understanding your ask…');

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    // Full Gurugram scan can exceed 2 minutes on cold cache; don't kill the request early.
    const softTimer = setTimeout(() => {
      setPhase('Still scanning every eligible site in the district — first run is slow, then cached…');
    }, 8000);
    const hardTimer = setTimeout(() => {
      abortRef.current?.abort();
    }, 9 * 60 * 1000);

    try {
      const lat = selectedLocation?.lat ?? view?.lat;
      const lng = selectedLocation?.lng ?? view?.lng;
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text }));

      const looksDistrict = /\b(gurgaon|gurugram|faridabad|sonipat|sonepat|rewari|jhajjar|district|zone|warehouse|best|under\s+\d+\s*cr)\b/i.test(
        query
      );
      setPhase(
        looksDistrict
          ? 'Scanning all investor-eligible sites in that district (full inventory)…'
          : 'Pulling live scores & ranks…'
      );
      const result = await askLocatium(
        {
          query,
          lat,
          lng,
          sector: session.sector || 'industrial',
          district: session.district,
          history,
          session,
        },
        { signal: abortRef.current.signal }
      );

      if (result.session) {
        setSession((prev) => ({ ...prev, ...result.session }));
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: result.answer,
          method: result.method,
          disclaimer: result.disclaimer,
          actions: result.mapActions || [],
          followUps: result.followUps || [],
          opportunities: result.opportunities || [],
          scoredLocation: result.scoredLocation,
          intents: result.intents,
        },
      ]);

      const hl = result.mapActions?.find((a) => a.type === 'highlightOpportunities');
      if (hl?.highlights?.length) setInvestorHighlights(hl.highlights);
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: 'Scan timed out after ~9 minutes. Retry once — after the first full district scan finishes, answers are fast from cache.',
            method: 'error',
            actions: [],
            followUps: STARTER_CHIPS.slice(0, 3),
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Couldn’t reach the copilot — ${err.message}. Try again, or use Investor filters on the right.`,
          method: 'error',
          actions: [],
          followUps: STARTER_CHIPS.slice(0, 3),
        },
      ]);
    } finally {
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
      setBusy(false);
      setPhase('');
    }
  }

  const pinLabel =
    selectedLocation?.name && selectedLocation.name !== 'Gurugram Industrial Corridor'
      ? selectedLocation.name
      : selectedLocation?.lat != null
        ? `${Number(selectedLocation.lat).toFixed(3)}, ${Number(selectedLocation.lng).toFixed(3)}`
        : 'No pin yet';

  const shellClass = expanded
    ? 'fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-ds-border-default bg-ds-surface-raised shadow-2xl'
    : 'pointer-events-auto fixed bottom-16 right-4 z-40 flex h-[min(620px,78vh)] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-ds-border-default bg-ds-surface-raised shadow-2xl shadow-black/15';

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full border border-ds-border-default bg-ds-surface-raised px-4 py-2.5 text-sm font-medium text-ds-text-primary shadow-lg shadow-black/10 transition hover:border-ds-accent hover:text-ds-accent"
          aria-label="Ask LOCATIUM copilot"
        >
          <Sparkles size={18} className="text-ds-accent" />
          Ask LOCATIUM
        </button>
      )}

      {open && (
        <div className={shellClass}>
          <header className="flex items-start justify-between gap-2 border-b border-ds-border-subtle bg-gradient-to-r from-ds-accent-subtle to-transparent px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-ds-accent" />
                <div className="text-sm font-semibold text-ds-text-primary">Ask LOCATIUM</div>
                <span className="rounded-full bg-ds-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ds-accent">
                  Copilot
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-ds-text-tertiary">
                <MapPin size={11} />
                <span className="truncate">Context pin: {pinLabel}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={resetChat}
                className="rounded-lg p-1.5 text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                title="New chat"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg p-1.5 text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                title={expanded ? 'Shrink' : 'Expand'}
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-ds-text-tertiary hover:bg-ds-surface-sunken hover:text-ds-text-primary"
                aria-label="Close"
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
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.role === 'assistant' ? <ScoreCard scored={m.scoredLocation} /> : null}
                  {m.role === 'assistant' ? (
                    <OppList opportunities={m.opportunities} onFly={runAction} />
                  ) : null}
                  {m.actions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.slice(0, 6).map((a) => (
                        <button
                          key={`${a.type}-${a.label}`}
                          type="button"
                          onClick={() => runAction(a)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ds-border-default bg-ds-surface-raised px-2 py-1 text-[11px] font-medium text-ds-accent hover:border-ds-accent"
                        >
                          <MapPin size={12} />
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.followUps?.length && idx === messages.length - 1 && !busy ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.followUps.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => submit(s)}
                          className="rounded-full border border-ds-border-subtle bg-ds-surface-raised px-2.5 py-1 text-[11px] text-ds-text-secondary hover:border-ds-accent hover:text-ds-accent"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
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
                placeholder="Ask anything — typos, Hinglish, jumbled words OK…"
                className="min-w-0 flex-1 resize-none rounded-xl border border-ds-border-default bg-ds-surface-base px-3 py-2 text-sm text-ds-text-primary outline-none placeholder:text-ds-text-tertiary focus:border-ds-accent"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ds-accent text-white disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ds-text-tertiary">
              <MessageCircle size={11} />
              Enter to send · Shift+Enter for newline · remembers this chat
            </div>
          </form>
        </div>
      )}
    </>
  );
}
