import { FeastShell } from "@/components/feast/feast-shared";
import { FeastEditTeam } from "@/components/feast/feast-edit-team";

export default async function EditTeamPage({ params }: { params: Promise<{ slug: string; teamId: string }> }) {
  const { slug, teamId } = await params;
  return (
    <FeastShell>
      <FeastEditTeam slug={slug} teamId={teamId} />
    </FeastShell>
  );
}
