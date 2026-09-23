-- Full schema: every table, index, trigger, function, RLS policy and
-- storage bucket. Seed data lives in 002_competitions.sql and
-- 003_feast_competitions.sql, which run after this.
-- Idempotent: safe to re-run.

-- ════════════════════════════════════════════════════════════════════════
-- Org hierarchy + profiles
-- ════════════════════════════════════════════════════════════════════════

-- Shared auth/identity foundation: org hierarchy (Diocese -> Meghala ->
-- Shakha) + profiles + auto-provisioning.

create extension if not exists pgcrypto;

-- ── org hierarchy: dioceses -> meghalas -> shakhas ──────────────────────
-- Shakha is the default/leaf level for every org. An org can additionally
-- opt into a Meghala tier, or a full Diocese -> Meghala tier, via
-- org_settings.hierarchy_level ('shakha' | 'meghala' | 'diocese', default
-- 'shakha' — see org_settings below). No seed rows here: unlike the
-- source app (fixed to one org's branches), this is a multi-org product —
-- every level is created through /admin/dioceses, /admin/meghalas,
-- /admin/shakhas.
create table if not exists dioceses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  color      text not null default '#6B46FF',
  created_at timestamptz not null default now()
);

create table if not exists meghalas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  diocese_id uuid references dioceses(id) on delete set null,
  color      text not null default '#6B46FF',
  created_at timestamptz not null default now()
);

create index if not exists idx_meghalas_diocese on meghalas (diocese_id);

create table if not exists shakhas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  meghala_id uuid references meghalas(id) on delete set null,
  color      text not null default '#6B46FF',
  created_at timestamptz not null default now()
);

create index if not exists idx_shakhas_meghala on shakhas (meghala_id);

-- ── profiles ─────────────────────────────────────────────────────────────
-- An sa_admin's single scope assignment sits at whichever one of these
-- three columns is set — a shakha (default), a meghala, or a diocese —
-- matching whichever tier is the org's configured top level. At most one
-- is ever set (enforced below); which one is valid for a *given* org's
-- current hierarchy_level needs a cross-table read and is checked in the
-- action layer, not here.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       text not null default 'admin' check (role in ('admin', 'me_admin', 'sa_admin')),
  shakha_id  uuid references shakhas(id) on delete set null,
  meghala_id uuid references meghalas(id) on delete set null,
  diocese_id uuid references dioceses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_single_scope_check check (
    (case when shakha_id is not null then 1 else 0 end
   + case when meghala_id is not null then 1 else 0 end
   + case when diocese_id is not null then 1 else 0 end) <= 1
  )
);

create index if not exists idx_profiles_role    on profiles (role);
create index if not exists idx_profiles_shakha  on profiles (shakha_id);
create index if not exists idx_profiles_meghala on profiles (meghala_id);
create index if not exists idx_profiles_diocese on profiles (diocese_id);

-- ── update_updated_at() ─────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_profiles') then
    create trigger set_updated_at_profiles
      before update on profiles
      for each row execute function update_updated_at();
  end if;
end $$;

-- ── handle_new_user() — auto-provisions a profiles row on signup ───────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table dioceses enable row level security;
alter table meghalas enable row level security;
alter table shakhas  enable row level security;
alter table profiles enable row level security;

drop policy if exists "Public read dioceses" on dioceses;
create policy "Public read dioceses" on dioceses for select using (true);
-- No INSERT/UPDATE/DELETE policy on dioceses: writes go through
-- getSupabaseAdmin() in src/actions/diocese.ts.

drop policy if exists "Public read meghalas" on meghalas;
create policy "Public read meghalas" on meghalas for select using (true);
-- No INSERT/UPDATE/DELETE policy on meghalas: writes go through
-- getSupabaseAdmin() in src/actions/meghala.ts.

drop policy if exists "Public read shakhas" on shakhas;
create policy "Public read shakhas" on shakhas for select using (true);
-- No INSERT/UPDATE/DELETE policy on shakhas: writes go through
-- getSupabaseAdmin() in src/actions/shakha.ts.

drop policy if exists "Users can read all profiles" on profiles;
create policy "Users can read all profiles" on profiles for select using (true);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Split by command (not a single FOR ALL) — a self-referencing FOR ALL
-- USING clause on profiles recurses infinitely on every SELECT.
drop policy if exists "Admin insert profiles" on profiles;
create policy "Admin insert profiles" on profiles
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('sa_admin', 'me_admin'))
  );

