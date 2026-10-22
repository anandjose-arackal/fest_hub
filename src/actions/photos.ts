"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3, getS3Bucket, isS3Configured, publicUrlFor } from "@/lib/s3";
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES, photoKeyFor } from "@/lib/photo-url";
import { requireRole } from "@/lib/require-role";

// Participant photo upload — step one of two. Returns a short-lived
// presigned PUT so the browser sends the (already compressed) image straight
// to S3; it never passes through a server action, whose body is capped at
// 5mb (next.config.ts). The signature covers Content-Type and
// Content-Length, so S3 rejects a PUT that's bigger than what was declared
// here — and what's declared here is capped at 4MB. Step two is the
// registration action storing the returned `url` on participants.photo_url.
export async function createPhotoUploadUrl(input: {
  feastId: string;
  contentType: string;
  size: number;
}): Promise<{ uploadUrl?: string; url?: string; error?: string }> {
  const auth = await requireRole("registration.write");
  if ("error" in auth) return { error: auth.error };
  if (!isS3Configured()) return { error: "Photo upload isn't set up yet (AWS S3 is not configured)." };
  if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(input.contentType)) return { error: "Only JPEG or WebP photos are supported." };
  if (!Number.isInteger(input.size) || input.size <= 0) return { error: "Photo is empty." };
  if (input.size > MAX_PHOTO_BYTES) return { error: "Photo is too large — it must be under 4MB." };
  if (!/^[0-9a-f-]{36}$/i.test(input.feastId)) return { error: "Invalid fest." };

  const key = photoKeyFor(input.feastId, crypto.randomUUID(), input.contentType);
  try {
    const uploadUrl = await getSignedUrl(
      getS3(),
      new PutObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
        ContentType: input.contentType,
        ContentLength: input.size,
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) }
    );
    return { uploadUrl, url: publicUrlFor(key) };
  } catch (err) {
    console.error("[createPhotoUploadUrl]", err);
    return { error: "Couldn't start the photo upload. Please try again." };
  }
}
