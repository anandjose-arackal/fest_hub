"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, RotateCw, Trophy } from "lucide-react";
import { getTrophyDashboard, type FestTrophySummary } from "@/actions/handover";
import { theme } from "@/components/feast/feast-shared";
import { Medal, ProgressBar } from "@/components/feast/feast-ui";
import { ActionButton, BUTTON_CLASS, Card, HandoverPanel, PageHeading, buttonStyle } from "@/components/admin/handover-ui";
import type { Position } from "@/lib/handover";

const STATUS_LABEL: Record<string, string> = {
  ongoing: "Ongoing",
  registration_open: "Registration open",
  completed: "Completed",
};

function pct(given: number, total: number) {
  return total === 0 ? 0 : Math.round((given / total) * 100);
}

function FestCard({ fest }: { fest: FestTrophySummary }) {
  const { counts } = fest;
  const empty = counts.total === 0;
  const complete = !empty && counts.given === counts.total;
  return (
    <Link href={`/admin/trophies/${fest.feastId}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fp-primary)] rounded-2xl">
      <Card className="h-full p-4 transition-transform hover:-translate-y-0.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="fp-ml truncate text-[16px] font-extrabold leading-tight" style={{ color: theme.text }}>{fest.name}</p>
            <p className="mt-0.5 text-[11.5px] font-bold" style={{ color: theme.sub }}>
              {STATUS_LABEL[fest.status] ?? fest.status}
              {" · "}
              {fest.publishedItems} published item{fest.publishedItems === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0" style={{ color: theme.faint }} />
        </div>

        {empty ? (
          <p className="rounded-xl px-3 py-4 text-center text-[13px] font-semibold" style={{ background: theme.surface3, color: theme.sub }}>
            No placed winners published yet
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <span className="fp-num text-[34px]" style={{ color: theme.text }}>{counts.given}</span>
                <span className="fp-num text-[18px]" style={{ color: theme.faint }}> / {counts.total}</span>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.sub }}>trophies given</p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[12px] font-extrabold"
                style={complete ? { background: "var(--fp-ok-bg)", color: "var(--fp-ok)" } : { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}
              >
                {complete ? "All given" : `${counts.total - counts.given} pending`}
              </span>
            </div>
            <ProgressBar pct={pct(counts.given, counts.total)} fill={complete ? "var(--fp-ok)" : "var(--fp-btn)"} height={8} />
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {([1, 2, 3] as Position[]).map((p) => {
                const c = counts.byPosition[p];
                return (
                  <li key={p} className="flex items-center gap-1.5 rounded-xl px-2 py-2" style={{ background: theme.surface3 }}>
                    <Medal pos={p} size={22} />
                    <span className="fp-num text-[15px]" style={{ color: theme.text }}>
                      {c.given}<span style={{ color: theme.faint }}>/{c.total}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </Link>
  );
}

export default function TrophyDashboardPage() {
  const [fests, setFests] = useState<FestTrophySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTrophyDashboard().then((res) => {
      if (cancelled) return;
      setRefreshing(false);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setFests(res.data ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <HandoverPanel>
      <PageHeading
        icon={<Trophy className="h-5 w-5" />}
        title="Trophy Dashboard"
        sub="Trophies handed over per fest — published results only"
        right={
          <div className="flex gap-2">
            <Link href="/admin/trophies/certificates" className={BUTTON_CLASS} style={buttonStyle("ghost")}>
              <Award className="h-4 w-4" /> Certificates
            </Link>
            <ActionButton tone="ghost" busy={refreshing} onClick={() => { setRefreshing(true); setReloadKey((k) => k + 1); }}>
              {!refreshing && <RotateCw className="h-4 w-4" />} Refresh
            </ActionButton>
          </div>
        }
      />

      {error && <p className="mb-3 rounded-xl px-3 py-2 text-sm font-bold" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}>{error}</p>}

      {fests === null && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl" style={{ background: theme.surface3 }} />)}
        </div>
      ) : fests && fests.length === 0 ? (
        <Card className="p-8 text-center text-sm font-semibold" style={{ color: theme.sub }}>No fests yet.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(fests ?? []).map((f) => <FestCard key={f.feastId} fest={f} />)}
        </div>
      )}
    </HandoverPanel>
  );
}
