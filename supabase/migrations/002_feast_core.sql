-- Feast core: feasts, competitions, categories, stages, feast_competitions.
-- Idempotent: safe to re-run.

-- ── feasts ───────────────────────────────────────────────────────────────
-- status/type intentionally unconstrained text (enforced at the TS layer,
-- matching the source app) so a new org isn't blocked by a CHECK while the
-- product's feast-type vocabulary is still settling.
create table if not exists feasts (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  slug                       text not null unique,
  type                       text not null default 'literature',
  year                       text not null default '2026',
  status                     text not null default 'draft',
  description                text,
  venue                      text,
  start_date                 date,
  end_date                   date,
  -- Decision #7: per-feast configurable edit deadline (not a hardcoded
  -- historical timestamp as in the source app). NULL = no deadline (open).
  registration_edit_deadline timestamptz,
  -- Last day new registrations are accepted — distinct from the edit
  -- deadline above, which only gates editing an already-submitted
  -- registration. NULL = no cutoff. Admin-only for now: not read or
  -- enforced anywhere in the public app yet.
  registration_deadline      date,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'feasts_updated_at') then
    create trigger feasts_updated_at
      before update on feasts
      for each row execute procedure set_updated_at();
  end if;
end $$;

-- ── competition_categories ──────────────────────────────────────────────
-- Single source of truth for age-category DOB cutoffs (Decision #3): the
-- app reads these thresholds from this table instead of duplicating them
-- in TS. 1988-01-01 is the senior/super_senior boundary used here.
create table if not exists competition_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  min_dob    date,
  max_dob    date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into competition_categories (slug, name, min_dob, max_dob, sort_order) values
  ('sub_junior',   'Sub Junior',   '2014-01-01', null,         1),
  ('junior',       'Junior',       '2011-01-01', '2013-12-31', 2),
  ('senior',       'Senior',       '2007-01-01', '2010-12-31', 3),
  ('super_senior', 'Super Senior', '1988-01-01', '2006-12-31', 4),
  ('elder',        'Elder',        null,         '1987-12-31', 5)
on conflict (slug) do nothing;

-- ── competitions ─────────────────────────────────────────────────────────
create table if not exists competitions (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  type                     text not null default 'individual',
  category                 text,
  description              text,
  gender                   text check (gender is null or gender in ('boy', 'girl', 'common')),
  competition_category_id  uuid references competition_categories(id) on delete set null,
  icon                     text,
  max_per_shakha           integer not null default 2,
  max_team_size            integer,
  created_at               timestamptz not null default now()
);

create index if not exists competitions_gender_idx   on competitions(gender);
create index if not exists competitions_category_idx on competitions(competition_category_id);

-- ── stages ───────────────────────────────────────────────────────────────
-- Real relation (Decision/§4.4) replacing the source app's free-text
-- feast_competitions.stage column — a picker instead of hand-typed strings.
create table if not exists stages (
  id         uuid primary key default gen_random_uuid(),
  feast_id   uuid not null references feasts(id) on delete cascade,
  number     int not null,
  title      text not null,
  venue      text,
  created_at timestamptz not null default now(),
  unique (feast_id, number)
);

-- ── feast_competitions ───────────────────────────────────────────────────
create table if not exists feast_competitions (
  id             uuid primary key default gen_random_uuid(),
  feast_id       uuid not null references feasts(id) on delete cascade,
  competition_id uuid not null references competitions(id) on delete cascade,
  display_order  int not null default 0,
  time_slot      text,
  venue          text,
  max_slots      int,
  stage_id       uuid references stages(id) on delete set null,
  scheduled_time text,
  comp_status    text not null default 'upcoming'
                   check (comp_status in ('upcoming','progressing','completed','published')),
  progress_pct   integer check (progress_pct is null or (progress_pct >= 0 and progress_pct <= 100)),
  info           text,
  max_score      integer,
  result_status  text not null default 'draft' check (result_status in ('draft', 'published')),
  created_at     timestamptz not null default now(),
  unique(feast_id, competition_id)
);

-- Not indexed by FK automatically in Postgres, and queried by feast_id
-- constantly (use-feast.ts equivalent) — add explicitly, unlike the source
-- schema which omitted these.
create index if not exists feast_competitions_feast_id_idx       on feast_competitions(feast_id);
create index if not exists feast_competitions_competition_id_idx on feast_competitions(competition_id);
create index if not exists feast_competitions_stage_id_idx       on feast_competitions(stage_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table feasts                   enable row level security;
alter table competitions             enable row level security;
alter table competition_categories   enable row level security;
alter table stages                   enable row level security;
alter table feast_competitions       enable row level security;

drop policy if exists "feasts_public_read" on feasts;
create policy "feasts_public_read" on feasts for select using (true);
drop policy if exists "feasts_auth_all" on feasts;
create policy "feasts_auth_all" on feasts for all using (auth.role() = 'authenticated');

drop policy if exists "competitions_public_read" on competitions;
create policy "competitions_public_read" on competitions for select using (true);
drop policy if exists "competitions_auth_all" on competitions;
create policy "competitions_auth_all" on competitions for all using (auth.role() = 'authenticated');

drop policy if exists "competition_categories_public_read" on competition_categories;
create policy "competition_categories_public_read" on competition_categories for select using (true);
-- No write policy: reference data, service-role only.

drop policy if exists "stages_public_read" on stages;
create policy "stages_public_read" on stages for select using (true);
-- No write policy: admin writes go through src/actions/stage.ts using getSupabaseAdmin().

drop policy if exists "feast_competitions_public_read" on feast_competitions;
create policy "feast_competitions_public_read" on feast_competitions for select using (true);
drop policy if exists "feast_competitions_auth_all" on feast_competitions;
create policy "feast_competitions_auth_all" on feast_competitions for all using (auth.role() = 'authenticated');
