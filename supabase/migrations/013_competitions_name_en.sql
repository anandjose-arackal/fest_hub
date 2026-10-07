-- Brings databases created before 001 gained these columns up to date:
-- competitions.name_en (English name, read by admin results/participants,
-- the leaderboard and the certificate builder) and
-- feast_competitions.updated_at (drives the landing page's recent-activity
-- feed — src/actions/activity.ts, src/actions/results.ts).
-- Idempotent: a no-op on databases already built from the current 001.

-- ── competitions.name_en ────────────────────────────────────────────────
alter table competitions add column if not exists name_en text;

-- Backfill the English names 002_competitions.sql seeds. Only fills NULLs,
-- so names an admin has since edited are left alone.
update competitions c
set name_en = v.name_en
from (values
  ('പ്രസംഗം',          'Speech'),
  ('സംഗീതം',           'Solo Song'),
  ('മിഷൻ ക്വിസ്',       'Mission Quiz'),
  ('ബൈബിൾ വായന',       'Bible Reading'),
  ('സമൂഹ ഗാനം',         'Group Song'),
  ('മാർഗ്ഗംകളി',         'Margamkali'),
  ('പരിചമുട്ടുകളി',      'Parichamuttukali'),
  ('ബൈബിൾ ദൃശ്യാവതരണം', 'Bible Tableau'),
  ('മിഷൻ ആന്തം',        'Mission Anthem'),
  ('നാടോടി നൃത്തം',      'Folk Dance'),
  ('കഥാപ്രസംഗം',        'Kathaprasangam'),
  ('ജലഛായം',           'Watercolor'),
  ('ചിത്രരചന',          'Pencil Drawing'),
  ('ഉപന്യാസം',          'Essay Writing'),
  ('കവിത',             'Poetry writing'),
  ('ചെറു കഥ',           'Short Story Writing')
) as v(name, name_en)
where c.name = v.name
  and c.name_en is null;

-- ── feast_competitions.updated_at ───────────────────────────────────────
alter table feast_competitions
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'feast_competitions_updated_at') then
    create trigger feast_competitions_updated_at
      before update on feast_competitions
      for each row execute procedure set_updated_at();
  end if;
end $$;

