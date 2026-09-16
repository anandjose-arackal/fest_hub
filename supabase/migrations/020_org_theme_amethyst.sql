-- Adds "amethyst" as a 6th org_settings.theme value — the purple/lavender/
-- magenta palette that briefly occupied "violet" before violet's original
-- launch colors (#6B46FF) were restored as their own theme (see
-- globals.css's [data-fp-theme="amethyst"] block).
-- Idempotent: safe to re-run.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'org_settings_theme_check'
  ) then
    alter table org_settings drop constraint org_settings_theme_check;
  end if;
  alter table org_settings add constraint org_settings_theme_check
    check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival', 'amethyst'));
end $$;