drop policy if exists "Admin update profiles" on profiles;
create policy "Admin update profiles" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('sa_admin', 'me_admin'))
  );

drop policy if exists "Admin delete profiles" on profiles;
create policy "Admin delete profiles" on profiles
  for delete using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('sa_admin', 'me_admin'))
  );

-- ════════════════════════════════════════════════════════════════════════
-- Feasts, competitions, categories, stages, feast_competitions
-- ════════════════════════════════════════════════════════════════════════

-- Feast core: feasts, competitions, categories, stages, feast_competitions.

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
  -- Marks a feast run entirely outside this app (paper scoring, a different
  -- system, etc.) whose shakha points an admin enters directly instead of
  -- computing them from competitions, so they still count toward the
  -- overall cross-feast standings — see src/actions/results.ts's
  -- saveExternalFeastPoints and
  -- src/app/admin/feasts/[id]/external-points/page.tsx.
  is_external                boolean not null default false,
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
  -- English name, used by the certificate builder's "Competition Name
  -- (English)" field so certificates can print it alongside/instead of
  -- `name` (often Malayalam). NULL = the renderer falls back to `name`.
  name_en                  text,
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
  -- Bumped on every status/results change so the public landing page can
  -- derive its "recent activity" feed (results published / competition
  -- started / completed) from real state transitions instead of needing a
  -- separate notifications table.
  updated_at     timestamptz not null default now(),
  unique(feast_id, competition_id)
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'feast_competitions_updated_at') then
    create trigger feast_competitions_updated_at
      before update on feast_competitions
      for each row execute procedure set_updated_at();
  end if;
end $$;

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

-- ════════════════════════════════════════════════════════════════════════
-- Participants + registrations
-- ════════════════════════════════════════════════════════════════════════

-- Participants and their per-competition registrations.

