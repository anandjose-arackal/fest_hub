-- Tracks when a feast_competitions row last changed status/results, so the
-- public landing page can derive a "recent activity" feed (results
-- published / competition started / competition completed) from real state
-- transitions instead of needing a separate notifications table.
-- Idempotent: safe to re-run.

alter table feast_competitions add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'feast_competitions_updated_at') then
    create trigger feast_competitions_updated_at
      before update on feast_competitions
      for each row execute procedure set_updated_at();
  end if;
end $$;
