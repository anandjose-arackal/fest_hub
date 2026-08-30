import { FeastShell } from "@/components/feast/feast-shared";
import { FeastRegisterTeam } from "@/components/feast/feast-register-team";

export default async function RegisterTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      <FeastRegisterTeam slug={slug} />
    </FeastShell>
  );
}
