import { S3Client } from "@aws-sdk/client-s3";
import { isParticipantPhotoUrl } from "@/lib/photo-url";

// Server-only, like supabase-admin.ts — the AWS keys have no NEXT_PUBLIC_
// prefix, so never import this file into a client component. Lazily built so
// a build without AWS configured still succeeds; photo upload just reports
// that it isn't set up.
const region = process.env.AWS_REGION ?? "";
const bucket = process.env.AWS_S3_BUCKET ?? "";

let _client: S3Client | null = null;

export function isS3Configured(): boolean {
  return !!(region && bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export function getS3(): S3Client {
  if (!_client) {
    if (!isS3Configured()) throw new Error("AWS S3 is not configured");
    _client = new S3Client({ region });
  }
  return _client;
}

export function getS3Bucket(): string {
  return bucket;
}

// Where uploaded objects are served from: a CloudFront/custom domain when
// AWS_S3_PUBLIC_BASE_URL is set, otherwise the bucket's own S3 URL.
export function photoPublicBase(): string {
  const custom = process.env.AWS_S3_PUBLIC_BASE_URL?.trim();
  if (custom) return custom.replace(/\/+$/, "");
  return bucket && region ? `https://${bucket}.s3.${region}.amazonaws.com` : "";
}

export function publicUrlFor(key: string): string {
  return `${photoPublicBase()}/${key}`;
}

// Normalizes a photo URL coming from the browser before it's stored:
// undefined = leave the column alone, null/"" = clear it, otherwise it must
// be one of our own uploads.
export function checkPhotoUrl(url: string | null | undefined): { ok: true; value: string | null | undefined } | { ok: false } {
  if (url === undefined) return { ok: true, value: undefined };
  if (url === null || url === "") return { ok: true, value: null };
  return isParticipantPhotoUrl(url, photoPublicBase()) ? { ok: true, value: url } : { ok: false };
}
