-- Participants and their per-competition registrations.
-- Idempotent: safe to re-run.

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
