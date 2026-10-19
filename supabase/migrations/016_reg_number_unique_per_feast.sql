-- registration_number was unique across every feast. A person registered in
-- two feasts has one participants row per feast, so an imported/organisation-
-- issued number (e.g. CML/2025/13520) must be allowed to repeat across feasts.
-- Uniqueness is now per feast. The shared next_reg_number() counter is
-- unchanged, so generated F-numbers still never collide.
-- Idempotent: safe to re-run.

alter table participants drop constraint if exists participants_registration_number_key;

create unique index if not exists participants_feast_reg_number_key
  on participants (feast_id, registration_number);
