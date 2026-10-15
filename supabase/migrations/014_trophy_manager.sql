-- Trophy Manager role + trophy / certificate handover tracking.
--
--   1. profiles.role gains 'trophy_manager' — a back-office login whose only
--      job is marking which 1st/2nd/3rd trophies and certificates have been
--      physically handed over (/admin/trophies).
--   2. has_role() + tightened RLS: feasts / competitions / feast_competitions
--      were writable by *any* signed-in user, and any user could rewrite
--      their own profiles.role. A trophy_manager is a signed-in user, so both
--      had to close before the role could exist.
--   3. feast_competition_prints — per-item "printed" status (new concept;
--      unlocks trophy handover). A separate table, not a feast_competitions
--      column: feast_competitions.updated_at drives the public recent-activity
--      feed and /screen's publish takeover, so touching that row on print
--      would re-announce the item as freshly published.
--   4. trophy_handovers / certificate_handovers — append-only handover
--      events. Undo stamps undone_at/undone_by instead of deleting, and a
--      re-mark inserts a new row, so the full history stays.
--
-- Idempotent: safe to re-run on any database already at 013.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Role
-- ════════════════════════════════════════════════════════════════════════

-- The role CHECK's name differs across databases built from older copies of
-- 001, so find it by definition rather than by name.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin', 'me_admin', 'sa_admin', 'trophy_manager'));
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. has_role() + RLS
-- ════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER so policies on profiles itself can call it without
-- recursing into profiles' own RLS.
create or replace function public.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = any(p_roles));
$$;

grant execute on function public.has_role(text[]) to anon, authenticated;

-- Client-side writers of these three are /admin/feasts and
-- /admin/feasts/[id] only — both admin-only screens.
drop policy if exists "feasts_auth_all" on feasts;
create policy "feasts_auth_all" on feasts for all
  using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

drop policy if exists "competitions_auth_all" on competitions;
create policy "competitions_auth_all" on competitions for all
  using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

drop policy if exists "feast_competitions_auth_all" on feast_competitions;
create policy "feast_competitions_auth_all" on feast_competitions for all
  using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- Previously listed sa_admin/me_admin (a branch admin could edit anyone's
-- profile) and left out admin (whose edits on /admin/users silently matched
-- no rows). Now matches /api/admin/create-user: admin + me_admin.
drop policy if exists "Admin insert profiles" on profiles;
create policy "Admin insert profiles" on profiles
  for insert with check (public.has_role(array['admin', 'me_admin']));

drop policy if exists "Admin update profiles" on profiles;
create policy "Admin update profiles" on profiles
  for update using (public.has_role(array['admin', 'me_admin']));

drop policy if exists "Admin delete profiles" on profiles;
create policy "Admin delete profiles" on profiles
  for delete using (public.has_role(array['admin', 'me_admin']));

-- "Users can update own profile" stays (name edits), but RLS can't compare
-- old vs new values, so role/scope changes are blocked here instead. Only
-- enforced for API callers (anon/authenticated JWTs): the service-role
-- client and direct SQL (SQL editor, import scripts) pass through.
create or replace function public.profiles_guard_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := to_jsonb(old);
begin
  -- Compared via jsonb so a database built from an older 001 without
  -- meghala_id/diocese_id still works (missing keys compare as equal nulls).
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and (n->>'role' is distinct from o->>'role'
          or n->>'shakha_id' is distinct from o->>'shakha_id'
          or n->>'meghala_id' is distinct from o->>'meghala_id'
          or n->>'diocese_id' is distinct from o->>'diocese_id')
     and not public.has_role(array['admin', 'me_admin'])
  then
    raise exception 'Only an admin can change a user''s role or scope';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_cols on profiles;
create trigger profiles_guard_privileged_cols
  before update on profiles
  for each row execute function public.profiles_guard_privileged_cols();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Printed status per item
-- ════════════════════════════════════════════════════════════════════════

-- A row exists = the item's certificates/results are printed. Set when
-- certificates are generated for the item (or by the manual toggle on
-- /admin/results), removed by the toggle or on unpublish (a print of
-- results that no longer stand is stale).
create table if not exists feast_competition_prints (
  feast_competition_id uuid primary key references feast_competitions(id) on delete cascade,
  printed_at           timestamptz not null default now(),
  printed_by           uuid references profiles(id) on delete set null
);

