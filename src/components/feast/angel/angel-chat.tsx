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
import { readAngelQuestion } from "@/actions/angel";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getDescendantShakhaIds, type AdminScope } from "@/lib/org-hierarchy";
import { countScopeRegistrations, loadScopeTeams, resolveCapScope } from "@/lib/reg-cap-scope";
import { DEFAULT_MAX_PER_SHAKHA, DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { intentFromAi, resolveIntent, type AngelContext, type AngelIntent, type CompetitionRef, type NamedEntity, type Tier } from "@/lib/angel-intents";
import { GradeBadge, Medal, MedalCounts, isMedalPos } from "../feast-ui";
import { AngelMark } from "./angel-mark";
import { OPEN_ANGEL_EVENT } from "./angel-events";

// Angel — the portal's assistant. It reads like a chat, but every answer is
// a lookup: an AI model reads the question (readAngelQuestion), falling back to
// the keyword router in src/lib/angel-intents.ts, to decide what was asked
// (a top list, a shakha/meghala/diocese, a competition, or a person), and
// this component fetches it with the same public actions the portal pages
// use. Nothing is stored; the conversation lives in this component.

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

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

// One fest's items with their stage, time and run status — every item, not
// just published ones, so Angel can also name items still to come.
interface ScheduleItem {
  id: string;
  name: string;
  nameEn: string | null;
  categoryName: string;
  gender: string | null;
  time: string | null;
  minutes: number | null;
  order: number;
  stageNumber: number | null;
  stageTitle: string | null;
  venue: string | null;
  status: string;
  progress: number | null;
}

const SCHEDULE_TTL = 30_000;

// "9:30 AM" → minutes after midnight, for sorting; anything else sorts last.
function toMinutes(t: string | null): number | null {
  const m = t?.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\.?$/i);
  if (!m) return null;
  return (Number(m[1]) % 12 + (m[3].toLowerCase() === "p" ? 12 : 0)) * 60 + Number(m[2] ?? 0);
}

const byTime = (a: ScheduleItem, b: ScheduleItem) => (a.minutes ?? 1e4) - (b.minutes ?? 1e4) || a.order - b.order;

async function loadSchedule(feastSlug: string): Promise<ScheduleItem[]> {
  const { data, error } = await supabase
    .from("feast_competitions")
    .select("id, display_order, time_slot, venue, scheduled_time, comp_status, progress_pct, feast:feasts!inner(slug), stage:stages(number, title, venue), competition:competitions(name, name_en, gender, competition_category:competition_categories(name))")
    .eq("feast.slug", feastSlug)
    .order("display_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((fc) => {
    const c = one(fc.competition);
    const stage = one(fc.stage);
    const time = fc.scheduled_time || fc.time_slot || null;
    return {
      id: fc.id,
      name: c?.name ?? "Competition",
      nameEn: c?.name_en ?? null,
      categoryName: one(c?.competition_category)?.name ?? "",
      gender: c?.gender ?? null,
      time,
      minutes: toMinutes(time),
      order: fc.display_order ?? 0,
      stageNumber: stage?.number ?? null,
      stageTitle: stage?.title ?? null,
      venue: fc.venue || stage?.venue || null,
      status: fc.comp_status ?? "upcoming",
      progress: fc.progress_pct ?? null,
    };
  });
}

const schedule = (feastSlug: string) => fetchCached(`angel:schedule:${feastSlug}`, () => loadSchedule(feastSlug), SCHEDULE_TTL);

// Labels match the stage page (feast-stages.tsx).
function runStatus(item: ScheduleItem): { label: string; live: boolean } {
  if (item.status === "progressing") return { label: item.progress != null ? `Live · ${item.progress}%` : "Live", live: true };
  if (item.status === "completed") return { label: "Completed", live: false };
  if (item.status === "published") return { label: "Result out", live: false };
  return { label: "Upcoming", live: false };
}

function stageText(item: ScheduleItem): string | null {
  if (item.stageNumber == null) return item.venue;
  return `Stage ${item.stageNumber}${item.stageTitle ? ` (${item.stageTitle})` : ""}`;
}

// One fest's items with how many places a cap scope has used — counted the
// way the registration form counts them (lib/reg-cap-scope): individual
// entries against max_per_shakha, team members against max_team_size.
interface ItemSlots { id: string; name: string; label: string; team: boolean; filled: number; cap: number }

