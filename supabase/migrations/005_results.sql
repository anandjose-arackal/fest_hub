-- Results, scoring, and standings.
-- Idempotent: safe to re-run.
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