-- ════════════════════════════════════════════════════════════════════════
-- 4. Handovers
-- ════════════════════════════════════════════════════════════════════════

-- One row per trophy handed to one winner entry (a tied position is several
-- entries; a team is one entry). position/winner_name/shakha_id are a
-- snapshot taken at handover time, so the audit trail still reads right if
-- the result is later unpublished and re-published differently.
create table if not exists trophy_handovers (
  id                     uuid primary key default gen_random_uuid(),
  feast_id               uuid not null references feasts(id) on delete cascade,
  feast_competition_id   uuid not null references feast_competitions(id) on delete cascade,
  competition_result_id  uuid references competition_results(id) on delete cascade,
  team_result_id         uuid references team_results(id) on delete cascade,
  position               smallint not null check (position between 1 and 3),
  winner_name            text not null default '',
  shakha_id              uuid references shakhas(id) on delete set null,
  -- A placed winner's certificate normally goes out with the trophy.
  with_certificate       boolean not null default true,
  -- Only when someone other than the winner collects it.
  receiver_name          text,
  receiver_phone         text,
  handed_over_by         uuid references profiles(id) on delete set null,
  handed_over_at         timestamptz not null default now(),
  undone_at              timestamptz,
  undone_by              uuid references profiles(id) on delete set null,
  undo_reason            text,
  constraint trophy_handovers_source_check check (
    (competition_result_id is not null) <> (team_result_id is not null)
  )
);

create index if not exists trophy_handovers_feast_idx on trophy_handovers (feast_id);
-- At most one *active* handover per winner entry; undone rows don't count.
create unique index if not exists trophy_handovers_active_result_uq
  on trophy_handovers (competition_result_id)
  where undone_at is null and competition_result_id is not null;
create unique index if not exists trophy_handovers_active_team_uq
  on trophy_handovers (team_result_id)
  where undone_at is null and team_result_id is not null;

-- Certificates go out in bulk to one representative of a Mekhala (meghala)
-- or Shakha ('meghala'/'shakha' scope), or individually for one result
-- ('result' scope — a team result covers all its members' certificates). A
-- unit handover covers that unit's certificates printed at or before
-- handed_over_at, so a unit can be handed a second batch later — hence no
-- unique constraint on the unit columns.
create table if not exists certificate_handovers (
  id                     uuid primary key default gen_random_uuid(),
  feast_id               uuid not null references feasts(id) on delete cascade,
  scope                  text not null check (scope in ('meghala', 'shakha', 'result')),
  meghala_id             uuid references meghalas(id) on delete cascade,
  shakha_id              uuid references shakhas(id) on delete cascade,
  competition_result_id  uuid references competition_results(id) on delete cascade,
  team_result_id         uuid references team_results(id) on delete cascade,
  certificate_count      integer not null default 0,
  receiver_name          text,
  receiver_phone         text,
  handed_over_by         uuid references profiles(id) on delete set null,
  handed_over_at         timestamptz not null default now(),
  undone_at              timestamptz,
  undone_by              uuid references profiles(id) on delete set null,
  undo_reason            text,
  constraint certificate_handovers_target_check check (
    (scope = 'meghala' and meghala_id is not null and shakha_id is null
       and competition_result_id is null and team_result_id is null)
    or (scope = 'shakha' and shakha_id is not null and meghala_id is null
       and competition_result_id is null and team_result_id is null)
    or (scope = 'result' and meghala_id is null and shakha_id is null
       and (competition_result_id is not null) <> (team_result_id is not null))
  )
);

create index if not exists certificate_handovers_feast_idx on certificate_handovers (feast_id);
create unique index if not exists certificate_handovers_active_result_uq
  on certificate_handovers (competition_result_id)
  where undone_at is null and competition_result_id is not null;
create unique index if not exists certificate_handovers_active_team_uq
  on certificate_handovers (team_result_id)
  where undone_at is null and team_result_id is not null;

-- RLS on with no policies: unlike the older results tables (RLS off by
-- convention), these deny the anon/authenticated keys outright. Every read
-- and write goes through src/actions/handover.ts with the service-role
-- client, which bypasses RLS.
alter table feast_competition_prints enable row level security;
alter table trophy_handovers         enable row level security;
alter table certificate_handovers    enable row level security;
