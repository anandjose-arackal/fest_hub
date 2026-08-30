import { Suspense } from "react";
import { FeastShell } from "@/components/feast/feast-shared";
import { FeastSuccess } from "@/components/feast/feast-success";

export default async function SuccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      <Suspense>
        <FeastSuccess slug={slug} />
      </Suspense>
    </FeastShell>
  );
}
