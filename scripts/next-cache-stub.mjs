// Stand-in for "next/cache" when server actions run from a plain Node script
// (publish-feast-results.mjs). Outside a Next request there's no data cache to
// expire — revalidateTag() throws "static generation store missing" — so these
// are no-ops; the live site's cached reads catch up on their 30–60s TTL
// (src/lib/cache-tags.ts).
export function unstable_cache(fn) {
  return fn;
}
export function revalidateTag() {}
export function revalidatePath() {}
export function updateTag() {}
