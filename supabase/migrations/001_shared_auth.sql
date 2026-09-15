-- Shared auth/identity foundation: org hierarchy (Diocese -> Meghala ->
-- Shakha) + profiles + auto-provisioning.
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- ── org hierarchy: dioceses -> meghalas -> shakhas ──────────────────────
-- Shakha is the default/leaf level for every org. An org can additionally
-- opt into a Meghala tier, or a full Diocese -> Meghala tier, via
-- org_settings.hierarchy_level ('shakha' | 'meghala' | 'diocese', default
-- 'shakha' — see 006_org_settings.sql). No seed rows here: unlike the
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
