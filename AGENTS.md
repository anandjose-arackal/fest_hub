# Feast Hub

A standalone, multi-org feast-competition management product: public registration/results portal, admin back-office, and a public big-screen results display — extracted and rebuilt from `cml-mission-hub`'s Feast Portal per `CMLFeastPortalExtractionSpec.md`.

**Stack**: Next.js (check `package.json` for the exact pinned version — this repo tracks whatever was latest-stable at scaffold time, not a fixed major). Framework majors move fast; **read that version's own bundled docs in `node_modules/next/dist/docs/` before writing framework-specific code**, since training data can lag a fast-moving major.

React 19, TypeScript, Tailwind CSS v4, shadcn (`base-nova` preset, `lucide-react` icons — verify an icon name exists in the installed version before importing), Supabase (`@supabase/supabase-js`), `framer-motion` (Feast Portal nav spring physics), `react-easy-crop` + `html-to-image` (poster generator).

## Multi-org, not single-org

Unlike the source app this was extracted from, **nothing here is hardcoded to one organization**. Org name, area name, tagline, logo, shakha list (with colors), and competition stages are admin-configurable through the database (`org_settings`, `shakhas`, `stages` tables), not literal strings or SQL seeds. When adding a new screen, never hardcode an org/area name — read it from `org_settings`.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (the real correctness gate — run before considering a feature done)
- `npm run lint` — note: `react-hooks/set-state-in-effect` fires on `auth-context.tsx`'s synchronous `setState` inside `onAuthStateChange`'s effect. This is intentional (see the comment there — deferring it would deadlock GoTrue's `initialize()`); it fails `lint`, not `build`. Don't "fix" it by removing the sync call.
- `npx tsc --noEmit`

## Data model summary

`feasts` → `feast_competitions` (joins `competitions`, carries `gender`/`competition_category_id`/`stage_id`) → `participants` (`shakha_id`, `house_name`, `registration_number`, `competition_category_id`) → `participant_registrations` (per-entry, `participated` boolean, `chance_no`). Team competitions mirror this via `team_registrations`/`team_registration_members`. Categories (`sub_junior | junior | senior | super_senior | elder`) derive from DOB against `competition_categories` (DB is the single source of truth for cutoffs — don't duplicate the thresholds in TS).

Scoring: scores land in `competition_results`/`team_results`; publishing computes grade/position/points (`src/lib/result-calculator.ts`, pure functions), writes `shakha_point_ledger`, rebuilds `shakha_feast_standings`. `feast_competitions.result_status` is `draft | published`; unpublish reverses.

## Auth / roles

`useAuth()` (`src/lib/auth-context.tsx`) exposes the signed-in admin's profile. `UserRole = admin | me_admin | sa_admin`, profiles joined to `shakhas`. The very first admin is created through `/setup` (only reachable while `profiles` is empty).

## RLS convention

Public-read tables (`shakhas`, `feasts`, `feast_competitions`, `competitions`, `competition_categories`, `participants`, `participant_registrations`, `stages`) are queried directly client-side with the anon client. Tables with no write policy — including `competition_results`, `team_results`, `shakha_point_ledger`, `shakha_feast_standings` (RLS intentionally off on these 4, by convention not enforcement) — must be written through a `"use server"` action using `getSupabaseAdmin()` (service-role client, server-only, never imported client-side), returning `{ error?: string }`.

Supabase nested-relation results need defensive unwrapping: `Array.isArray(x) ? x[0] : x`.

## Admin page convention

Every `/admin/*` listing page dual-renders: a `hidden sm:block` desktop `<table>` and a `sm:hidden` mobile card stack — admin is used heavily on phones at the venue. New admin pages: `src/app/admin/<feature>/page.tsx` (`"use client"`) → register in `NAV_SECTIONS` (`src/app/admin/layout.tsx`) → server action for writes → idempotent SQL migration if schema changes → verify with `npx tsc --noEmit` + `npm run build`.

## Responsive scope

Every surface must work well at phone, tablet, laptop, and large-desktop (21") widths — not just "doesn't break." The Feast Portal in particular has no `max-w-md` ceiling here (unlike the source app it was extracted from); design real breakpoints per screen.

## Migrations

Plain SQL under `supabase/migrations/`, applied in order, must be idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING` guards).
