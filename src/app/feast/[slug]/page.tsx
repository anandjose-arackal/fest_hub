import { FeastShell } from "@/components/feast/feast-shared";
import { FeastDetails } from "@/components/feast/feast-details";

export default async function FeastDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      <FeastDetails slug={slug} />
    </FeastShell>
  );
}
