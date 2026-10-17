-- Elder = born before 1986-01-01 (was before 1988-01-01), so Super Senior
-- now starts at 1986-01-01. Brings existing databases in line with the
-- updated seed in 001_schema.sql — that seed only inserts on a fresh
-- database (on conflict do nothing), so it can't move these on its own.
--
-- Only the cut-offs change: getCategorySlug() reads them for every new or
-- edited registration from here on. Participants already registered keep the
-- competition_category_id they were saved with — anyone born in 1986–1987
-- and stored as Elder stays Elder until their DOB is re-saved or they're
-- moved by hand.
-- Idempotent: a no-op once the values are already in place.

update competition_categories set min_dob = '1986-01-01'
where slug = 'super_senior' and min_dob is distinct from '1986-01-01';

update competition_categories set max_dob = '1985-12-31'
where slug = 'elder' and max_dob is distinct from '1985-12-31';
