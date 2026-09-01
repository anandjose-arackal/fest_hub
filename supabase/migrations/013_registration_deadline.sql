-- Last day new registrations are accepted for a feast — distinct from
-- registration_edit_deadline (002_feast_core.sql), which only gates editing
-- an already-submitted registration. NULL = no deadline set. Admin-only
-- field for now: not read or enforced anywhere in the public app yet.
alter table feasts
  add column if not exists registration_deadline date;
