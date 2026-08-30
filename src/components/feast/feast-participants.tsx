"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, ChevronDown, Loader2 } from "lucide-react";
import { useFeasts, useShakhas, type FeastUI } from "@/hooks/use-feast";
import { isSupabaseConfigured } from "@/lib/supabase";
import { searchParticipantResults, type ParticipantSearchRow } from "@/actions/results";
import { FeastTopBar, theme, CATEGORY_LABELS } from "./feast-shared";

type FeastKind = "literature" | "arts";
function feastKind(f: FeastUI): FeastKind | null {
  const t = (f.slug + " " + f.name).toLowerCase();
  if (t.includes("literature")) return "literature";
  if (t.includes("arts")) return "arts";
  return null;
}
const KIND_GRAD: Record<FeastKind, string> = { literature: "linear-gradient(135deg,#6B46FF,#A78BFA)", arts: "linear-gradient(135deg,#A855F7,#EC4899)" };
const KIND_COLOR: Record<FeastKind, string> = { literature: "#7C3AED", arts: "#C026D3" };

const POS_STYLE: Record<number, { bg: string; border: string; text: string; emoji: string }> = {
  1: { bg: "#FFFBEB", border: "#F5C542", text: "#92400E", emoji: "🥇" },
  2: { bg: "#F9FAFB", border: "#9CA3AF", text: "#374151", emoji: "🥈" },
  3: { bg: "#FFF7ED", border: "#E0936A", text: "#7C2D12", emoji: "🥉" },
};
const GRADE_BG: Record<string, string> = { A: "#16A34A", B: "#D97706", C: "#6B46FF" };

function PosBadge({ pos }: { pos: number }) {
  const s = POS_STYLE[pos];
  if (!s) return null;
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold" style={{ background: s.bg, borderColor: s.border, color: s.text }}>{s.emoji} {pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd"}</span>;
}
function GradeBadge({ grade }: { grade: "A" | "B" | "C" }) {
  return <span className="inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: GRADE_BG[grade] }}>Grade {grade}</span>;
}

