-- participants_feast_id_idx (003_participants.sql) only covers feast_id
-- alone. Several hot admin/portal paths filter by feast_id AND shakha_id
-- together — loading one shakha's roster to build/edit a team registration
-- (feast-register-team.tsx, feast-edit-team.tsx) and the admin participants
-- page's team form (admin/participants/page.tsx) — which today fall back to
-- scanning every participant in the feast and filtering shakha_id in place.
-- Add the composite so that lookup is a direct index range scan instead.
-- Idempotent: safe to re-run.

create index if not exists participants_feast_shakha_idx on participants (feast_id, shakha_id);
