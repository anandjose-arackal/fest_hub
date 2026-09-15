-- Org/area identity as admin-editable configuration (spec §4.1), replacing
-- every hardcoded org-name string ("Cherupushpa Mission League", "Kalpetta",
-- "CML Admin", /logo.png) in the source app. One deployment = one org, so
-- this is a singleton row, not a multi-tenant table.
-- Idempotent: safe to re-run.

create table if not exists org_settings (
  -- Singleton enforced by a fixed boolean PK: only one row can ever exist.
  id              boolean primary key default true,
  org_name_en     text not null default 'Feast Hub',
  org_name_local  text not null default '',
  area_name_en    text not null default '',
  area_name_local text not null default '',
  tagline         text not null default 'Feast Portal',
  logo_url        text not null default '/logo.png',
  -- Which org-hierarchy tier this org opts into (see 001_shared_auth.sql's
  -- dioceses/meghalas/shakhas). 'shakha' (the default) is a flat org with
  -- no grouping above branch level.
  hierarchy_level text not null default 'shakha' check (hierarchy_level in ('shakha', 'meghala', 'diocese')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint org_settings_singleton check (id)
);

insert into org_settings (id) values (true) on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'org_settings_updated_at') then
    create trigger org_settings_updated_at
      before update on org_settings
      for each row execute procedure set_updated_at();
  end if;
end $$;

alter table org_settings enable row level security;

drop policy if exists "org_settings_public_read" on org_settings;
create policy "org_settings_public_read" on org_settings for select using (true);
-- No write policy: edited through /admin/org-settings via getSupabaseAdmin().
