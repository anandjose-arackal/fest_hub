"use client";

// Search → "Results by …": every published place and grade that one
// top-level group (shakha, meghala or diocese — whichever level the org runs
// at) won in a fest, item by item, grouped by age group.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getGroupResults, type GroupLevel, type GroupResultCompetition, type GroupResultEntry } from "@/actions/results";
import { feastPosterHeading } from "@/lib/feast-data";
import { CATEGORY_LABELS, catStyle, mix, theme } from "./feast-shared";
import { ResultRow, competitionCategoryLabel, type PublicResultRow } from "./feast-shared-results";
import { GradeBadge, MedalCounts } from "./feast-ui";
import { SocialPosterOverlay, type SocialPosterWinner } from "./social-poster/social-poster-overlay";

export const GROUP_LEVEL_LABEL: Record<GroupLevel, { one: string; many: string }> = {
  shakha: { one: "Shakha", many: "Shakhas" },
  meghala: { one: "Meghala", many: "Meghalas" },
  diocese: { one: "Diocese", many: "Dioceses" },
};

function toRow(e: GroupResultEntry): PublicResultRow {
  return { registrationId: e.id, name: e.name, houseName: e.houseName, shakha: e.shakha, grade: e.grade, position: e.position, totalPoints: e.totalPoints, isTeam: e.isTeam };
}

function compLabel(c: GroupResultCompetition): string {
  return competitionCategoryLabel({ cat: c.isTeam ? "Team" : "Individual", competitionCategorySlug: c.categorySlug, gender: c.gender });
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="fp-num text-[28px] leading-none" style={{ color: theme.text }}>{value}</span>
      <span className="fp-cap text-[9.5px]" style={{ color: theme.faint }}>{label}</span>
    </span>
  );
}

