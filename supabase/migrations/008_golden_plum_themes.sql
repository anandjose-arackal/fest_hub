-- Adds the "golden" (Golden Yellow / Electric Violet / Soft Ivory) and
-- "plum" (Royal Plum / Mint Mist / Vanilla Cream) Fest Portal themes — see
-- globals.css's [data-fp-theme="..."] blocks and PortalTheme in
-- src/types/index.ts — to org_settings.theme's allowed values.
-- 001_schema.sql declared the check inline, so Postgres named it
-- org_settings_theme_check. Idempotent: safe to re-run.

alter table org_settings drop constraint if exists org_settings_theme_check;

alter table org_settings add constraint org_settings_theme_check
  check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival', 'amethyst', 'golden', 'plum', 'midnight', 'emerald'));
