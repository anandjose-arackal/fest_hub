-- Widens org_settings.theme's allowed values from 3 to 5 palettes (see
-- globals.css's [data-fp-theme] blocks and PortalTheme in src/types/index.ts)
-- — violet/ocean/sunset keep their ids (only their underlying colors
-- changed) and two new ids, aurora and carnival, join them.
-- Idempotent: safe to re-run.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'org_settings_theme_check'
  ) then
    alter table org_settings drop constraint org_settings_theme_check;
  end if;
  alter table org_settings add constraint org_settings_theme_check
    check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival'));
end $$;
