"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Church, Send, X } from "lucide-react";
import { useFeasts, useOrgHierarchy } from "@/hooks/use-feast";
import { fetchCached } from "@/lib/client-cache";
import {
  getDioceseLeaderboard, getLeaderboard, getMeghalaLeaderboard, getOverallDioceseLeaderboard, getOverallLeaderboard,
  getOverallMeghalaLeaderboard, getScreenData, searchParticipantResults,
  type LeaderboardRow, type ParticipantSearchRow, type ScreenCompetitionResult,
} from "@/actions/results";
import { resolveIntent, type AngelContext, type AngelIntent, type CompetitionRef, type NamedEntity, type Tier } from "@/lib/angel-intents";
import { GradeBadge, Medal, MedalCounts, isMedalPos } from "../feast-ui";
import { AngelMark } from "./angel-mark";
import { OPEN_ANGEL_EVENT } from "./angel-events";

// Angel — the portal's assistant. It reads like a chat, but every answer is
// a lookup: src/lib/angel-intents.ts decides what was asked (a top list, a
// shakha/meghala/diocese, a competition, or a person), and this component
// fetches it with the same public actions the portal pages use. Nothing is
// stored; the conversation lives in this component.

type Chip = { label: string; send?: string; href?: string; run?: () => void };
interface Message {
  id: number;
  from: "angel" | "user";
  text?: string;
  body?: React.ReactNode;
  chips?: Chip[];
}

const TIER_LABEL: Record<Tier, string> = { shakha: "shakhas", meghala: "meghalas", diocese: "dioceses" };
const UNASSIGNED = "__unassigned__";
const MIN_THINK_MS = 650;
const LOOKUP_TTL = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lb(key: string, load: () => Promise<{ data?: LeaderboardRow[] }>) {
  return fetchCached(`angel:${key}`, async () => (await load()).data ?? [], LOOKUP_TTL);
}

function genderWord(g: string | null): string {
  return g === "girl" ? "Girls" : g === "boy" ? "Boys" : "";
}

function compLabel(c: { categoryName: string; gender: string | null }): string {
  return [c.categoryName, genderWord(c.gender)].filter(Boolean).join(" ");
}