async function loadItemSlots(feastSlug: string, scopeShakhaIds: string[]): Promise<ItemSlots[]> {
  const { data, error } = await supabase
    .from("feast_competitions")
    .select("id, feast:feasts!inner(slug), competition:competitions(name, type, gender, max_per_shakha, max_team_size, competition_category:competition_categories(name))")
    .eq("feast.slug", feastSlug)
    .order("display_order");
  if (error) throw new Error(error.message);
  const items = (data ?? []).map((fc) => {
    const c = one(fc.competition);
    const team = c?.type === "group";
    return {
      id: fc.id,
      name: c?.name ?? "Competition",
      label: compLabel({ categoryName: one(c?.competition_category)?.name ?? "", gender: c?.gender ?? null }),
      team,
      cap: team ? c?.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS : c?.max_per_shakha ?? DEFAULT_MAX_PER_SHAKHA,
    };
  });
  const [counts, teams] = await Promise.all([
    countScopeRegistrations(supabase, items.filter((i) => !i.team).map((i) => i.id), scopeShakhaIds),
    loadScopeTeams(supabase, items.filter((i) => i.team).map((i) => i.id), scopeShakhaIds),
  ]);
  return items.map((i) => ({ ...i, filled: i.team ? teams[i.id]?.members ?? 0 : counts[i.id] ?? 0 }));
}

