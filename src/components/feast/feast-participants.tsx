"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2, Church, History, ChevronRight, ChevronDown, MapPin } from "lucide-react";
import { useFeast, useFeasts, useOrgHierarchy, useShakhas } from "@/hooks/use-feast";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getLeaderboard, searchParticipantResults, type LeaderboardRow, type ParticipantSearchRow } from "@/actions/results";
import { CATEGORY_LABELS, FeastTopBar, catStyle, theme } from "./feast-shared";
import { Chip, Eyebrow, GradeBadge, Medal, MedalCounts, isMedalPos, toneTextClass } from "./feast-ui";
import { GROUP_LEVEL_LABEL, GroupResults } from "./feast-group-results";

type Scope = "all" | "people" | "shakhas" | "items";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "people", label: "Participants" },
  { key: "shakhas", label: "Shakhas" },
  { key: "items", label: "Items" },
];
const RECENT_KEY = "fp-recent-searches";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode / blocked) — recent searches are a convenience only.
  }
}

function Hit({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="fp-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function placeLabel(p: number | null): string | null {
  return p === 1 ? "1st" : p === 2 ? "2nd" : p === 3 ? "3rd" : null;
}

function ParticipantCard({ row, q, delay }: { row: ParticipantSearchRow; q: string; delay: number }) {
  const cat = catStyle(row.category);
  const catLabel = row.category ? CATEGORY_LABELS[row.category] ?? row.category : null;
  return (
    <article
      className="fp-fade-up flex flex-col gap-3 rounded-[20px] p-4"
      style={{ animationDelay: `${delay}s`, ...theme.glassStrong, background: theme.surface2, border: `1px solid ${theme.line}` }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold" style={{ background: "var(--fp-btn-alt)", color: "var(--fp-btn-alt-fg)" }}>
          {initials(row.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="fp-ml text-[17px] font-extrabold leading-tight" style={{ color: theme.text }}><Hit text={row.name} q={q} /></span>
          {row.houseName && <span className="fp-ml text-[13.5px] font-semibold" style={{ color: theme.sub }}><Hit text={row.houseName} q={q} /></span>}
          <span className="mt-0.5 inline-flex min-w-0 items-center gap-[5px] text-[12.5px] font-extrabold" style={{ color: "var(--fp-link)" }}>
            <Church className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
            <span className="truncate"><Hit text={row.shakha} q={q} />{row.meghalaName ? ` · ${row.meghalaName}` : ""}</span>
          </span>
        </div>
        {row.regNo && (
          <span className="fp-num shrink-0 rounded-lg px-[9px] py-1.5 text-[14px]" style={{ border: "1.5px dashed var(--fp-note-line)", background: "var(--fp-note-bg)", color: theme.goldInk }} aria-label={`Registration number ${row.regNo}`}>
            <Hit text={row.regNo} q={q} />
          </span>
        )}
      </div>
      {row.results.length === 0 ? (
        <p className="m-0 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold" style={{ background: theme.surface3, color: theme.faint }}>No competitions registered</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {row.results.map((x, i) => {
            const pos = x.isPublished && isMedalPos(x.position) ? x.position : null;
            const place = x.isPublished ? placeLabel(x.position) ?? (x.grade ? "Graded" : "Participated") : "Results pending";
            return (
              <li key={`${x.competitionId}-${i}`} className="flex items-center gap-2.5 rounded-xl px-2.5 py-[9px]" style={{ background: theme.surface3 }}>
                {pos ? <Medal pos={pos} size={26} /> : <span aria-hidden="true" className="h-[26px] w-[26px] shrink-0 rounded-full" style={{ border: `1.5px dashed ${theme.line2}` }} />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="fp-ml text-[15px] font-bold leading-[1.3]" style={{ color: theme.text }}>{x.competitionName}</span>
                  <span className="text-[11.5px] font-extrabold tracking-[0.04em]" style={{ color: x.isPublished ? cat.ink : theme.faint }}>
                    {place}{catLabel ? ` · ${catLabel}` : ""}
                  </span>
                </span>
                {x.isPublished && x.grade && <GradeBadge grade={x.grade} size={28} />}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export function FeastParticipants() {
  const router = useRouter();
  const search = useSearchParams();
  const { feasts } = useFeasts();
  const { shakhas } = useShakhas();
  const [activeSlug, setActiveSlug] = useState(search.get("feast") ?? "");
  const { feast } = useFeast(activeSlug);
  // "Results by …": one top-level group's results (the org's own level —
  // shakhas, meghalas or dioceses), shown while the search box is empty.
  const hierarchy = useOrgHierarchy();
  const level = hierarchy.hierarchyLevel;
  const groups = level === "diocese" ? hierarchy.dioceses : level === "meghala" ? hierarchy.meghalas : hierarchy.shakhas;
  const [groupId, setGroupId] = useState(search.get("group") ?? "");
  const activeGroup = groups.find((g) => g.id === groupId) ?? null;
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [results, setResults] = useState<ParticipantSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");
  const [board, setBoard] = useState<{ slug: string; rows: LeaderboardRow[] } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setRecent(readRecent()));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (feasts.length > 0 && !feasts.find((f) => f.slug === activeSlug)) setActiveSlug(feasts[0].slug);
  }, [feasts, activeSlug]);

  // Standings for the shakha matches (rank, points, medals) — fetched once per fest.
  useEffect(() => {
    if (!activeSlug || !isSupabaseConfigured) return;
    let cancelled = false;
    getLeaderboard(activeSlug).then(({ data }) => { if (!cancelled) setBoard({ slug: activeSlug, rows: data ?? [] }); });
    return () => { cancelled = true; };
  }, [activeSlug]);

  function doSearch(q: string, feastSlug: string) {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim() || !feastSlug) { setResults([]); setSearchedFor(""); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const { data } = await searchParticipantResults(feastSlug, q.trim());
      setResults(data ?? []);
      setSearchedFor(q.trim());
      setLoading(false);
      if (q.trim().length >= 2) { saveRecent(q.trim()); setRecent(readRecent()); }
    }, 350);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    doSearch(v, activeSlug);
  }

  function searchUrl(feastSlug: string, group: string) {
    const params = new URLSearchParams({ feast: feastSlug });
    if (group) params.set("group", group);
    return `/search?${params.toString()}`;
  }

  function handleGroupChange(id: string) {
    setGroupId(id);
    router.replace(searchUrl(activeSlug, id), { scroll: false });
  }

  function handleFeastChange(s: string) {
    setActiveSlug(s);
    router.replace(searchUrl(s, groupId));
    setResults([]);
    setSearchedFor("");
    if (query.trim()) doSearch(query, s);
  }

  function clearQuery() {
    if (debounce.current) clearTimeout(debounce.current);
    setQuery("");
    setResults([]);
    setSearchedFor("");
    setLoading(false);
  }

  const q = query.trim();
  const ql = q.toLowerCase();
  const boardRows = board?.slug === activeSlug ? board.rows : [];
  const shakhaHits = q
    ? shakhas
        .filter((s) => s.name.toLowerCase().includes(ql))
        .slice(0, 6)
        .map((s) => ({ shakha: s, standing: boardRows.find((r) => r.shakhaId === s.id) }))
    : [];
  const itemHits = q && feast?.slug === activeSlug ? feast.competitions.filter((c) => c.name.toLowerCase().includes(ql)).slice(0, 12) : [];
  const people = searchedFor === q ? results : [];
  const showPeople = scope === "all" || scope === "people";
  const showShakhas = scope === "all" || scope === "shakhas";
  const showItems = scope === "all" || scope === "items";
  const anyHits = (showPeople && people.length > 0) || (showShakhas && shakhaHits.length > 0) || (showItems && itemHits.length > 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="pb-6">
      <FeastTopBar title="Search" />

      <section className="px-1 pt-2">
        <Eyebrow>{feast ? `Fests ${feast.year}` : "Fests"}</Eyebrow>
        <h1 className="fp-disp m-0 mt-3 text-[58px] xl:text-[80px]">Search</h1>
        <p className="m-0 mt-2.5 text-[14.5px] font-semibold" style={{ color: theme.sub }}>Any participant, shakha, item, house or registration number</p>
      </section>

      <div className="mx-auto max-w-3xl xl:mx-0">
        <div className="relative mt-5">
          <label htmlFor="fp-search" className="sr-only">Search participant, shakha or item</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: theme.lavender }} aria-hidden="true" />
          <input
            id="fp-search"
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search participant, shakha or item"
            autoComplete="off"
            className="fp-ml h-[58px] w-full rounded-[18px] pl-12 pr-14 text-[16px] font-bold outline-none [&::-webkit-search-cancel-button]:hidden"
            style={{ background: "var(--fp-input)", color: theme.text, border: "1.5px solid var(--fp-primary-light)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--fp-primary) 12%, transparent), var(--fp-shadow)" }}
          />
          {query && (
            <button type="button" onClick={clearQuery} aria-label="Clear search" className="absolute right-[7px] top-[7px] flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: theme.surface3, color: theme.text }}>
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        {feasts.length > 1 && (
          <div className="fp-scroll -mx-4 mt-3.5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
            {feasts.map((f) => (
              <Chip key={f.slug} ml on={f.slug === activeSlug} onClick={() => handleFeastChange(f.slug)}>{f.name}</Chip>
            ))}
          </div>
        )}
        {/* Phones: the group picker sits under the chips. Big screens: it
            joins the chip row, chip-sized, after a divider. */}
        <div className="lg:mt-2.5 lg:flex lg:flex-wrap lg:items-center lg:gap-2">
          <div role="group" aria-label="Search in" className="fp-scroll -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0 lg:mt-0">
            {SCOPES.map((s) => <Chip key={s.key} on={scope === s.key} onClick={() => setScope(s.key)}>{s.label}</Chip>)}
          </div>

          {groups.length > 0 && (
            <>
              <span aria-hidden="true" className="mx-1 hidden h-6 w-px lg:block" style={{ background: theme.line2 }} />
              <div className="mt-3 lg:mt-0">
                <label htmlFor="fp-group" className="sr-only">Results by {GROUP_LEVEL_LABEL[level].one}</label>
                <div className="relative sm:w-[340px] lg:w-[240px]">
                  <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 lg:left-3 lg:h-4 lg:w-4" style={{ color: activeGroup ? theme.lavender : theme.faint }} aria-hidden="true" />
                  <select
                    id="fp-group"
                    value={activeGroup ? groupId : ""}
                    onChange={(e) => handleGroupChange(e.target.value)}
                    className="h-12 w-full cursor-pointer appearance-none rounded-[14px] pl-11 pr-10 text-[14.5px] font-bold outline-none focus-visible:[box-shadow:0_0_0_4px_color-mix(in_srgb,var(--fp-primary)_18%,transparent)] lg:h-[38px] lg:rounded-full lg:pl-9 lg:pr-9 lg:text-[12.5px] lg:font-extrabold"
                    style={{ background: activeGroup ? "var(--fp-input)" : theme.surface, color: activeGroup ? theme.text : theme.sub, border: `1px solid ${activeGroup ? "var(--fp-primary-light)" : theme.line2}` }}
                  >
                    <option value="">Results by {GROUP_LEVEL_LABEL[level].one.toLowerCase()}…</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 lg:right-3 lg:h-4 lg:w-4" style={{ color: theme.faint }} aria-hidden="true" />
                </div>
              </div>
            </>
          )}
        </div>
        {activeGroup && q && (
          <p className="m-0 mt-2 px-1 text-[12px] font-semibold" style={{ color: theme.faint }}>Clear the search box to see {activeGroup.name}&apos;s results</p>
        )}

        {!isSupabaseConfigured ? (
          <div className="flex flex-col items-center gap-3 py-16"><Search className="h-7 w-7" style={{ color: theme.faint }} /><p className="text-center text-sm" style={{ color: theme.sub }}>Search requires a database connection.</p></div>
        ) : !q && activeGroup && feast?.slug === activeSlug ? (
          <GroupResults feast={feast} level={level} group={activeGroup} />
        ) : !q ? (
          <section className="px-1 pt-[22px]">
            {recent.length > 0 ? (
              <>
                <div className="fp-cap pb-3 text-[10.5px]" style={{ color: theme.sub }}>Recent</div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button key={r} type="button" onClick={() => handleQueryChange(r)} className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[14px] font-bold" style={{ background: theme.surface, border: `1px solid ${theme.line}`, color: theme.text }}>
                      <History className="h-4 w-4" style={{ color: theme.faint }} aria-hidden="true" />
                      <span className="fp-ml">{r}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[20px] px-5 py-7 text-center" style={{ border: `1.5px dashed ${theme.line2}` }}>
                <p className="m-0 text-[16px] font-extrabold" style={{ color: theme.text }}>Find anyone in the fest</p>
                <p className="m-0 mt-1.5 text-[13px] font-semibold leading-relaxed" style={{ color: theme.sub }}>Type a name, a house name, a registration number like F1042, a shakha or an item in Malayalam.</p>
              </div>
            )}
          </section>
        ) : (
          <div aria-live="polite">
            <div className="flex items-center gap-2 px-1 pb-2.5 pt-5 text-[13px] font-bold" style={{ color: theme.sub }}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.lavender }} aria-hidden="true" />}
              {loading ? "Searching…" : [plural(people.length, "participant"), plural(shakhaHits.length, "shakha"), plural(itemHits.length, "item")].join(" · ")}
            </div>

            {showShakhas && shakhaHits.length > 0 && (
              <section className="pt-1.5">
                <div className="fp-cap px-1 pb-2.5 text-[10.5px]" style={{ color: theme.goldInk }}>Shakhas</div>
                <div className="flex flex-col gap-2">
                  {shakhaHits.map(({ shakha, standing }, i) => {
                    const pos = standing && isMedalPos(standing.rank) ? standing.rank : null;
                    return (
                      <Link
                        key={shakha.id}
                        href={`/rankings?feast=${activeSlug}&tier=shakha`}
                        className="fp-fade-up flex items-center gap-3 rounded-[18px] p-3.5"
                        style={{ animationDelay: `${i * 0.05}s`, background: pos ? `var(--fp-tone-${pos === 1 ? "gold" : pos === 2 ? "silver" : "bronze"}-bg)` : theme.surface, border: `1px solid ${pos ? `var(--fp-tone-${pos === 1 ? "gold" : pos === 2 ? "silver" : "bronze"}-line)` : theme.line}`, color: theme.text }}
                      >
                        <span className={`fp-num w-[30px] shrink-0 text-[22px] ${pos ? toneTextClass(pos) : ""}`} style={{ color: pos ? undefined : theme.faint }}>
                          {standing ? String(standing.rank).padStart(2, "0") : "–"}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="truncate text-[16.5px] font-extrabold"><Hit text={shakha.name} q={q} /></span>
                          {standing ? <MedalCounts g={standing.firstCount} s={standing.secondCount} b={standing.thirdCount} size={11} className="text-[12.5px]" /> : <span className="text-[12.5px] font-bold" style={{ color: theme.faint }}>No points yet</span>}
                        </span>
                        {standing && (
                          <span className="flex flex-col items-end gap-1">
                            <span className="fp-num text-[24px]">{standing.points}</span>
                            <span className="fp-cap text-[9px]" style={{ color: theme.faint }}>pts</span>
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {showPeople && people.length > 0 && (
              <section className="pt-2.5">
                <div className="fp-cap px-1 pb-2.5 text-[10.5px]" style={{ color: theme.goldInk }}>Participants</div>
                <div className="grid gap-2.5 xl:grid-cols-2">
                  {people.map((row, i) => <ParticipantCard key={row.participantId} row={row} q={q} delay={Math.min(i, 8) * 0.05} />)}
                </div>
              </section>
            )}

            {showItems && itemHits.length > 0 && (
              <section className="pt-4">
                <div className="fp-cap px-1 pb-2.5 text-[10.5px]" style={{ color: theme.goldInk }}>Items</div>
                <div className="flex flex-col gap-2">
                  {itemHits.map((c, i) => {
                    const cs = catStyle(c.cat === "Team" ? null : c.competitionCategorySlug);
                    const out = c.compStatus === "published";
                    const meta = [c.cat === "Team" ? "Team" : CATEGORY_LABELS[c.competitionCategorySlug ?? ""], c.gender === "girl" ? "Girls" : c.gender === "boy" ? "Boys" : null, c.filled > 0 ? `${c.filled} participants` : null].filter(Boolean).join(" · ");
                    return (
                      <Link
                        key={c.id}
                        href={`/results?feast=${activeSlug}`}
                        className="fp-fade-up flex items-center gap-3 rounded-2xl px-3.5 py-[13px]"
                        style={{ animationDelay: `${i * 0.05}s`, background: theme.surface, border: `1px solid ${theme.line}`, color: theme.text }}
                      >
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cs.color, boxShadow: `0 0 10px ${cs.color}` }} />
                        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                          <span className="fp-ml text-[16px] font-bold leading-[1.3]"><Hit text={c.name} q={q} /></span>
                          {meta && <span className="text-[12px] font-bold" style={{ color: theme.sub }}>{meta}</span>}
                        </span>
                        <span className="text-[11.5px] font-extrabold" style={{ color: out ? theme.goldInk : theme.faint }}>{out ? "Results out" : "Awaiting"}</span>
                        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: theme.faint }} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {!loading && !anyHits && (
              <div className="mt-2.5 rounded-[20px] px-5 py-7 text-center" style={{ border: `1.5px dashed ${theme.line2}` }}>
                <p className="m-0 text-[16px] font-extrabold" style={{ color: theme.text }}>No matches yet</p>
                <p className="m-0 mt-1.5 text-[13px] font-semibold leading-relaxed" style={{ color: theme.sub }}>Try a shorter name, a house name, a registration number like F1042, or an item in Malayalam.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