create table if not exists participants (
  id                       uuid primary key default gen_random_uuid(),
  feast_id                 uuid not null references feasts(id) on delete cascade,
  -- Intentionally no ON DELETE action: a shakha with existing participants
  -- can't be deleted (defaults to RESTRICT). Reproduced deliberately.
  shakha_id                uuid references shakhas(id),
  name                     text not null,
  house_name               text,
  date_of_birth            date,
  gender                   text,
  category                 text,
  competition_category_id  uuid references competition_categories(id),
  phone                    text,
  registration_number      text unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists participants_feast_id_idx on participants (feast_id);
-- Hot admin/portal paths filter by feast_id AND shakha_id together (a
-- shakha's roster for building/editing a team registration) — a direct
-- range scan instead of scanning the whole feast and filtering shakha_id.
create index if not exists participants_feast_shakha_idx on participants (feast_id, shakha_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'participants_updated_at') then
    create trigger participants_updated_at
      before update on participants
      for each row execute procedure set_updated_at();
  end if;
end $$;

create table if not exists participant_registrations (
  id                   uuid primary key default gen_random_uuid(),
  participant_id       uuid not null references participants(id) on delete cascade,
  feast_competition_id uuid not null references feast_competitions(id) on delete cascade,
  participated         boolean not null default false,
  chance_no            smallint check (chance_no is null or (chance_no >= 1 and chance_no <= 10000)),
  created_at           timestamptz not null default now(),
  unique(participant_id, feast_competition_id)
);

create index if not exists participant_registrations_participated_idx
  on participant_registrations (feast_competition_id, participated);
create index if not exists participant_registrations_chance_no_idx
  on participant_registrations (feast_competition_id, chance_no);

-- ── registration-number sequence ────────────────────────────────────────
create table if not exists feast_reg_counters (
  feast_id    uuid primary key references feasts(id) on delete cascade,
  next_number int not null default 1111,
  updated_at  timestamptz not null default now()
);

create or replace function next_reg_number(p_feast_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  result int;
begin
  insert into feast_reg_counters (feast_id, next_number)
  values (p_feast_id, 1111)
  on conflict (feast_id) do nothing;

  update feast_reg_counters
  set next_number = next_number + 1,
      updated_at  = now()
  where feast_id = p_feast_id
  returning next_number - 1 into result;

  return result;
end;
$$;

grant execute on function next_reg_number(uuid) to anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table participants              enable row level security;
alter table participant_registrations enable row level security;
alter table feast_reg_counters        enable row level security;

drop policy if exists "participants_public_read" on participants;
create policy "participants_public_read" on participants for select using (true);
drop policy if exists "participants_public_insert" on participants;
create policy "participants_public_insert" on participants for insert with check (true);
-- No UPDATE/DELETE policy: admin edits/deletes go through
-- src/actions/feast.ts using getSupabaseAdmin().

drop policy if exists "registrations_public_read" on participant_registrations;
create policy "registrations_public_read" on participant_registrations for select using (true);
drop policy if exists "registrations_public_insert" on participant_registrations;
create policy "registrations_public_insert" on participant_registrations for insert with check (true);
-- No UPDATE/DELETE policy: participation marking / chance-no assignment
-- go through the service-role client (see AGENTS.md RLS convention).

drop policy if exists "feast_reg_counters_auth_all" on feast_reg_counters;
create policy "feast_reg_counters_auth_all" on feast_reg_counters for all using (auth.role() = 'authenticated');
-- Moot in practice: only ever touched via the SECURITY DEFINER function above.

-- ════════════════════════════════════════════════════════════════════════
-- Team registrations
-- ════════════════════════════════════════════════════════════════════════

-- Team/group competition registrations.

create table if not exists team_registrations (
  id                   uuid primary key default gen_random_uuid(),
  feast_id             uuid not null references feasts(id) on delete cascade,
  feast_competition_id uuid not null references feast_competitions(id) on delete cascade,
  shakha_id            uuid not null references shakhas(id) on delete cascade,
  team_name            text not null,
  participated         boolean not null default false,
  chance_no            smallint check (chance_no is null or (chance_no >= 1 and chance_no <= 10000)),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (feast_competition_id, shakha_id)
);

create index if not exists team_registrations_feast_idx        on team_registrations(feast_id);
create index if not exists team_registrations_participated_idx on team_registrations (feast_competition_id, participated);
create index if not exists team_registrations_chance_no_idx    on team_registrations (feast_competition_id, chance_no);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'team_registrations_updated_at') then
    create trigger team_registrations_updated_at
      before update on team_registrations
      for each row execute procedure set_updated_at();
  end if;
end $$;

create table if not exists team_registration_members (
  id                    uuid primary key default gen_random_uuid(),
  team_registration_id  uuid not null references team_registrations(id) on delete cascade,
  participant_id        uuid not null references participants(id) on delete cascade,
  -- Denormalized from the parent team_registrations row; kept honest by
  -- check_team_member_fc_match() below.
  feast_competition_id  uuid not null references feast_competitions(id) on delete cascade,
  created_at            timestamptz not null default now(),
  unique (team_registration_id, participant_id),
  unique (participant_id, feast_competition_id)
);

create index if not exists team_registration_members_team_idx on team_registration_members(team_registration_id);

create or replace function check_team_member_fc_match()
returns trigger language plpgsql as $$
declare parent_fc uuid;
begin
  select feast_competition_id into parent_fc from team_registrations where id = new.team_registration_id;
  if parent_fc is distinct from new.feast_competition_id then
    raise exception 'team_registration_members.feast_competition_id must match parent team_registrations row';
  end if;
  return new;
end;
$$;

drop trigger if exists team_registration_members_fc_check on team_registration_members;
create trigger team_registration_members_fc_check
  before insert or update on team_registration_members
  for each row execute procedure check_team_member_fc_match();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table team_registrations        enable row level security;
alter table team_registration_members enable row level security;

drop policy if exists "team_registrations_public_read" on team_registrations;
create policy "team_registrations_public_read" on team_registrations for select using (true);
drop policy if exists "team_registration_members_public_read" on team_registration_members;
create policy "team_registration_members_public_read" on team_registration_members for select using (true);
-- No write policy on either: team creation needs multi-row transactional
-- validation (Shakha uniqueness, member cap, cross-team dedup) that only
-- registerTeam() performs via getSupabaseAdmin().

-- ════════════════════════════════════════════════════════════════════════
-- Results, scoring, standings
-- ════════════════════════════════════════════════════════════════════════

-- Results, scoring, and standings.
--
-- RLS is intentionally NOT enabled on any of the four tables in this file
-- (competition_results, team_results, shakha_point_ledger,
-- shakha_feast_standings) — reproducing the source app's convention
-- deliberately (Decision #11). Security rests entirely on every access
-- going through getSupabaseAdmin() in src/actions/results.ts /
-- team-results.ts; the anon/authenticated API keys are never handed direct
-- access to these tables in application code. Postgres RLS never applies
-- to the service-role connection regardless, so this changes nothing for
-- the app's own reads/writes — it only matters if the anon/authenticated
-- keys could be used directly against these tables from somewhere
-- unaudited.

create table if not exists competition_results (
  id                           uuid primary key default gen_random_uuid(),
  feast_competition_id         uuid not null references feast_competitions(id) on delete cascade,
  participant_registration_id  uuid not null references participant_registrations(id) on delete cascade,
  score                        numeric not null default 0,
  grade                        text check (grade in ('A', 'B', 'C')),
  grade_points                 integer not null default 0,
  position                     integer,
  position_points              integer not null default 0,
  total_points                 integer not null default 0,
  published_at                 timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (participant_registration_id)
);

create index if not exists competition_results_feast_competition_id_idx on competition_results (feast_competition_id);

create table if not exists team_results (
  id                    uuid primary key default gen_random_uuid(),
  feast_competition_id  uuid not null references feast_competitions(id) on delete cascade,
  team_registration_id  uuid not null references team_registrations(id) on delete cascade,
  score                 numeric not null default 0,
  grade                 text check (grade in ('A', 'B', 'C')),
  grade_points          integer not null default 0,
  position              integer,
  position_points       integer not null default 0,
  total_points          integer not null default 0,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (team_registration_id)
);

-- Added here for parity with competition_results (missing in the source
-- schema — see spec §1.15).
create index if not exists team_results_feast_competition_id_idx on team_results (feast_competition_id);

create table if not exists shakha_point_ledger (
  id                           uuid primary key default gen_random_uuid(),
  feast_id                     uuid not null references feasts(id) on delete cascade,
  feast_competition_id         uuid not null references feast_competitions(id) on delete cascade,
  participant_registration_id  uuid references participant_registrations(id) on delete cascade,
  participant_id               uuid references participants(id) on delete cascade,
  shakha_id                    uuid not null references shakhas(id) on delete cascade,
  category_slug                text not null,
  score                        numeric not null default 0,
  grade                        text,
  position                     integer,
  grade_points                 integer not null default 0,
  position_points              integer not null default 0,
  total_points                 integer not null default 0,
  team_registration_id         uuid references team_registrations(id) on delete cascade,
  created_at                   timestamptz not null default now(),
  constraint shakha_point_ledger_source_check check (
    (participant_registration_id is not null and team_registration_id is null)
    or
    (participant_registration_id is null and team_registration_id is not null)
  )
);

create index if not exists shakha_point_ledger_feast_id_idx             on shakha_point_ledger (feast_id);
create index if not exists shakha_point_ledger_feast_competition_id_idx on shakha_point_ledger (feast_competition_id);
create index if not exists shakha_point_ledger_team_idx                 on shakha_point_ledger (team_registration_id);

create table if not exists shakha_feast_standings (
  id                  uuid primary key default gen_random_uuid(),
  feast_id            uuid not null references feasts(id) on delete cascade,
  shakha_id           uuid not null references shakhas(id) on delete cascade,
  sub_junior_points   integer not null default 0,
  junior_points       integer not null default 0,
  senior_points       integer not null default 0,
  super_senior_points integer not null default 0,
  elder_points        integer not null default 0,
  team_points         integer not null default 0,
  grand_total         integer not null default 0,
  first_place_count   integer not null default 0,
  second_place_count  integer not null default 0,
  third_place_count   integer not null default 0,
  a_grade_count       integer not null default 0,
  b_grade_count       integer not null default 0,
  c_grade_count       integer not null default 0,
  rank                integer,
  updated_at          timestamptz not null default now(),
  unique (feast_id, shakha_id)
);

-- ── get_feast_counts() — aggregate RPC for the feast list screen ────────
create or replace function get_feast_counts(p_feast_ids uuid[])
returns table (feast_id uuid, event_count bigint, registration_count bigint)
language sql
stable
as $$
  select
    fid.feast_id,
    coalesce(fc.cnt, 0) as event_count,
    coalesce(p.cnt, 0)  as registration_count
  from unnest(p_feast_ids) as fid(feast_id)
  left join (
    select feast_id, count(*) as cnt from feast_competitions where feast_id = any(p_feast_ids) group by feast_id
  ) fc on fc.feast_id = fid.feast_id
  left join (
    select feast_id, count(*) as cnt from participants where feast_id = any(p_feast_ids) group by feast_id
  ) p on p.feast_id = fid.feast_id;
$$;

grant execute on function get_feast_counts(uuid[]) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Org settings
-- ════════════════════════════════════════════════════════════════════════

-- Org/area identity as admin-editable configuration (spec §4.1), replacing
-- every hardcoded org-name string ("Cherupushpa Mission League", "Kalpetta",
-- "CML Admin", /logo.png) in the source app. One deployment = one org, so
-- this is a singleton row, not a multi-tenant table.

create table if not exists org_settings (
  -- Singleton enforced by a fixed boolean PK: only one row can ever exist.
  id              boolean primary key default true,
  -- The admin back-office / Fest Portal dashboard's own display name —
  -- distinct from org_name_en (the org's identity, e.g. logo alt text) and
  -- org_name_local (the dashboard's gradient subheading).
  app_name        text not null default 'Fest Hub Admin',
  org_name_en     text not null default 'Feast Hub',
  org_name_local  text not null default '',
  area_name_en    text not null default '',
  area_name_local text not null default '',
  tagline         text not null default 'Feast Portal',
  logo_url        text not null default '/logo.png',
  -- Which org-hierarchy tier this org opts into (see the
  -- dioceses/meghalas/shakhas tables above). 'shakha' (the default) is a flat org with
  -- no grouping above branch level.
  hierarchy_level text not null default 'shakha' check (hierarchy_level in ('shakha', 'meghala', 'diocese')),
  -- Public Fest Portal color palette (never the admin back-office, which
  -- keeps its own fixed look) — applied via a `data-fp-theme` attribute on
  -- the root layout; see globals.css's [data-fp-theme="..."] blocks and
  -- PortalTheme in src/types/index.ts.
  theme           text not null default 'violet'
                    check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival', 'amethyst', 'midnight', 'emerald')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint org_settings_singleton check (id)
);

insert into org_settings (id) values (true) on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'org_settings_updated_at') then
    create trigger org_settings_updated_at
      before update on org_settings
      for each row execute procedure set_updated_at();
  end if;
end $$;

alter table org_settings enable row level security;

drop policy if exists "org_settings_public_read" on org_settings;
create policy "org_settings_public_read" on org_settings for select using (true);
-- No write policy: edited through /admin/org-settings via getSupabaseAdmin().

-- ════════════════════════════════════════════════════════════════════════
-- Certificate templates
-- ════════════════════════════════════════════════════════════════════════

-- One certificate layout per feast: paper size, a pasted background-image
-- URL (no upload infra in this app — see AGENTS.md), and a jsonb array of
-- placed data fields (participant name / place / shakha / grade text /
-- grade tick-mark). Read/written only through src/actions/certificates.ts
-- via getSupabaseAdmin() — no public consumer of this table exists (unlike
-- org_settings), so it gets no RLS at all, same convention as
-- competition_results/team_results above.

create table if not exists certificate_templates (
  feast_id              uuid primary key references feasts(id) on delete cascade,
  paper_width_mm        numeric not null default 210,
  paper_height_mm       numeric not null default 297,
  background_image_url  text not null default '',
  fields                jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'certificate_templates_updated_at') then
    create trigger certificate_templates_updated_at
      before update on certificate_templates
      for each row execute procedure set_updated_at();
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Certificate assets storage bucket
-- ════════════════════════════════════════════════════════════════════════

-- Public storage bucket for certificate background/signature images,
-- uploaded from /admin/certificates. Every upload goes through
-- src/actions/certificates.ts's uploadCertificateAsset() using the
-- service-role client, which bypasses Storage RLS entirely — so this
-- bucket needs no storage.objects policies, only public:true so the
-- printed certificates' plain <img src> URLs load without auth.

insert into storage.buckets (id, name, public)
values ('certificate-assets', 'certificate-assets', true)
on conflict (id) do nothing;
