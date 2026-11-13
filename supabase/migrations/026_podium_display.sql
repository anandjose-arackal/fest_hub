-- The LED screen behind the winner podium (/podium), driven by an operator
-- on /admin/trophies/podium. A single row holds what it shows:
--   mode 'item'      → winners of feast_competition_id (null → idle backdrop
--                      and the badge animation, alternating)
--   mode 'standings' → top 3 diocese / meghala / shakha of feast_id
create table if not exists public.podium_display (
  id boolean primary key default true check (id),
  feast_competition_id uuid references public.feast_competitions(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.podium_display add column if not exists mode text not null default 'item';
alter table public.podium_display add column if not exists feast_id uuid references public.feasts(id) on delete set null;
alter table public.podium_display drop constraint if exists podium_display_mode_check;
alter table public.podium_display add constraint podium_display_mode_check check (mode in ('item', 'standings'));

insert into public.podium_display (id) values (true) on conflict (id) do nothing;

-- Public read (the screen polls it with the anon key); writes only through
-- the setPodiumDisplay server action (service role).
alter table public.podium_display enable row level security;
drop policy if exists "podium_display_public_read" on public.podium_display;
create policy "podium_display_public_read" on public.podium_display for select using (true);
