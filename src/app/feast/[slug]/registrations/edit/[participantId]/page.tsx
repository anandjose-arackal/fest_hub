import { FeastShell } from "@/components/feast/feast-shared";
import { FeastEditRegister } from "@/components/feast/feast-edit-register";

export default async function EditRegistrationPage({ params }: { params: Promise<{ slug: string; participantId: string }> }) {
  const { slug, participantId } = await params;
  return (
    <FeastShell>
      <FeastEditRegister slug={slug} participantId={participantId} />
    </FeastShell>
  );
}
