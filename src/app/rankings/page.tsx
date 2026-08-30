import { Suspense } from "react";
import { FeastShell } from "@/components/feast/feast-shared";
import { FeastLeaderboard } from "@/components/feast/feast-leaderboard";

export default function RankingsPage() {
  return (
    <FeastShell>
      <Suspense>
        <FeastLeaderboard />
      </Suspense>
    </FeastShell>
  );
}
