-- One certificate layout per feast: paper size, a pasted background-image
-- URL (no upload infra in this app — see AGENTS.md), and a jsonb array of
-- placed data fields (participant name / place / shakha / grade text /
-- grade tick-mark). Read/written only through src/actions/certificates.ts
-- via getSupabaseAdmin() — no public consumer of this table exists (unlike
-- org_settings), so it gets no RLS at all, same convention as
-- competition_results/team_results in 005_results.sql.
-- Idempotent: safe to re-run.

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
