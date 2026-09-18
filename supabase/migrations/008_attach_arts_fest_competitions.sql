-- Attach every competition seeded by 007_arts_fest_competitions.sql to a
-- specific feast (created via /admin/feasts).
-- feast_id: 6a6e9f22-28e7-479a-a591-e9b553035f1a
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
