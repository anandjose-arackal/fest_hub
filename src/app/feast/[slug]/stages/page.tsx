import { FeastShell } from "@/components/feast/feast-shared";
import { FeastStages } from "@/components/feast/feast-stages";

export default async function StagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      <FeastStages slug={slug} />
    </FeastShell>
  );
}
