-- Adds the "nebula" (Nebula Glass — futuristic neon glass on deep space,
-- gold winners) Fest Portal theme — see globals.css's [data-fp-theme="nebula"]
-- blocks and PortalTheme in src/types/index.ts — to org_settings.theme's
-- allowed values. Same drop-and-recreate as 012; idempotent, safe to re-run.

alter table org_settings drop constraint if exists org_settings_theme_check;

alter table org_settings add constraint org_settings_theme_check
  check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival', 'amethyst', 'golden', 'plum', 'midnight', 'emerald', 'championship', 'burgundy', 'nebula'));
