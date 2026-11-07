import { FeastShell } from "@/components/feast/feast-shared";
import { FeastStages, type StageView } from "@/components/feast/feast-stages";

// ?view=now|map|schedule opens that view directly (the dashboard links to each).
const VIEWS: StageView[] = ["now", "map", "schedule"];

export default async function StagesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const { view } = await searchParams;
  return (
    <FeastShell>
      <FeastStages slug={slug} initialView={VIEWS.find((v) => v === view)} />
    </FeastShell>
  );
}
