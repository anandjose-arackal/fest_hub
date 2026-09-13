import { getOrgSettings } from "@/lib/org-settings";
import { FeastShell } from "@/components/feast/feast-shared";
import { FeastLanding } from "@/components/feast/feast-landing";

// org_settings is admin-editable at any time (see AGENTS.md's multi-org
// convention) but this is the only server-rendered read of it — without
// forcing dynamic rendering, Next prerenders/caches this fetch and the org
// name goes stale in production until the next deploy, even though every
// other Supabase read on this page is client-side and always fresh.
export const dynamic = "force-dynamic";

export default async function Home() {
  const org = await getOrgSettings();
  return (
    <FeastShell>
      <FeastLanding org={org} />
    </FeastShell>
  );
}
