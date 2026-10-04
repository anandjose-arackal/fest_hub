import { unstable_cache } from "next/cache";
import { getOrgSettings } from "@/lib/org-settings";
import { TAG, TTL } from "@/lib/cache-tags";

// Server-only cached read of the org_settings singleton. The root layout
// (theme + browser theme colour) and the home page read it on every request;
// without this each page load paid two or three identical round trips before
// rendering. updateOrgSettings / first-run setup expire TAG.org, so an admin
// change shows on the next request.
export const getOrgSettingsCached = unstable_cache(async () => getOrgSettings(), ["fp-org-settings"], {
  tags: [TAG.org],
  revalidate: TTL.org,
});
