-- Participant photo (individual events) — an S3 object URL, uploaded from
-- the Feast Portal / admin registration forms (src/actions/photos.ts).
-- Shown on winner posters and the /screen results spotlight.
alter table participants add column if not exists photo_url text;
