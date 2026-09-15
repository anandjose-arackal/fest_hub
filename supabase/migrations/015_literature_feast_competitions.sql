-- Attaches the literature competition catalog (014_literature_competitions.sql)
-- to the Literature feast, ordered by age category then name/gender.
-- Assumes a fresh DB where these 29 rows are the only category='literature'
-- competitions — if that stops being true, switch the WHERE clause to match
-- the same (name, gender, category_slug) tuples as 014 instead.
-- Idempotent: the feast_competitions(feast_id, competition_id) unique
-- constraint + ON CONFLICT DO NOTHING makes re-running a no-op.

insert into feast_competitions (feast_id, competition_id, display_order)
select
  '396e97cd-a92f-4b0f-bc77-20daf789e5a3'::uuid,
  c.id,
  row_number() over (order by cat.sort_order, c.name, c.gender)
from competitions c
join competition_categories cat on cat.id = c.competition_category_id
where c.category = 'literature'
on conflict (feast_id, competition_id) do nothing;
