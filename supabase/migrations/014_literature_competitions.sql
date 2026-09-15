-- Literature-feast competition catalog, ported from cml-mission-hub (the
-- parent app this product was extracted from) — its committed migrations
-- only had a partial/incomplete version of this, so the exact gender/
-- category breakdown here was read back from its live competitions table.
-- Reusable master data (not tied to any specific feast): an admin attaches
-- these to a feast via feast_competitions through /admin/competitions,
-- same as any other competition.
-- Idempotent: safe to re-run.

insert into competitions (name, type, category, description, gender, competition_category_id, icon)
select v.name, 'individual', 'literature', v.name, v.gender, cat.id, v.icon
from (
  values
    -- ജലഛായം (Watercolor) — sub_junior's own drawing item, not a
    -- ചിത്രരചന variant.
    ('ജലഛായം',   'common', 'sub_junior',   '🎨'::text),

    -- ചിത്രരചന (Drawing) — common gender, junior upward (no sub_junior).
    ('ചിത്രരചന', 'common', 'junior',       '🎨'),
    ('ചിത്രരചന', 'common', 'senior',       '🎨'),
    ('ചിത്രരചന', 'common', 'super_senior', '🎨'),
    ('ചിത്രരചന', 'common', 'elder',        '🎨'),

    -- ഉപന്യാസം (Essay) — boy/girl split, junior upward.
    ('ഉപന്യാസം', 'boy',  'junior',       '📝'),
    ('ഉപന്യാസം', 'boy',  'senior',       '📝'),
    ('ഉപന്യാസം', 'boy',  'super_senior', '📝'),
    ('ഉപന്യാസം', 'boy',  'elder',        '📝'),
    ('ഉപന്യാസം', 'girl', 'junior',       '📝'),
    ('ഉപന്യാസം', 'girl', 'senior',       '📝'),
    ('ഉപന്യാസം', 'girl', 'super_senior', '📝'),
    ('ഉപന്യാസം', 'girl', 'elder',        '📝'),

    -- കവിത (Poem) — boy/girl split, junior upward.
    ('കവിത', 'boy',  'junior',       null),
    ('കവിത', 'boy',  'senior',       null),
    ('കവിത', 'boy',  'super_senior', null),
    ('കവിത', 'boy',  'elder',        null),
    ('കവിത', 'girl', 'junior',       null),
    ('കവിത', 'girl', 'senior',       null),
    ('കവിത', 'girl', 'super_senior', null),
    ('കവിത', 'girl', 'elder',        null),

    -- ചെറു കഥ (Short Story) — boy/girl split, junior upward.
    ('ചെറു കഥ', 'boy',  'junior',       null),
    ('ചെറു കഥ', 'boy',  'senior',       null),
    ('ചെറു കഥ', 'boy',  'super_senior', null),
    ('ചെറു കഥ', 'boy',  'elder',        null),
    ('ചെറു കഥ', 'girl', 'junior',       null),
    ('ചെറു കഥ', 'girl', 'senior',       null),
    ('ചെറു കഥ', 'girl', 'super_senior', null),
    ('ചെറു കഥ', 'girl', 'elder',        null)
) as v(name, gender, category_slug, icon)
join competition_categories cat on cat.slug = v.category_slug
where not exists (
  select 1 from competitions c
  where c.name = v.name
    and c.gender = v.gender
    and c.competition_category_id = cat.id
);
