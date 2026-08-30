-- Team/group competition registrations.
-- Idempotent: safe to re-run.

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
