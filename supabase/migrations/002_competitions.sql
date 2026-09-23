-- Competition catalogs (master `competitions` list only — not attached to
-- any feast; that's 003_feast_competitions.sql).
-- Idempotent: safe to re-run.

-- ════════════════════════════════════════════════════════════════════════
-- Arts Fest catalog
-- ════════════════════════════════════════════════════════════════════════

-- Arts Fest competition catalog, copied from the source app's "second
-- feast" lineup (cml-mission-hub/supabase/migration-second-feast-
-- competitions.sql + -group-competitions-2.sql + -group-competitions-3.sql
-- + -shakha-registration-caps.sql).
-- Seeds the master `competitions` list only — NOT attached to any feast,
-- since this is a fresh multi-org DB with no equivalent feast row to
-- attach to. Use the Feast lineup page (/admin/feasts/[id]) to add these
-- to a specific feast after creating it.
--
-- Gender values converted from the source's plural 'boys'/'girls' to this
-- schema's singular 'boy'/'girl' CHECK constraint.
-- Registration caps: all individual items are capped at 2 registrations/
-- shakha, except കഥാപ്രസംഗം which is capped at 1; all group/team items are
-- capped at 1 team/shakha.

-- 1. പ്രസംഗം (Speech) — individual · all 5 categories · boy & girl · cap 2/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'പ്രസംഗം', 'Speech', 'individual', 'speech', 'പ്രസംഗം', g.gender, cat.id, '🎤', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug IN ('sub_junior','junior','senior','super_senior','elder')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'പ്രസംഗം' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 2. സംഗീതം (Solo Song) — individual · all 5 categories · boy & girl · cap 2/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'സംഗീതം', 'Solo Song', 'individual', 'music', 'സംഗീതം', g.gender, cat.id, '🎵', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug IN ('sub_junior','junior','senior','super_senior','elder')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'സംഗീതം' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 3. മിഷൻ ക്വിസ് (Mission Quiz) — individual · junior..elder (no sub_junior) · boy & girl · cap 2/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'മിഷൻ ക്വിസ്', 'Mission Quiz', 'individual', 'quiz', 'മിഷൻ ക്വിസ്', g.gender, cat.id, '❓', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug IN ('junior','senior','super_senior','elder')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'മിഷൻ ക്വിസ്' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 4. ബൈബിൾ വായന (Bible Reading) — individual · sub_junior only · boy & girl · cap 2/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'ബൈബിൾ വായന', 'Bible Reading', 'individual', 'speech', 'ബൈബിൾ വായന', g.gender, cat.id, '📖', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug = 'sub_junior') AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'ബൈബിൾ വായന' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 5. Additional group competitions — common gender, open to all age categories · cap 1 team/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT v.name, v.name_en, 'group', v.category, v.name, 'common', NULL, v.icon, 1
FROM (VALUES
  ('സമൂഹ ഗാനം', 'Group Song', 'music', '🎶'),
  ('മാർഗ്ഗംകളി', 'Margamkali', 'dance', '💃'),
  ('പരിചമുട്ടുകളി', 'Parichamuttukali', 'dance', '🥁'),
  ('ബൈബിൾ ദൃശ്യാവതരണം', 'Bible Tableau', 'drama', '📖'),
  ('മിഷൻ ആന്തം', 'Mission Anthem', 'music', '🎵')
) AS v(name, name_en, category, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = v.name AND c.gender = 'common' AND c.competition_category_id IS NULL
);

-- 6. നാടോടി നൃത്തം (Folk Dance) — individual only (no group/team variant) ·
-- Sub Junior & Junior · girl only · cap 2/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'നാടോടി നൃത്തം', 'Folk Dance', 'individual', 'dance', 'നാടോടി നൃത്തം', 'girl', cat.id, '💃', 2
FROM (SELECT id FROM competition_categories WHERE slug IN ('sub_junior', 'junior')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'നാടോടി നൃത്തം' AND c.gender = 'girl' AND c.competition_category_id = cat.id
);

