import { getOrgSettings } from "@/lib/org-settings";
import { FeastShell } from "@/components/feast/feast-shared";
import { FeastLanding } from "@/components/feast/feast-landing";

export default async function Home() {
  const org = await getOrgSettings();
  return (
    <FeastShell>
      <FeastLanding org={org} />
    </FeastShell>
  );
}