export function GroupResults({ feast, level, group }: {
  feast: { slug: string; name: string; type: string };
  level: GroupLevel;
  group: { id: string; name: string };
}) {
  const key = `${feast.slug}|${level}|${group.id}`;
  const [state, setState] = useState<{ key: string; data?: GroupResultCompetition[]; error?: string } | null>(null);
  const [poster, setPoster] = useState<SocialPosterWinner | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGroupResults(feast.slug, level, group.id).then((res) => {
      if (!cancelled) setState({ key, ...res });
    });
    return () => { cancelled = true; };
  }, [key, feast.slug, level, group.id]);

  if (!state || state.key !== key) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-[13px] font-bold" style={{ color: theme.sub }} role="status">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.lavender }} aria-hidden="true" />
        Loading {group.name} results…
      </div>
    );
  }
  if (state.error) {
    return <p className="mt-5 rounded-[18px] px-4 py-5 text-center text-[13.5px] font-semibold" style={{ background: theme.surface3, color: theme.sub }}>{state.error}</p>;
  }

  const comps = state.data ?? [];
  if (comps.length === 0) {
    return (
      <div className="mt-5 rounded-[20px] px-5 py-7 text-center" style={{ border: `1.5px dashed ${theme.line2}` }}>
        <p className="m-0 text-[16px] font-extrabold" style={{ color: theme.text }}>No results for {group.name} yet</p>
        <p className="m-0 mt-1.5 text-[13px] font-semibold leading-relaxed" style={{ color: theme.sub }}>Places and grades show up here as each item&apos;s results are published.</p>
      </div>
    );
  }

  const tally = { 1: 0, 2: 0, 3: 0, A: 0, B: 0, C: 0, points: 0, entries: 0 };
  for (const c of comps) {
    for (const e of c.entries) {
      tally.entries += 1;
      tally.points += e.totalPoints;
      if (e.position === 1 || e.position === 2 || e.position === 3) tally[e.position] += 1;
      if (e.grade) tally[e.grade] += 1;
    }
  }

  // Sections by age group, keeping the server's order (team events last).
  const sections: { key: string; slug: string | null; label: string; comps: GroupResultCompetition[] }[] = [];
  for (const c of comps) {
    const k = c.isTeam ? "team" : c.categorySlug ?? "other";
    let s = sections.find((x) => x.key === k);
    if (!s) {
      s = { key: k, slug: c.isTeam ? null : c.categorySlug, label: c.isTeam ? "Team events" : CATEGORY_LABELS[c.categorySlug ?? ""] ?? "Other items", comps: [] };
      sections.push(s);
    }
    s.comps.push(c);
  }

  return (
    <div className="pt-5">
      <section aria-labelledby="fp-group-h" className="fp-fade-up rounded-[24px] p-4 sm:p-5" style={{ background: theme.surface2, border: `1px solid ${theme.line}`, boxShadow: theme.shadow }}>
        <div className="fp-cap text-[10.5px]" style={{ color: theme.goldInk }}>{GROUP_LEVEL_LABEL[level].one} results · <span className="fp-ml normal-case tracking-normal">{feast.name}</span></div>
        <h2 id="fp-group-h" className="fp-disp m-0 mt-2 text-[34px] leading-[1.05] xl:text-[44px]">{group.name}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-x-7 gap-y-3">
          <Stat value={tally.points} label="Points" />
          <Stat value={comps.length} label={comps.length === 1 ? "Item" : "Items"} />
          <Stat value={tally.entries} label={tally.entries === 1 ? "Result" : "Results"} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t pt-3.5" style={{ borderColor: theme.line }}>
          <MedalCounts g={tally[1]} s={tally[2]} b={tally[3]} size={12} className="text-[13.5px]" />
          <span className="flex items-center gap-3" aria-label={`Grades: ${tally.A} A, ${tally.B} B, ${tally.C} C`}>
            {(["A", "B", "C"] as const).map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold tabular-nums" style={{ color: theme.sub }} aria-hidden="true">
                <GradeBadge grade={g} size={20} />
                {tally[g]}
              </span>
            ))}
          </span>
        </div>
      </section>

      {sections.map((s) => {
        const cs = catStyle(s.slug);
        return (
          <section key={s.key} aria-labelledby={`fp-group-sec-${s.key}`} className="pt-6">
            <div className="flex items-center gap-3 px-1 pb-3">
              <h3 id={`fp-group-sec-${s.key}`} className="fp-cap m-0 flex items-center gap-2 text-[11px]" style={{ color: cs.ink }}>
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: cs.color, boxShadow: `0 0 8px ${cs.color}` }} />
                {s.label}
              </h3>
              <span aria-hidden="true" className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${theme.line2}, transparent)` }} />
              <span className="text-[11.5px] font-bold" style={{ color: theme.faint }}>{s.comps.length} {s.comps.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {s.comps.map((c, ci) => {
                const label = compLabel(c);
                const ccs = catStyle(c.isTeam ? null : c.categorySlug);
                return (
                  <article
                    key={c.feastCompetitionId}
                    aria-labelledby={`fp-group-c-${c.feastCompetitionId}`}
                    className="fp-fade-up rounded-[22px] p-3 sm:p-3.5"
                    style={{ animationDelay: `${Math.min(ci, 6) * 0.04}s`, background: theme.surface, border: `1px solid ${theme.line}` }}
                  >
                    <header className="px-1 pb-2.5 pt-0.5">
                      <h4 id={`fp-group-c-${c.feastCompetitionId}`} className="fp-ml m-0 text-[17px] font-extrabold leading-snug" style={{ color: theme.text }}>{c.name}</h4>
                      {label && (
                        <span className="mt-1.5 inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: mix(ccs.color, 16), color: ccs.ink }}>{label}</span>
                      )}
                    </header>
                    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {c.entries.map((e, i) => (
                        <ResultRow
                          key={e.id}
                          row={toRow(e)}
                          delay={Math.min(i, 6) * 0.04}
                          onGeneratePoster={(row) =>
                            setPoster({
                              rank: row.position as 1 | 2 | 3,
                              winnerName: row.name,
                              houseName: row.houseName,
                              shakhaName: row.shakha,
                              competitionName: c.name,
                              categoryLabel: label,
                              feastName: feastPosterHeading(feast),
                            })
                          }
                        />
                      ))}
                    </ol>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {poster && <SocialPosterOverlay winner={poster} onClose={() => setPoster(null)} />}
    </div>
  );
}
