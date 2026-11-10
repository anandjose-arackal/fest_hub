import { FeastShell } from "@/components/feast/feast-shared";
import { FeastNewTeam } from "@/components/feast/feast-new-team";

export default async function NewTeamPage({ params }: { params: Promise<{ slug: string; feastCompetitionId: string }> }) {
  const { slug, feastCompetitionId } = await params;
  return (
    <FeastShell>
      <FeastNewTeam slug={slug} feastCompetitionId={feastCompetitionId} />
    </FeastShell>
  );
}