-- 7. കഥാപ്രസംഗം (Kathaprasangam / Story-telling) — individual · common ·
-- Sub Junior/Junior/Senior · cap 1/shakha
INSERT INTO competitions (name, name_en, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'കഥാപ്രസംഗം', 'Kathaprasangam', 'individual', 'drama', 'കഥാപ്രസംഗം', 'common', cat.id, '🎭', 1
FROM (SELECT id FROM competition_categories WHERE slug IN ('sub_junior', 'junior', 'senior')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'കഥാപ്രസംഗം' AND c.gender = 'common' AND c.competition_category_id = cat.id
);

-- ════════════════════════════════════════════════════════════════════════
-- Literature catalog
-- ════════════════════════════════════════════════════════════════════════

-- Literature-feast competition catalog, ported from cml-mission-hub (the
-- parent app this product was extracted from) — its committed migrations
-- only had a partial/incomplete version of this, so the exact gender/
-- category breakdown here was read back from its live competitions table.
-- Reusable master data (not tied to any specific feast): an admin attaches
-- these to a feast via feast_competitions through /admin/competitions,
-- same as any other competition.

insert into competitions (name, name_en, type, category, description, gender, competition_category_id, icon)
select v.name, v.name_en, 'individual', 'literature', v.name, v.gender, cat.id, v.icon
from (
  values
    -- ജലഛായം (Watercolor) — sub_junior's own drawing item, not a
    -- ചിത്രരചന variant.
    ('ജലഛായം',   'Watercolor', 'common', 'sub_junior',   '🎨'::text),

    -- ചിത്രരചന (Drawing) — common gender, junior upward (no sub_junior).
    ('ചിത്രരചന', 'Pencil Drawing', 'common', 'junior',       '🎨'),
    ('ചിത്രരചന', 'Pencil Drawing', 'common', 'senior',       '🎨'),
    ('ചിത്രരചന', 'Pencil Drawing', 'common', 'super_senior', '🎨'),
    ('ചിത്രരചന', 'Pencil Drawing', 'common', 'elder',        '🎨'),

    -- ഉപന്യാസം (Essay) — boy/girl split, junior upward.
    ('ഉപന്യാസം', 'Essay Writing', 'boy',  'junior',       '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'boy',  'senior',       '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'boy',  'super_senior', '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'boy',  'elder',        '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'girl', 'junior',       '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'girl', 'senior',       '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'girl', 'super_senior', '📝'),
    ('ഉപന്യാസം', 'Essay Writing', 'girl', 'elder',        '📝'),

    -- കവിത (Poem) — boy/girl split, junior upward.
    ('കവിത', 'Poetry writing', 'boy',  'junior',       null),
    ('കവിത', 'Poetry writing', 'boy',  'senior',       null),
    ('കവിത', 'Poetry writing', 'boy',  'super_senior', null),
    ('കവിത', 'Poetry writing', 'boy',  'elder',        null),
    ('കവിത', 'Poetry writing', 'girl', 'junior',       null),
    ('കവിത', 'Poetry writing', 'girl', 'senior',       null),
    ('കവിത', 'Poetry writing', 'girl', 'super_senior', null),
    ('കവിത', 'Poetry writing', 'girl', 'elder',        null),

    -- ചെറു കഥ (Short Story) — boy/girl split, junior upward.
    ('ചെറു കഥ', 'Short Story Writing', 'boy',  'junior',       null),
    ('ചെറു കഥ', 'Short Story Writing', 'boy',  'senior',       null),
    ('ചെറു കഥ', 'Short Story Writing', 'boy',  'super_senior', null),
    ('ചെറു കഥ', 'Short Story Writing', 'boy',  'elder',        null),
    ('ചെറു കഥ', 'Short Story Writing', 'girl', 'junior',       null),
    ('ചെറു കഥ', 'Short Story Writing', 'girl', 'senior',       null),
    ('ചെറു കഥ', 'Short Story Writing', 'girl', 'super_senior', null),
    ('ചെറു കഥ', 'Short Story Writing', 'girl', 'elder',        null)
) as v(name, name_en, gender, category_slug, icon)
join competition_categories cat on cat.slug = v.category_slug
where not exists (
  select 1 from competitions c
  where c.name = v.name
    and c.gender = v.gender
    and c.competition_category_id = cat.id
);
