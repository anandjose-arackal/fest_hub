-- Adds the "burgundy" (Burgundy Night — wine stage, gold winners) Fest
-- Portal theme — see globals.css's [data-fp-theme="burgundy"] blocks and
-- PortalTheme in src/types/index.ts — to org_settings.theme's allowed
-- values. Same drop-and-recreate as 008/009; idempotent, safe to re-run.

alter table org_settings drop constraint if exists org_settings_theme_check;

alter table org_settings add constraint org_settings_theme_check
  check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival', 'amethyst', 'golden', 'plum', 'midnight', 'emerald', 'championship', 'burgundy'));
