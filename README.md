# Feast Hub

A standalone, multi-org feast-competition management product — public registration/results portal, admin back-office, and a public big-screen results display. See [`AGENTS.md`](./AGENTS.md) for architecture and conventions.

Extracted and rebuilt from `cml-mission-hub`'s Feast Portal per the extraction spec (`CMLFeastPortalExtractionSpec.md`), generalized so any organization can deploy and self-configure it (org identity, shakha list, first admin, and competition stages are admin-editable, not hardcoded).

## Getting started

1. Copy `.env.local.example` to `.env.local` and fill in a Supabase project's URL/keys.
2. Apply the migrations in `supabase/migrations/` (in order) to that project.
3. `npm install`
4. `npm run dev`, then visit `/setup` to create the first admin (only reachable while no admin exists yet).

Without Supabase env vars set, the app falls back to static demo data for local exploration.

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint`
- `npx tsc --noEmit` — type-check