export default function AngelChat() {
  const { feasts } = useFeasts();
  const hierarchy = useOrgHierarchy();
  const { profile, adminScope } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [screens, setScreens] = useState<Record<string, ScreenCompetitionResult[]>>({});
  const [schedules, setSchedules] = useState<Record<string, ScheduleItem[]>>({});
  const nextId = useRef(1);
  const aiOff = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasDiocese = hierarchy.hierarchyLevel === "diocese";
  const hasMeghala = hierarchy.hierarchyLevel !== "shakha";

  const push = useCallback((m: Omit<Message, "id">) => {
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }]);
  }, []);

  const starterChips: Chip[] = useMemo(() => [
    { label: "What's on stage now", send: "what's happening now" },
    { label: "Top shakhas", send: "top shakha" },
    ...(hasMeghala ? [{ label: "Top meghalas", send: "top meghala" }] : []),
    ...(hasDiocese ? [{ label: "Top dioceses", send: "top diocese" }] : []),
    ...(adminScope ? [{ label: "Items left to register", send: "which items are left" }] : []),
    { label: "Open help", href: "/help" },
  ], [hasMeghala, hasDiocese, adminScope]);

  // Greeting, the first time the panel opens.
  useEffect(() => {
    if (!open || messages.length > 0) return;
    push({
      from: "angel",
      text: "Hi, I'm Angel. Ask me about a participant (name or registration number), a shakha or meghala, a competition's result or time, what's on stage, or who's on top.",
      chips: starterChips,
    });
  }, [open, messages.length, push, starterChips]);

  // Published results and the stage schedule for every fest, loaded when
  // Angel opens — they name the competitions Angel can recognise.
  useEffect(() => {
    if (!open || feasts.length === 0) return;
    let cancelled = false;
    Promise.all(
      feasts.map((f) =>
        fetchCached(`angel:screen:${f.slug}`, async () => (await getScreenData(f.slug)).data?.competitions ?? [], LOOKUP_TTL).then((c) => [f.slug, c] as const)
      )
    ).then((pairs) => { if (!cancelled) setScreens(Object.fromEntries(pairs)); });
    Promise.all(feasts.map((f) => schedule(f.slug).catch(() => [] as ScheduleItem[]).then((s) => [f.slug, s] as const)))
      .then((pairs) => { if (!cancelled) setSchedules(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [open, feasts]);

  const context: AngelContext = useMemo(() => {
    const entities: NamedEntity[] = [
      ...hierarchy.shakhas.map((s) => ({ id: s.id, name: s.name, kind: "shakha" as const })),
      ...(hasMeghala ? hierarchy.meghalas.map((m) => ({ id: m.id, name: m.name, kind: "meghala" as const })) : []),
      ...(hasDiocese ? hierarchy.dioceses.map((d) => ({ id: d.id, name: d.name, kind: "diocese" as const })) : []),
    ];
    // Every scheduled item; published results stand in if the schedule
    // couldn't be read.
    const competitions: CompetitionRef[] = feasts.flatMap((f) =>
      schedules[f.slug]?.length
        ? schedules[f.slug].map((c) => ({ id: c.id, name: c.name, altName: c.nameEn, categoryName: c.categoryName, gender: c.gender, feastSlug: f.slug, feastName: f.name }))
        : (screens[f.slug] ?? []).map((c) => ({ id: c.competitionId, name: c.competitionName, altName: c.competitionNameEn, categoryName: c.categoryName, gender: c.gender, feastSlug: f.slug, feastName: f.name }))
    );
    return { entities, competitions, feasts: feasts.map((f) => ({ slug: f.slug, name: f.name, type: f.type })) };
  }, [hierarchy.shakhas, hierarchy.meghalas, hierarchy.dioceses, hasMeghala, hasDiocese, feasts, screens, schedules]);

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

  // Ids of the `tier` nodes inside a meghala or diocese.
  const memberIds = useCallback((group: NamedEntity, tier: Tier): Set<string> => {
    if (tier === "meghala") return new Set(hierarchy.meghalas.filter((m) => m.diocese_id === group.id).map((m) => m.id));
    if (group.kind === "meghala") return new Set(hierarchy.shakhas.filter((s) => s.meghala_id === group.id).map((s) => s.id));
    return new Set(getDescendantShakhaIds({ level: "diocese", id: group.id, name: group.name }, hierarchy));
  }, [hierarchy]);

  const answerTop = useCallback(async (tier: Tier, feastSlug: string | null, within?: NamedEntity): Promise<Omit<Message, "id">> => {
    if (tier === "diocese" && !hasDiocese) return { from: "angel", text: "This org doesn't group shakhas into dioceses, so there's no diocese ranking." };
    if (tier === "meghala" && !hasMeghala) return { from: "angel", text: "This org doesn't group shakhas into meghalas, so there's no meghala ranking." };
    const rows = await (tier === "shakha"
      ? lb(`shakha:${feastSlug ?? "all"}`, () => (feastSlug ? getLeaderboard(feastSlug) : getOverallLeaderboard()))
      : tier === "meghala"
        ? lb(`meghala:${feastSlug ?? "all"}`, () => (feastSlug ? getMeghalaLeaderboard(feastSlug) : getOverallMeghalaLeaderboard()))
        : lb(`diocese:${feastSlug ?? "all"}`, () => (feastSlug ? getDioceseLeaderboard(feastSlug) : getOverallDioceseLeaderboard())));
    const where = feastName(feastSlug) ?? "all fests";
    const scored = rows.filter((r) => r.shakhaId !== UNASSIGNED && r.points > 0);
    // Inside a group: its members only, ranked among themselves, and a few
    // more of them since the list is short.
    const members = within ? memberIds(within, tier) : null;
    const top = members
      ? scored.filter((r) => members.has(r.shakhaId)).slice(0, 5).map((r, i) => ({ ...r, rank: i + 1 }))
      : scored.slice(0, 3);
    const group = within ? ` in ${within.name} ${within.kind}` : "";
    if (top.length === 0) return { from: "angel", text: `No ${TIER_LABEL[tier]}${group} have points in ${where} yet.` };
    return {
      from: "angel",
      text: `Top ${TIER_LABEL[tier]}${group}, ${where}:`,
      body: <RankList rows={top} />,
      chips: [{ label: "See full rankings", href: "/rankings" }],
    };
  }, [hasDiocese, hasMeghala, feastName, memberIds]);

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

  // When and where — read fresh (30s cache), since status changes live.
  const answerSchedule = useCallback(async (matches: CompetitionRef[]): Promise<Omit<Message, "id">> => {
    const slugs = [...new Set(matches.map((m) => m.feastSlug))];
    const items = (await Promise.all(slugs.map(schedule))).flat();
    const found = matches.map((m) => items.find((i) => i.id === m.id)).filter((i): i is ScheduleItem => !!i).sort(byTime);
    const chips: Chip[] = slugs.map((s) => ({ label: slugs.length > 1 ? `${feastName(s) ?? "Fest"} stages` : "Stage schedule", href: `/feast/${s}/stages` }));
    const name = matches[0].name;
    if (!found.some((i) => i.stageNumber != null || i.time)) {
      return { from: "angel", text: `${name} isn't on the stage schedule yet.`, chips };
    }
    const where = slugs.length === 1 ? `, ${feastName(slugs[0]) ?? ""}` : "";
    return {
      from: "angel",
      text: found.length === 1 ? `${name}${where}:` : `When and where ${name} runs${where}:`,
      body: (
        <ScheduleList
          rows={found.map((i) => ({
            key: i.id,
            title: [compLabel(i), slugs.length > 1 ? feastName(matches.find((m) => m.id === i.id)?.feastSlug ?? null) : null].filter(Boolean).join(" · ") || i.name,
            sub: [stageText(i), i.time].filter(Boolean).join(" · ") || "Not scheduled yet",
            status: runStatus(i),
          }))}
        />
      ),
      chips,
    };
  }, [feastName]);

  // One stage's running order, or every stage's live/next item.
  const answerStage = useCallback(async (number: number | null, feastSlug: string | null): Promise<Omit<Message, "id">> => {
    const targets = feastSlug ? feasts.filter((f) => f.slug === feastSlug) : feasts;
    const lists = await Promise.all(targets.map(async (f) => ({ f, items: await schedule(f.slug) })));
    const many = lists.filter((l) => l.items.some((i) => i.stageNumber != null)).length > 1;
    const chips: Chip[] = lists
      .filter((l) => l.items.some((i) => i.stageNumber != null))
      .map(({ f }) => ({ label: many ? `${f.name} stages` : "Stage schedule", href: `/feast/${f.slug}/stages` }));

    if (number != null) {
      const groups = lists.map(({ f, items }) => ({ f, items: items.filter((i) => i.stageNumber === number).sort(byTime) })).filter((g) => g.items.length);
      if (groups.length === 0) return { from: "angel", text: `I couldn't find a stage ${number}${feastSlug ? ` in ${feastName(feastSlug)}` : ""}.`, chips };
      const title = groups[0].items[0].stageTitle;
      return {
        from: "angel",
        text: `Stage ${number}${title ? ` (${title})` : ""}${groups.length === 1 ? `, ${groups[0].f.name}` : ""}:`,
        body: (
          <ScheduleList
            rows={groups.flatMap(({ f, items }) => items.map((i) => ({
              key: i.id,
              title: `${i.name}${compLabel(i) ? ` · ${compLabel(i)}` : ""}`,
              sub: [i.time, groups.length > 1 ? f.name : null].filter(Boolean).join(" · ") || "Time not set",
              status: runStatus(i),
            })))}
          />
        ),
        chips,
      };
    }

    // Each stage's live item, or else its next one.
    const rows = lists.flatMap(({ f, items }) => {
      const numbers = [...new Set(items.map((i) => i.stageNumber).filter((n): n is number => n != null))].sort((a, b) => a - b);
      return numbers.flatMap((n) => {
        const onStage = items.filter((i) => i.stageNumber === n).sort(byTime);
        const pick = onStage.find((i) => i.status === "progressing") ?? onStage.find((i) => i.status === "upcoming");
        if (!pick) return [];
        const live = pick.status === "progressing";
        return [{
          key: pick.id,
          title: `Stage ${n} · ${pick.name}`,
          sub: [compLabel(pick), live ? null : pick.time ? `Next at ${pick.time}` : "Next", many ? f.name : null].filter(Boolean).join(" · "),
          status: runStatus(pick),
        }];
      });
    });
    if (rows.length === 0) {
      const anyStages = lists.some((l) => l.items.some((i) => i.stageNumber != null));
      return { from: "angel", text: anyStages ? "Nothing is on stage right now, and nothing more is scheduled." : "The stage schedule hasn't been published yet.", chips };
    }
    return {
      from: "angel",
      text: rows.some((r) => r.status.live) ? "On stage now:" : "Nothing is live right now. Next up:",
      body: <ScheduleList rows={rows} />,
      chips,
    };
  }, [feasts, feastName]);

  // A branch admin's own items, counted over their cap scope — the same set
  // of shakhas the registration form checks the cap against.
  const answerRegistrations = useCallback(async (node: AdminScope, mode: "registered" | "left", slug: string): Promise<Omit<Message, "id">> => {
    const scope = node.level === "shakha"
      ? await resolveCapScope(supabase, node.id)
      : { shakhaIds: getDescendantShakhaIds(node, hierarchy), name: node.name };
    const items = await loadItemSlots(slug, scope.shakhaIds);
    const where = feastName(slug) ?? "this fest";
    const chips: Chip[] = [
      { label: "Register", href: `/feast/${slug}/register` },
      { label: "My registrations", href: `/feast/${slug}/registrations` },
    ];
    if (mode === "registered") {
      const done = items.filter((i) => i.filled > 0);
      if (done.length === 0) return { from: "angel", text: `${scope.name} hasn't registered for anything in ${where} yet.`, chips };
      return { from: "angel", text: `${scope.name} has entries in ${done.length} of ${items.length} items in ${where}:`, body: <SlotList items={done} mode={mode} />, chips };
    }
    const remaining = items.filter((i) => i.filled < i.cap);
    if (remaining.length === 0) return { from: "angel", text: `Every item in ${where} is full for ${scope.name}.`, chips };
    return { from: "angel", text: `${scope.name} can still register for ${remaining.length} of ${items.length} items in ${where}:`, body: <SlotList items={remaining} mode={mode} />, chips };
  }, [hierarchy, feastName]);

  const answer = useCallback(async (intent: AngelIntent, raw: string): Promise<Omit<Message, "id">> => {
    switch (intent.kind) {
      case "too-short":
        return { from: "angel", text: "Type a bit more — a name, a registration number, a shakha or a competition." };
      case "greeting": {
        if (intent.variant === "thanks") return { from: "angel", text: "You're welcome! Ask me anything else about the fest." };
        if (intent.variant === "night") return { from: "angel", text: "Good night! Come back any time for the latest results." };
        const hello = { hello: "Hi", morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }[intent.variant];
        const first = profile?.full_name?.trim().split(/\s+/)[0];
        return { from: "angel", text: `${hello}${first ? ` ${first}` : ""}! What would you like to know?`, chips: starterChips };
      }
      case "schedule":
        return answerSchedule(intent.matches);
      case "stage":
        return answerStage(intent.number, intent.feastSlug);
      case "help":
        return { from: "angel", text: "The help page has step-by-step guides with pictures.", chips: [{ label: "Open help", href: "/help" }] };
      case "top":
        return answerTop(intent.tier, intent.feastSlug, intent.within);
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
      case "registrations": {
        if (!profile) {
          return { from: "angel", text: "Sign in with your branch's admin account and I can tell you what you've registered and what's left.", chips: [{ label: "Sign in", href: "/admin/login" }] };
        }
        if (!adminScope) {
          return { from: "angel", text: "Your account isn't assigned to a shakha, so there's no branch to check. Branch admin accounts can ask this." };
        }
        const slug = intent.feastSlug ?? (feasts.length === 1 ? feasts[0].slug : null);
        if (slug) return answerRegistrations(adminScope, intent.mode, slug);
        return {
          from: "angel",
          text: "Which fest?",
          chips: feasts.map((f) => ({ label: f.name, run: () => { void answerRegistrations(adminScope, intent.mode, f.slug).then(push); } })),
        };
      }
    }
  }, [answerTop, answerEntity, competitionAnswer, answerParticipant, answerRegistrations, answerSchedule, answerStage, profile, adminScope, feasts, starterChips, push]);

  // The AI's reading when it points at something real, else the keyword
  // router's. Once the server says the AI isn't configured, stop asking.
  const readIntent = useCallback(async (raw: string): Promise<AngelIntent> => {
    const local = resolveIntent(raw, context);
    if (local.kind === "too-short" || local.kind === "greeting" || aiOff.current) return local;
    const res = await readAngelQuestion(raw).catch(() => null);
    if (res?.disabled) aiOff.current = true;
    return (res?.data && intentFromAi(res.data, context)) || local;
  }, [context]);

  async function send(text: string) {
    const raw = text.trim();
    if (!raw || thinking) return;
    setInput("");
    push({ from: "user", text: raw });
    setThinking(true);
    try {
      const [reply] = await Promise.all([readIntent(raw).then((intent) => answer(intent, raw)), sleep(MIN_THINK_MS)]);
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

interface ScheduleRow { key: string; title: string; sub: string; status: { label: string; live: boolean } }

function ScheduleList({ rows }: { rows: ScheduleRow[] }) {
  return (
    <div className="fp-scroll flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2.5 px-3 py-2.5" style={CARD}>
          <span className="min-w-0 flex-1">
            <span className="fp-ml block truncate text-[14px] font-extrabold">{r.title}</span>
            {r.sub && <span className="fp-ml block truncate text-[11.5px] font-bold" style={{ color: "var(--fp-sub)" }}>{r.sub}</span>}
          </span>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
            style={r.status.live ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: "var(--fp-muted-bg)", color: "var(--fp-muted-fg)" }}
          >
            {r.status.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function SlotList({ items, mode }: { items: ItemSlots[]; mode: "registered" | "left" }) {
  return (
    <div className="fp-scroll flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2.5 px-3 py-2.5" style={CARD}>
          <span className="min-w-0 flex-1">
            <span className="fp-ml block truncate text-[14px] font-extrabold">{i.name}</span>
            {(i.label || i.team) && (
              <span className="block truncate text-[11.5px] font-bold" style={{ color: "var(--fp-sub)" }}>
                {[i.label, i.team ? "Team" : ""].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          <span className="shrink-0 text-right">
            <span className="fp-num block text-[16px]" style={{ color: "var(--fp-gold-ink)" }}>
              {mode === "left" ? i.cap - i.filled : i.filled}
            </span>
            <span className="block text-[10.5px] font-bold" style={{ color: "var(--fp-meta)" }}>
              {mode === "left" ? `left of ${i.cap}` : `of ${i.cap}${i.team ? " members" : ""}`}
            </span>
          </span>
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
