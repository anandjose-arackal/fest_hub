-- Indexes for the read paths tuned in the performance pass. Additive only:
-- no table, column or constraint changes. Idempotent, safe to re-run.

-- "Latest result" card and every published-only read scan a competition's
-- results for published rows, newest first.
create index if not exists competition_results_published_idx
  on competition_results (feast_competition_id, published_at desc)
  where published_at is not null;
create index if not exists team_results_published_idx
  on team_results (feast_competition_id, published_at desc)
  where published_at is not null;

-- Landing page "Results published" banner and live-updates feed: newest
-- competitions by result/run status.
create index if not exists feast_competitions_result_updated_idx
  on feast_competitions (result_status, updated_at desc);
create index if not exists feast_competitions_status_updated_idx
  on feast_competitions (comp_status, updated_at desc);

-- Team rosters and the one-team-per-shakha rule filter a fest's teams by
-- shakha.
create index if not exists team_registrations_feast_shakha_idx
  on team_registrations (feast_id, shakha_id);

-- Admin participant roster lists a fest's participants in registration order.
create index if not exists participants_feast_created_idx
  on participants (feast_id, created_at);