export default function AngelChat() {
  const { feasts } = useFeasts();
  const hierarchy = useOrgHierarchy();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [screens, setScreens] = useState<Record<string, ScreenCompetitionResult[]>>({});
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasDiocese = hierarchy.hierarchyLevel === "diocese";
  const hasMeghala = hierarchy.hierarchyLevel !== "shakha";

  const push = useCallback((m: Omit<Message, "id">) => {
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }]);
  }, []);

  // Greeting, the first time the panel opens.
  useEffect(() => {
    if (!open || messages.length > 0) return;
    push({
      from: "angel",
      text: "Hi, I'm Angel. Ask me about a participant (name or registration number), a shakha or meghala, a competition's result, or who's on top.",
      chips: [
        { label: "Top shakhas", send: "top shakha" },
        ...(hasMeghala ? [{ label: "Top meghalas", send: "top meghala" }] : []),
        ...(hasDiocese ? [{ label: "Top dioceses", send: "top diocese" }] : []),
        { label: "Open help", href: "/help" },
      ],
    });
  }, [open, messages.length, push, hasMeghala, hasDiocese]);

  // Published results for every fest, loaded once when Angel first opens —
  // they name the competitions Angel can recognise and hold their winners.
  useEffect(() => {
    if (!open || feasts.length === 0) return;
    let cancelled = false;
    Promise.all(
      feasts.map((f) =>
        fetchCached(`angel:screen:${f.slug}`, async () => (await getScreenData(f.slug)).data?.competitions ?? [], LOOKUP_TTL).then((c) => [f.slug, c] as const)
      )
    ).then((pairs) => { if (!cancelled) setScreens(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [open, feasts]);

  const context: AngelContext = useMemo(() => {
    const entities: NamedEntity[] = [
      ...hierarchy.shakhas.map((s) => ({ id: s.id, name: s.name, kind: "shakha" as const })),
      ...(hasMeghala ? hierarchy.meghalas.map((m) => ({ id: m.id, name: m.name, kind: "meghala" as const })) : []),
      ...(hasDiocese ? hierarchy.dioceses.map((d) => ({ id: d.id, name: d.name, kind: "diocese" as const })) : []),
    ];
    const competitions: CompetitionRef[] = feasts.flatMap((f) =>
      (screens[f.slug] ?? []).map((c) => ({ id: c.competitionId, name: c.competitionName, altName: c.competitionNameEn, categoryName: c.categoryName, gender: c.gender, feastSlug: f.slug, feastName: f.name }))
    );
    return { entities, competitions, feasts: feasts.map((f) => ({ slug: f.slug, name: f.name, type: f.type })) };
  }, [hierarchy.shakhas, hierarchy.meghalas, hierarchy.dioceses, hasMeghala, hasDiocese, feasts, screens]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const openNow = () => setOpen(true);
    window.addEventListener(OPEN_ANGEL_EVENT, openNow);
    return () => window.removeEventListener(OPEN_ANGEL_EVENT, openNow);
  }, []);

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  // ── Answers ──────────────────────────────────────────────────────────
  const feastName = useCallback((slug: string | null) => (slug ? feasts.find((f) => f.slug === slug)?.name ?? null : null), [feasts]);

  const answerTop = useCallback(async (tier: Tier, feastSlug: string | null): Promise<Omit<Message, "id">> => {
    if (tier === "diocese" && !hasDiocese) return { from: "angel", text: "This org doesn't group shakhas into dioceses, so there's no diocese ranking." };
    if (tier === "meghala" && !hasMeghala) return { from: "angel", text: "This org doesn't group shakhas into meghalas, so there's no meghala ranking." };
    const rows = await (tier === "shakha"
      ? lb(`shakha:${feastSlug ?? "all"}`, () => (feastSlug ? getLeaderboard(feastSlug) : getOverallLeaderboard()))
      : tier === "meghala"
        ? lb(`meghala:${feastSlug ?? "all"}`, () => (feastSlug ? getMeghalaLeaderboard(feastSlug) : getOverallMeghalaLeaderboard()))
        : lb(`diocese:${feastSlug ?? "all"}`, () => (feastSlug ? getDioceseLeaderboard(feastSlug) : getOverallDioceseLeaderboard())));
    const top = rows.filter((r) => r.shakhaId !== UNASSIGNED && r.points > 0).slice(0, 3);
    const where = feastName(feastSlug) ?? "all fests";
    if (top.length === 0) return { from: "angel", text: `No ${TIER_LABEL[tier]} have points in ${where} yet.` };
    return {
      from: "angel",
      text: `Top ${TIER_LABEL[tier]} in ${where}:`,
      body: <RankList rows={top} />,
      chips: [{ label: "See full rankings", href: "/rankings" }],
    };
  }, [hasDiocese, hasMeghala, feastName]);

  const answerEntity = useCallback(async (entity: NamedEntity): Promise<Omit<Message, "id">> => {
    const rows = await (entity.kind === "shakha"
      ? lb("shakha:all", getOverallLeaderboard)
      : entity.kind === "meghala"
        ? lb("meghala:all", getOverallMeghalaLeaderboard)
        : lb("diocese:all", getOverallDioceseLeaderboard));
    const row = rows.find((r) => r.shakhaId === entity.id);
    if (!row || row.points === 0) return { from: "angel", text: `${entity.name} hasn't scored any points yet.` };
    let extra: string | null = null;
    if (entity.kind === "shakha") {
      const s = hierarchy.shakhas.find((x) => x.id === entity.id);
      const m = s?.meghala_id ? hierarchy.meghalas.find((x) => x.id === s.meghala_id) : null;
      if (m && hasMeghala) extra = `${m.name} meghala`;
    } else if (entity.kind === "meghala") {
      const shakhaRows = await lb("shakha:all", getOverallLeaderboard);
      const memberIds = new Set(hierarchy.shakhas.filter((s) => s.meghala_id === entity.id).map((s) => s.id));
      const best = shakhaRows.find((r) => memberIds.has(r.shakhaId) && r.points > 0);
      if (best) extra = `Top shakha: ${best.name} (${best.points} pts)`;
    }
    return {
      from: "angel",
      text: `${entity.name} is #${row.rank} among ${TIER_LABEL[entity.kind]} with ${row.points} points, across all fests.`,
      body: <StandingCard row={row} extra={extra} />,
      chips: [{ label: "See full rankings", href: "/rankings" }],
    };
  }, [hierarchy.shakhas, hierarchy.meghalas, hasMeghala]);

  const competitionAnswer = useCallback((ref: CompetitionRef): Omit<Message, "id"> => {
    const comp = (screens[ref.feastSlug] ?? []).find((c) => c.competitionId === ref.id);
    if (!comp) return { from: "angel", text: `The result for ${ref.name} isn't published yet.` };
    return {
      from: "angel",
      text: `${comp.competitionName} — ${compLabel(comp) || "result"}, ${ref.feastName}:`,
      body: <CompetitionCard comp={comp} />,
      chips: [{ label: "All results", href: `/results?feast=${ref.feastSlug}` }],
    };
  }, [screens]);

  const answerParticipant = useCallback(async (query: string): Promise<Omit<Message, "id">> => {
    const lists = await Promise.all(
      feasts.map(async (f) => ((await searchParticipantResults(f.slug, query)).data ?? []).map((row) => ({ row, feastSlug: f.slug, feastName: f.name })))
    );
    const found = lists.flat();
    if (found.length === 0) {
      return {
        from: "angel",
        text: `I couldn't find anyone, any shakha or any competition matching "${query}". Check the spelling, or try the registration number.`,
        chips: [{ label: "Open help", href: "/help" }],
      };
    }
    const shown = found.slice(0, 5);
    return {
      from: "angel",
      text: found.length === 1 ? "I found 1 registration:" : `I found ${found.length} registrations${found.length > 5 ? " — here are the first 5" : ""}:`,
      body: (
        <div className="flex flex-col gap-2">
          {shown.map((f) => <ParticipantCard key={`${f.feastSlug}-${f.row.participantId}`} row={f.row} feastName={f.feastName} />)}
        </div>
      ),
      chips: [{ label: "Open Search", href: `/search?feast=${shown[0].feastSlug}&q=${encodeURIComponent(query)}` }],
    };
  }, [feasts]);

  const answer = useCallback(async (intent: AngelIntent, raw: string): Promise<Omit<Message, "id">> => {
    switch (intent.kind) {
      case "too-short":
        return { from: "angel", text: "Type a bit more — a name, a registration number, a shakha or a competition." };
      case "help":
        return { from: "angel", text: "The help page has step-by-step guides with pictures.", chips: [{ label: "Open help", href: "/help" }] };
      case "top":
        return answerTop(intent.tier, intent.feastSlug);
      case "entity":
        return answerEntity(intent.entity);
      case "competition": {
        if (intent.matches.length === 1) return competitionAnswer(intent.matches[0]);
        return {
          from: "angel",
          text: `${intent.matches[0].name} has ${intent.matches.length} results. Which one?`,
          chips: intent.matches.map((m) => ({ label: `${compLabel(m) || m.name} · ${m.feastName}`, run: () => push(competitionAnswer(m)) })),
        };
      }
      case "choose":
        return {
          from: "angel",
          text: `Did you mean the ${intent.entity.kind} ${intent.entity.name}, or a competition?`,
          chips: [
            { label: `${intent.entity.name} (${intent.entity.kind})`, run: () => { void answerEntity(intent.entity).then(push); } },
            ...intent.competitions.slice(0, 4).map((m) => ({ label: `${m.name} · ${compLabel(m) || m.feastName}`, run: () => push(competitionAnswer(m)) })),
          ],
        };
      case "participant":
        return answerParticipant(intent.query || raw);
    }
  }, [answerTop, answerEntity, competitionAnswer, answerParticipant, push]);

  async function send(text: string) {
    const raw = text.trim();
    if (!raw || thinking) return;
    setInput("");
    push({ from: "user", text: raw });
    setThinking(true);
    try {
      const [reply] = await Promise.all([answer(resolveIntent(raw, context), raw), sleep(MIN_THINK_MS)]);
      push(reply);
    } catch {
      push({ from: "angel", text: "Something went wrong looking that up. Check your connection and try again." });
    } finally {
      setThinking(false);
    }
  }

  // Keep Tab inside the open panel; Esc closes it.
  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Angel"
          className="angel-launcher fixed bottom-[108px] right-4 z-40 flex h-14 items-center gap-2 rounded-full pl-2 pr-4 transition-transform active:scale-95 sm:right-6 lg:bottom-6"
          style={{
            background: "var(--fp-panel-bg-strong, var(--fp-surface-2))",
            border: "1px solid var(--fp-line-2)",
            color: "var(--fp-ink)",
            boxShadow: "0 12px 30px rgba(0,0,0,.28), 0 0 0 1px rgba(255,214,107,.18), 0 0 26px rgba(255,214,107,.18)",
            backdropFilter: "blur(14px) saturate(150%)",
            WebkitBackdropFilter: "blur(14px) saturate(150%)",
          }}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}>
            <AngelMark size={26} />
          </span>
          <span className="text-[13.5px] font-extrabold">Ask Angel</span>
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Angel assistant"
          onKeyDown={onPanelKeyDown}
          className="fp-glass-edge fixed inset-x-2 bottom-2 top-[10vh] z-[55] flex flex-col overflow-hidden rounded-[26px] sm:inset-x-auto sm:right-6 sm:top-auto sm:bottom-6 sm:h-[min(620px,calc(100dvh-48px))] sm:w-[400px]"
          style={{
            background: "var(--fp-panel-bg-strong, var(--fp-sheet))",
            border: "1px solid var(--fp-panel-line, var(--fp-line-2))",
            color: "var(--fp-ink)",
            boxShadow: "0 30px 70px rgba(0,0,0,.45), var(--fp-card-glow, 0 0 #0000)",
            backdropFilter: "blur(20px) saturate(150%)",
            WebkitBackdropFilter: "blur(20px) saturate(150%)",
          }}
        >
          <header className="flex shrink-0 items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--fp-line)" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)", boxShadow: "0 0 18px rgba(255,214,107,.3)" }}>
              <AngelMark size={28} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[16px] font-extrabold leading-tight">Angel</p>
              <p className="m-0 text-[12px] font-semibold" style={{ color: "var(--fp-sub)" }}>Finds people, shakhas and results</p>
            </div>
            <button type="button" onClick={close} aria-label="Close Angel" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--fp-surface-3)", color: "var(--fp-sub)" }}>
              <X className="h-[18px] w-[18px]" />
            </button>
          </header>

          <div ref={listRef} role="log" aria-live="polite" className="fp-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
            {messages.map((m) => <Bubble key={m.id} m={m} onSend={send} disabled={thinking} />)}
            {thinking && (
              <div className="flex items-end gap-2" aria-label="Angel is looking it up">
                <AngelAvatar />
                <span className="angel-dots inline-flex items-center gap-1 rounded-[18px] rounded-bl-[6px] px-3.5 py-3" style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line)" }}>
                  <i /><i /><i />
                </span>
              </div>
            )}
          </div>

          <form
            className="flex shrink-0 items-center gap-2 p-3"
            style={{ borderTop: "1px solid var(--fp-line)" }}
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <label htmlFor="angel-input" className="sr-only">Ask Angel</label>
            <input
              id="angel-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Name, reg no, shakha, competition…"
              autoComplete="off"
              className="fp-ml h-12 min-w-0 flex-1 rounded-[16px] border px-4 text-[15px] font-semibold outline-none focus:border-[var(--fp-primary-light)]"
              style={{ background: "var(--fp-input)", borderColor: "var(--fp-line-2)", color: "var(--fp-ink)" }}
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Send"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      )}

      <style>{`
        .angel-dots i { width: 7px; height: 7px; border-radius: 9999px; background: var(--fp-sub); display: block; animation: angelDot 1s infinite ease-in-out; }
        .angel-dots i:nth-child(2) { animation-delay: .15s; }
        .angel-dots i:nth-child(3) { animation-delay: .3s; }
        @keyframes angelDot { 0%, 80%, 100% { transform: translateY(0); opacity: .45; } 40% { transform: translateY(-4px); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .angel-dots i { animation: none; opacity: .7; } }
      `}</style>
    </>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────
