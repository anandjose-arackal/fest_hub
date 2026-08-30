import { Suspense } from "react";
import { FeastShell } from "@/components/feast/feast-shared";
import { FeastParticipants } from "@/components/feast/feast-participants";

export default function SearchPage() {
  return (
    <FeastShell>
      <Suspense>
        <FeastParticipants />
      </Suspense>
    </FeastShell>
  );
}
