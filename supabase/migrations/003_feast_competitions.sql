-- Creates the Arts Fest and Literature feasts and attaches the competition
-- catalogs (002_competitions.sql) to them via feast_competitions. Runs last:
-- needs the competitions to exist.

-- ════════════════════════════════════════════════════════════════════════
-- Feasts
-- ════════════════════════════════════════════════════════════════════════

-- Fixed ids so the attach statements below can reference them. Created as
-- drafts — configure dates/venue/status in /admin/feasts.
insert into feasts (id, name, slug, type) values
  ('58484572-31f4-4f37-9047-665c73592c6a', 'കലാ മത്സരം',     'arts-fest',       'arts'),
  ('396e97cd-a92f-4b0f-bc77-20daf789e5a3', 'സാഹിത്യ മത്സരം', 'literature-fest', 'literature')
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Arts Fest
-- ════════════════════════════════════════════════════════════════════════

-- Attach every competition seeded by 002_competitions.sql's Arts Fest
-- section to the Arts Fest feast created above.
-- feast_id: 58484572-31f4-4f37-9047-665c73592c6a
-- Idempotent: safe to re-run — skips competitions already attached.

INSERT INTO feast_competitions (feast_id, competition_id, display_order)
SELECT
  '58484572-31f4-4f37-9047-665c73592c6a'::uuid,
  c.id,
  base.max_order + ROW_NUMBER() OVER (ORDER BY c.name, cat.sort_order, c.gender)
FROM competitions c
LEFT JOIN competition_categories cat ON cat.id = c.competition_category_id
CROSS JOIN (
  SELECT COALESCE(MAX(display_order), -1) AS max_order
  FROM feast_competitions
  WHERE feast_id = '58484572-31f4-4f37-9047-665c73592c6a'
) base
WHERE c.name IN (
  'പ്രസംഗം', 'സംഗീതം', 'മിഷൻ ക്വിസ്', 'ബൈബിൾ വായന', 'നാടോടി നൃത്തം', 'കഥാപ്രസംഗം',
  'സമൂഹ ഗാനം', 'മാർഗ്ഗംകളി', 'പരിചമുട്ടുകളി', 'ബൈബിൾ ദൃശ്യാവതരണം', 'മിഷൻ ആന്തം'
)
AND NOT EXISTS (
  SELECT 1 FROM feast_competitions fc
  WHERE fc.feast_id = '58484572-31f4-4f37-9047-665c73592c6a'
    AND fc.competition_id = c.id
);

-- ════════════════════════════════════════════════════════════════════════
-- Literature
-- ════════════════════════════════════════════════════════════════════════

-- Attaches the literature competition catalog (002_competitions.sql)
-- to the Literature feast, ordered by age category then name/gender.
-- Assumes a fresh DB where these 29 rows are the only category='literature'
-- competitions — if that stops being true, switch the WHERE clause to match
-- the same (name, gender, category_slug) tuples as 002_competitions.sql
-- instead.
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