function AngelAvatar() {
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}>
      <AngelMark size={20} />
    </span>
  );
}

function Bubble({ m, onSend, disabled }: { m: Message; onSend: (t: string) => void; disabled: boolean }) {
  const mine = m.from === "user";
  return (
    <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
      {!mine && <AngelAvatar />}
      <div className={`flex min-w-0 max-w-[86%] flex-col gap-2 ${mine ? "items-end" : "items-start"}`}>
        {m.text && (
          <p
            className={`fp-ml m-0 rounded-[18px] px-3.5 py-2.5 text-[14px] font-semibold leading-snug ${mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"}`}
            style={mine ? { background: "var(--fp-btn)", color: "var(--fp-btn-fg)" } : { background: "var(--fp-surface-3)", border: "1px solid var(--fp-line)" }}
          >
            {m.text}
          </p>
        )}
        {m.body && <div className="w-full">{m.body}</div>}
        {m.chips && m.chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.chips.map((c, i) =>
              c.href ? (
                <Link key={`${c.label}-${i}`} href={c.href} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-bold" style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line-2)", color: "var(--fp-link)" }}>
                  {c.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : (
                <button
                  key={`${c.label}-${i}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => (c.run ? c.run() : c.send && onSend(c.send))}
                  className="fp-ml inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-bold disabled:opacity-50"
                  style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line-2)", color: "var(--fp-ink)" }}
                >
                  {c.label}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const CARD: React.CSSProperties = { background: "var(--fp-row-bg)", border: "1px solid var(--fp-line)", borderRadius: 16 };

function RankList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.shakhaId} className="flex items-center gap-2.5 px-3 py-2.5" style={CARD}>
          {isMedalPos(r.rank) ? <Medal pos={r.rank} size={28} /> : <span className="fp-num w-7 text-center text-[15px]">{r.rank}</span>}
          <span className="fp-ml min-w-0 flex-1 truncate text-[14.5px] font-extrabold">{r.name}</span>
          <span className="fp-num text-[18px]" style={{ color: "var(--fp-gold-ink)" }}>{r.points}</span>
          <span className="text-[10.5px] font-bold" style={{ color: "var(--fp-meta)" }}>pts</span>
        </div>
      ))}
    </div>
  );
}

function StandingCard({ row, extra }: { row: LeaderboardRow; extra: string | null }) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3" style={CARD}>
      <div className="flex items-center gap-2.5">
        {isMedalPos(row.rank) ? <Medal pos={row.rank} size={30} /> : <span className="fp-num text-[18px]">#{row.rank}</span>}
        <span className="fp-ml min-w-0 flex-1 truncate text-[15px] font-extrabold">{row.name}</span>
        <span className="fp-num text-[22px]" style={{ color: "var(--fp-gold-ink)" }}>{row.points}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-bold" style={{ color: "var(--fp-sub)" }}>
        <MedalCounts g={row.firstCount} s={row.secondCount} b={row.thirdCount} size={14} />
        <span>Grades A {row.aGrade} · B {row.bGrade} · C {row.cGrade}</span>
      </div>
      {extra && <p className="fp-ml m-0 text-[12.5px] font-bold" style={{ color: "var(--fp-link)" }}>{extra}</p>}
    </div>
  );
}

function CompetitionCard({ comp }: { comp: ScreenCompetitionResult }) {
  if (comp.positions.length === 0) {
    const graded = comp.grades.A.length + comp.grades.B.length + comp.grades.C.length;
    return <p className="m-0 px-3.5 py-3 text-[13px] font-semibold" style={{ ...CARD, color: "var(--fp-sub)" }}>No placed winners for this item — {graded} graded.</p>;
  }
  const gradeOf = (name: string, shakha: string) => (["A", "B", "C"] as const).find((g) => comp.grades[g].some((a) => a.name === name && a.shakha === shakha)) ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      {comp.positions.map((p, i) => (
        <div key={`${p.place}-${p.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2.5" style={CARD}>
          <Medal pos={p.place} size={30} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="fp-ml truncate text-[14.5px] font-extrabold">{p.name}</span>
            <span className="fp-ml inline-flex items-center gap-1 truncate text-[12px] font-bold" style={{ color: "var(--fp-link)" }}>
              <Church className="h-3 w-3 shrink-0" aria-hidden="true" />{p.shakha}{p.meghalaName ? `, ${p.meghalaName}` : ""}
            </span>
          </span>
          <GradeBadge grade={gradeOf(p.name, p.shakha)} size={30} />
        </div>
      ))}
    </div>
  );
}

function ParticipantCard({ row, feastName }: { row: ParticipantSearchRow; feastName: string }) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3" style={CARD}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="fp-ml m-0 truncate text-[15px] font-extrabold">{row.name}</p>
          <p className="fp-ml m-0 truncate text-[12px] font-bold" style={{ color: "var(--fp-link)" }}>
            {row.shakha}{row.meghalaName ? `, ${row.meghalaName}` : ""}
          </p>
        </div>
        <span className="fp-num shrink-0 rounded-md px-2 py-1 text-[11.5px]" style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line)" }}>{row.regNo}</span>
      </div>
      <p className="fp-ml m-0 text-[11.5px] font-bold" style={{ color: "var(--fp-meta)" }}>{feastName}</p>
      {row.results.length === 0 ? (
        <p className="m-0 text-[12px] font-semibold" style={{ color: "var(--fp-sub)" }}>Registered — no competitions yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {row.results.map((r) => (
            <li key={r.competitionId} className="flex items-center gap-2 text-[12.5px] font-semibold">
              <span className="fp-ml min-w-0 flex-1 truncate">{r.competitionName}</span>
              {r.isPublished ? (
                <>
                  {isMedalPos(r.position) && <Medal pos={r.position} size={20} />}
                  <GradeBadge grade={r.grade} size={22} />
                </>
              ) : (
                <span className="text-[11px] font-bold" style={{ color: "var(--fp-meta)" }}>Result pending</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
