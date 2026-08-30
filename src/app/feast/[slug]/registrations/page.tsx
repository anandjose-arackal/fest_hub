import { FeastShell } from "@/components/feast/feast-shared";
import { FeastRegistrations } from "@/components/feast/feast-registrations";

export default async function RegistrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      <FeastRegistrations slug={slug} />
    </FeastShell>
  );
}