function ParticipantCard({ row, color }: { row: ParticipantSearchRow; color: string }) {
  const [open, setOpen] = useState(false);
  const published = row.results.filter((r) => r.isPublished);
  const totalPts = published.reduce((a, r) => a + r.totalPoints, 0);

  return (
    <div className="relative mb-2.5 overflow-hidden rounded-2xl" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", border: open ? `1.5px solid ${color}44` : "1px solid rgba(255,255,255,0.8)" }}>
      <div className="absolute inset-y-0 left-0 w-[3.5px]" style={{ background: color }} />
      <button onClick={() => setOpen((o) => !o)} className="w-full pb-2.5 pl-4 pr-3 pt-3 text-left">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <p className="text-[16px] leading-tight" style={{ fontFamily: "var(--font-anek), sans-serif", fontWeight: 700, color: theme.text }}>{row.name}</p>
              {row.houseName && <span className="text-[13.5px]" style={{ color: "#7C3AED" }}><span style={{ color: "#DDD6FE" }}>| </span>{row.houseName}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-sm" style={{ background: `${color}1a`, color }}>⛪ {row.shakha}</span>
              {row.category && <span className="rounded-lg px-2 py-0.5 text-xs" style={{ background: "rgba(124,58,237,0.12)", color: "#6D28D9" }}>{CATEGORY_LABELS[row.category] ?? row.category}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {row.regNo && (
              <span className="rounded-[5px] px-3.5 py-1.5 text-[15px] font-extrabold tracking-wide" style={{ background: "#FCD34D", color: "#451A03", border: "1px dashed rgba(120,53,15,0.4)" }}>{row.regNo}</span>
            )}
            {totalPts > 0 && <span className="text-[11px]" style={{ color: "#7C3AED" }}>{totalPts} pts</span>}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[11px] font-semibold" style={{ color: "#9CA3AF" }}>{row.results.length} competition{row.results.length !== 1 ? "s" : ""}</span>
          <div className="flex gap-1">
            {published.filter((r) => r.grade).slice(0, 4).map((r, i) => <span key={i} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: GRADE_BG[r.grade!] }}>{r.grade}</span>)}
            {published.filter((r) => r.position != null && r.position! <= 3).slice(0, 3).map((r, i) => <span key={`p${i}`} className="text-[11px]">{POS_STYLE[r.position!]?.emoji}</span>)}
          </div>
          <div className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform" style={{ background: color, transform: open ? "rotate(180deg)" : undefined }}><ChevronDown className="h-[15px] w-[15px] text-white" strokeWidth={3} /></div>
        </div>
      </button>
      {open && (
        <div className="mx-3 mb-3 overflow-hidden rounded-xl" style={{ background: "rgba(107,70,255,0.04)" }}>
          {row.results.length === 0 ? (
            <p className="py-5 text-center text-[13px]" style={{ color: "#9CA3AF" }}>No competitions registered</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(107,70,255,0.07)" }}>
              {row.results.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{item.competitionName}</p>
                    {!item.isPublished && <p className="mt-0.5 text-[11px]" style={{ color: "#9CA3AF" }}>Results pending</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.isPublished ? (
                      <>
                        {item.position != null && item.position <= 3 && <PosBadge pos={item.position} />}
                        {item.grade && <GradeBadge grade={item.grade} />}
                        {!item.grade && !item.position && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(107,70,255,0.1)", color: "#8B5CF6" }}>{item.totalPoints > 0 ? `${item.totalPoints} pts` : "—"}</span>}
                      </>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(156,163,175,0.15)", color: "#9CA3AF" }}>Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FeastParticipants() {
  const router = useRouter();
  const search = useSearchParams();
  const { feasts } = useFeasts();
  const { shakhas } = useShakhas();
  const [activeSlug, setActiveSlug] = useState(search.get("feast") ?? "");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<ParticipantSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (feasts.length > 0 && !feasts.find((f) => f.slug === activeSlug)) setActiveSlug(feasts[0].slug);
  }, [feasts, activeSlug]);

  function doSearch(q: string, feastSlug: string) {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim() || !feastSlug) { setResults([]); setSearched(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      const { data } = await searchParticipantResults(feastSlug, q.trim());
      setResults(data ?? []);
      setLoading(false);
    }, 350);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    doSearch(v, activeSlug);
  }

  function handleFeastChange(s: string) {
    setActiveSlug(s);
    router.replace(`/search?feast=${s}`);
    setResults([]);
    setSearched(false);
    if (query.trim()) doSearch(query, s);
  }

  function clearQuery() {
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  const shakhaColor = (name: string) => shakhas.find((s) => s.name === name)?.color ?? "#A78BFA";

  return (
    <div>
      <FeastTopBar title="Participant Search" />

      {feasts.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {feasts.map((f) => {
            const on = f.slug === activeSlug;
            const k = feastKind(f);
            return (
              <button
                key={f.slug}
                onClick={() => handleFeastChange(f.slug)}
                className="shrink-0 rounded-[11px] px-3.5 py-1.5 text-[13px] font-bold"
                style={on ? { background: k ? KIND_GRAD[k] : "linear-gradient(135deg,#6B46FF,#A78BFA)", color: "#fff", boxShadow: `0 4px 14px ${k ? KIND_COLOR[k] : "#6B46FF"}44` } : { background: "rgba(255,255,255,0.7)", color: "#4B5563", border: "1px solid rgba(107,70,255,0.12)" }}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.82)", border: `1.5px solid ${focus ? "rgba(107,70,255,0.45)" : "rgba(107,70,255,0.18)"}` }}>
        <Search className="h-4 w-4" style={{ color: "#A78BFA" }} />
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder="Search participant name…"
          className="flex-1 border-none bg-transparent py-1 text-[15px] outline-none"
          style={{ fontFamily: "var(--font-anek), sans-serif", fontWeight: 600, color: theme.text }}
        />
        {query && <button onClick={clearQuery}><X className="h-3.5 w-3.5" style={{ color: "#9CA3AF" }} /></button>}
      </div>

      {!isSupabaseConfigured ? (
        <div className="flex flex-col items-center gap-3 py-16"><Search className="h-7 w-7" style={{ color: theme.faint }} /><p className="text-center text-sm" style={{ color: theme.sub }}>Search requires a database connection.</p></div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.lavender }} /></div>
      ) : searched && results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12"><Search className="h-[26px] w-[26px]" style={{ color: theme.faint }} /><p className="text-sm" style={{ color: theme.sub }}>No participants found for &quot;{query}&quot;</p></div>
      ) : !searched ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(107,70,255,0.08)" }}><Search className="h-7 w-7" style={{ color: "#A78BFA" }} /></div>
          <p className="text-[15px] font-semibold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>Search Participants</p>
          <p className="max-w-[220px] text-center text-[13px]" style={{ color: theme.sub }}>Type a participant name to see their competitions and results</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: "#A78BFA" }}>{results.length} participant{results.length !== 1 ? "s" : ""} found</p>
          {results.map((row) => <ParticipantCard key={row.participantId} row={row} color={shakhaColor(row.shakha)} />)}
        </>
      )}
    </div>
  );
}
