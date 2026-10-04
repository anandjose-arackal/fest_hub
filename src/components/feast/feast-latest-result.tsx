"use client";

// Dashboard "Latest result": the most recently published competition across
// the active fests, on the same white award card the Results page uses for an
// item's 1st–3rd. Hidden once that result is more than 4 days old (see
// getLatestResult).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, Clock, Trophy } from "lucide-react";
import { getLatestResult, type LatestResult } from "@/actions/results";
import { feastPosterHeading } from "@/lib/feast-data";
import { catStyle, mix, theme } from "./feast-shared";
import { AWARD, AwardCard, competitionCategoryLabel, mapResultRow, sortResults, timeAgo } from "./feast-shared-results";
import { isMedalPos } from "./feast-ui";
import { SocialPosterOverlay, type SocialPosterWinner } from "./social-poster/social-poster-overlay";

export function LatestResultWidget() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [poster, setPoster] = useState<SocialPosterWinner | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLatestResult().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const rows = sortResults(data.rows.map((r) => mapResultRow(r as Record<string, unknown>, data.isTeam)));
  const placed = rows.filter((r) => isMedalPos(r.position));
  if (placed.length === 0) return null;

  const cs = catStyle(data.isTeam ? null : data.categorySlug);
  const label = competitionCategoryLabel({ cat: data.isTeam ? "Team" : "Individual", competitionCategorySlug: data.categorySlug, gender: data.gender });
  const ago = timeAgo(data.publishedAt);

  return (
    <section aria-labelledby="latest-result-h" className="relative mt-7">
      <div aria-hidden="true" className="pointer-events-none absolute -inset-x-10 top-10 h-[380px]" style={{ background: "radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, var(--fp-gold) 20%, transparent) 0%, transparent 70%)" }} />
      <div className="relative flex items-end justify-between gap-3 px-1 pb-3">
        <div>
          <div className="fp-cap flex items-center gap-2 text-[10.5px]" style={{ color: theme.goldInk }}>
            <span className="fp-livedot h-[7px] w-[7px]" />
            Just published
          </div>
          <h2 id="latest-result-h" className="fp-disp m-0 mt-2 text-[34px] xl:text-[40px]">Latest result</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 pb-1 text-[12px] font-bold" style={{ color: theme.faint }}>
          <Clock className="h-[13px] w-[13px]" aria-hidden="true" />{ago}
        </span>
      </div>

      <div className="relative">
        <AwardCard
          rows={placed}
          accentColor={cs.color}
          onPoster={(row) =>
            setPoster({
              rank: row.position as 1 | 2 | 3,
              winnerName: row.name,
              houseName: row.houseName,
              shakhaName: row.shakha,
              competitionName: data.competitionName,
              categoryLabel: label,
              feastName: feastPosterHeading({ type: data.feastType, name: data.feastName }),
            })
          }
          header={
            <div className="flex items-start gap-3 px-[18px] pb-1 pt-4">
              <div className="min-w-0 flex-1">
                <span className="fp-ml inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-bold" style={{ background: "#EFEAFE", color: AWARD.link }}>{data.feastName}</span>
                <h3 className="fp-ml m-0 mt-2 text-[26px] font-bold leading-[1.3] sm:text-[30px]" style={{ color: AWARD.ink }}>{data.competitionName}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {label && (
                    <span className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: mix(cs.color, 16), color: AWARD.link }}>{label}</span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: AWARD.link }}>
                    <Award className="h-[13px] w-[13px]" aria-hidden="true" />
                    Final results
                  </span>
                </div>
              </div>
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] text-white" style={{ background: "linear-gradient(150deg, #6B46FF, #EC4899)", boxShadow: "0 8px 18px rgba(107,70,255,.3)" }}>
                <Trophy className="h-[22px] w-[22px]" />
              </span>
            </div>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-x-3 px-[18px] pb-3 pt-1">
              <span className="text-[12.5px] font-bold" style={{ color: AWARD.sub }}>
                Published {ago}{data.participants > 0 ? ` · ${data.participants} participants` : ""}
              </span>
              <Link href={`/results?feast=${data.feastSlug}`} className="inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-extrabold" style={{ color: AWARD.link }}>
                All results
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          }
        />
      </div>

      {poster && <SocialPosterOverlay winner={poster} onClose={() => setPoster(null)} />}
    </section>
  );
}
