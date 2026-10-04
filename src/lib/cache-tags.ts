import { revalidateTag } from "next/cache";

// Server data-cache tags for the public read paths (rankings, results,
// /screen, landing banners). Every public viewer hits these at once during an
// event; caching them means one database read per change instead of one per
// phone. Writes that change what they show expire the matching tag
// immediately, and each cached read also carries a short time-based
// revalidate as a safety net for edits made outside a server action.
export const TAG = {
  standings: "fp:standings",
  results: "fp:results",
  hierarchy: "fp:hierarchy",
  org: "fp:org-settings",
} as const;

// Short safety-net lifetimes (seconds) for data a client-side admin write
// can change without going through a tagged server action.
export const TTL = {
  live: 30,
  standard: 60,
  org: 300,
} as const;

// Call only from server actions / route handlers. `{ expire: 0 }` makes the
// next read blocking-fresh, so a just-published result shows immediately.
export function expireTags(...tags: string[]) {
  for (const t of tags) revalidateTag(t, { expire: 0 });
}
