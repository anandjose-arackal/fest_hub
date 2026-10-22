// Participant photos live in S3 under `participants/<feastId>/<uuid>.<ext>`
// (src/actions/photos.ts). Registration actions accept a photo URL from the
// browser, so they only store one that points at our own bucket and prefix —
// never an arbitrary link.
//
// Pure module, so `node --test` can load it directly.

export const PHOTO_PREFIX = "participants/";
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/webp"] as const;

export function photoKeyFor(feastId: string, id: string, contentType: string): string {
  return `${PHOTO_PREFIX}${feastId}/${id}.${contentType === "image/webp" ? "webp" : "jpg"}`;
}

// `base` is the public origin objects are served from, without a trailing
// slash (S3 virtual-hosted URL or a CloudFront/custom domain).
export function isParticipantPhotoUrl(url: string, base: string): boolean {
  if (!base) return false;
  const root = `${base.replace(/\/+$/, "")}/${PHOTO_PREFIX}`;
  if (!url.startsWith(root)) return false;
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|webp)$/i.test(url.slice(root.length));
}
