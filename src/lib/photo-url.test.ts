import { test } from "node:test";
import assert from "node:assert/strict";
import { isParticipantPhotoUrl, photoKeyFor } from "./photo-url.ts";

const BASE = "https://fh-photos.s3.ap-south-1.amazonaws.com";
const FEAST = "58484572-31f4-4f37-9047-665c73592c6a";
const ID = "0b0c4a3e-9a51-4f6b-8f39-3c1f6f0a2d11";

test("photoKeyFor picks the extension from the content type", () => {
  assert.equal(photoKeyFor(FEAST, ID, "image/jpeg"), `participants/${FEAST}/${ID}.jpg`);
  assert.equal(photoKeyFor(FEAST, ID, "image/webp"), `participants/${FEAST}/${ID}.webp`);
});

test("isParticipantPhotoUrl accepts only our bucket's photo keys", () => {
  assert.equal(isParticipantPhotoUrl(`${BASE}/${photoKeyFor(FEAST, ID, "image/jpeg")}`, BASE), true);
  assert.equal(isParticipantPhotoUrl(`${BASE}/${photoKeyFor(FEAST, ID, "image/jpeg")}`, `${BASE}/`), true);
  assert.equal(isParticipantPhotoUrl(`https://evil.example.com/participants/${FEAST}/${ID}.jpg`, BASE), false);
  assert.equal(isParticipantPhotoUrl(`${BASE}/certificates/${FEAST}/${ID}.jpg`, BASE), false);
  assert.equal(isParticipantPhotoUrl(`${BASE}/participants/${FEAST}/../x.jpg`, BASE), false);
  assert.equal(isParticipantPhotoUrl(`${BASE}/participants/${FEAST}/${ID}.jpg`, ""), false);
});
