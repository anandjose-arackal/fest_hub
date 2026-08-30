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
-- Idempotent: safe to re-run.

-- 1. പ്രസംഗം (Speech) — individual · all 5 categories · boy & girl · cap 2/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'പ്രസംഗം', 'individual', 'speech', 'പ്രസംഗം', g.gender, cat.id, '🎤', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug IN ('sub_junior','junior','senior','super_senior','elder')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'പ്രസംഗം' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 2. സംഗീതം (Solo Song) — individual · all 5 categories · boy & girl · cap 2/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'സംഗീതം', 'individual', 'music', 'സംഗീതം', g.gender, cat.id, '🎵', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug IN ('sub_junior','junior','senior','super_senior','elder')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'സംഗീതം' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 3. മിഷൻ ക്വിസ് (Mission Quiz) — individual · junior..elder (no sub_junior) · boy & girl · cap 2/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'മിഷൻ ക്വിസ്', 'individual', 'quiz', 'മിഷൻ ക്വിസ്', g.gender, cat.id, '❓', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug IN ('junior','senior','super_senior','elder')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'മിഷൻ ക്വിസ്' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 4. ബൈബിൾ വായന (Bible Reading) — individual · sub_junior only · boy & girl · cap 2/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'ബൈബിൾ വായന', 'individual', 'speech', 'ബൈബിൾ വായന', g.gender, cat.id, '📖', 2
FROM (VALUES ('boy'), ('girl')) AS g(gender)
CROSS JOIN (SELECT id FROM competition_categories WHERE slug = 'sub_junior') AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'ബൈബിൾ വായന' AND c.gender = g.gender AND c.competition_category_id = cat.id
);

-- 5. Additional group competitions — common gender, open to all age categories · cap 1 team/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT v.name, 'group', v.category, v.name, 'common', NULL, v.icon, 1
FROM (VALUES
  ('സമൂഹ ഗാനം', 'music', '🎶'),
  ('മാർഗ്ഗംകളി', 'dance', '💃'),
  ('പരിചമുട്ടുകളി', 'dance', '🥁'),
  ('ബൈബിൾ ദൃശ്യാവതരണം', 'drama', '📖'),
  ('മിഷൻ ആന്തം', 'music', '🎵')
) AS v(name, category, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = v.name AND c.gender = 'common' AND c.competition_category_id IS NULL
);

-- 6. നാടോടി നൃത്തം (Folk Dance) — individual only (no group/team variant) ·
-- Sub Junior & Junior · girl only · cap 2/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'നാടോടി നൃത്തം', 'individual', 'dance', 'നാടോടി നൃത്തം', 'girl', cat.id, '💃', 2
FROM (SELECT id FROM competition_categories WHERE slug IN ('sub_junior', 'junior')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'നാടോടി നൃത്തം' AND c.gender = 'girl' AND c.competition_category_id = cat.id
);

-- 7. കഥാപ്രസംഗം (Kathaprasangam / Story-telling) — individual · common ·
-- Sub Junior/Junior/Senior · cap 1/shakha
INSERT INTO competitions (name, type, category, description, gender, competition_category_id, icon, max_per_shakha)
SELECT 'കഥാപ്രസംഗം', 'individual', 'drama', 'കഥാപ്രസംഗം', 'common', cat.id, '🎭', 1
FROM (SELECT id FROM competition_categories WHERE slug IN ('sub_junior', 'junior', 'senior')) AS cat
WHERE NOT EXISTS (
  SELECT 1 FROM competitions c
  WHERE c.name = 'കഥാപ്രസംഗം' AND c.gender = 'common' AND c.competition_category_id = cat.id
);
