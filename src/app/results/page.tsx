import { Suspense } from "react";
import { FeastShell } from "@/components/feast/feast-shared";
import { FeastResults } from "@/components/feast/feast-results";

export default function ResultsPage() {
  return (
    <FeastShell>
      <Suspense>
        <FeastResults />
      </Suspense>
    </FeastShell>
  );
}
