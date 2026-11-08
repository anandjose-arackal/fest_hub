-- Chance numbers go up to 99999 (was 10000). smallint tops out at 32767,
-- so the column becomes integer. Idempotent: safe to re-run.

alter table participant_registrations drop constraint if exists participant_registrations_chance_no_check;
alter table participant_registrations alter column chance_no type integer;
alter table participant_registrations add constraint participant_registrations_chance_no_check
  check (chance_no is null or (chance_no >= 1 and chance_no <= 99999));

alter table team_registrations drop constraint if exists team_registrations_chance_no_check;
alter table team_registrations alter column chance_no type integer;
alter table team_registrations add constraint team_registrations_chance_no_check
  check (chance_no is null or (chance_no >= 1 and chance_no <= 99999));
