# Feast Hub

A standalone, multi-org feast-competition management product — public registration/results portal, admin back-office, and a public big-screen results display.

**Stack**: Next.js (App Router) + React + TypeScript, Tailwind CSS, shadcn UI components, [Supabase](https://supabase.com) (Postgres + auth), deployed on [Vercel](https://vercel.com).

This guide walks through setting up a brand-new deployment from scratch: a Supabase project, environment variables, database migrations, your first admin account, and deploying to Vercel. If you're going to work on the code itself rather than just deploy it, see [`AGENTS.md`](./AGENTS.md) for architecture, data model, and coding conventions.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New Project**.
   - Pick an organization, give the project a name (e.g. `feast-hub-prod`), and set a database password (save it somewhere — you won't need it day-to-day since the app uses API keys, but it's needed for direct DB access).
   - Choose a region close to where most users will be.
3. Wait for the project to finish provisioning (a minute or two).
4. Once inside the project, find the keys: click the **gear icon (⚙ Project Settings)** near the bottom of the left sidebar, then **API Keys** in the settings menu (older dashboards call this page just **API**). You'll need three values from this page:

   | Value | Where on the page | What it looks like |
   |---|---|---|
   | **Project URL** | Top of the page, labeled "Project URL" | `https://abcdefghijklmnop.supabase.co` — your project's ref ID as a subdomain |
   | **anon / publishable key** | Under "Project API keys" — safe to expose client-side | New-style: starts with `sb_publishable_…`. Legacy-style: a long three-part string starting with `eyJhbGci…` (it's a JWT) |
   | **service_role / secret key** | Same section, usually below the anon key — click "Reveal" to see it — **server-only, never expose this client-side** | New-style: starts with `sb_secret_…`. Legacy-style: another `eyJhbGci…` JWT, longer than the anon one |

   Newer Supabase projects show these as **publishable key** / **secret key**; older ones show **anon key** / **service_role key**. Either naming works — the app just needs the URL, the public key, and the secret key, whichever format they're in.

---

## 2. Configure environment variables

1. Copy the example file:
   ```bash
   cp .env.local.example .env.local
   ```
2. Fill in the four values:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role or secret key>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
3. `.env.local` is git-ignored — it never gets committed. `NEXT_PUBLIC_SITE_URL` should point at your production domain once deployed (see [Deploy to Vercel](#6-deploy-to-vercel) below); locally it stays `http://localhost:3000`.

Without these set, the app falls back to static demo data for local exploration — useful for UI work, but `/setup` and all data-backed pages need a real project connected.

> **Deploying straight to Vercel, skipping local dev entirely?** You don't strictly need to create `.env.local` at all — just keep the three Supabase values (URL, anon/publishable key, service_role/secret key) handy and paste them into Vercel's Environment Variables in [step 6](#6-deploy-to-vercel) instead. Jump to [Run the database migrations](#3-run-the-database-migrations) → [Deploy to Vercel](#6-deploy-to-vercel), skipping step 4 and doing step 5's `/setup` on your live Vercel URL instead of `localhost`.

---

## 3. Run the database migrations

Migrations live in [`supabase/migrations/`](./supabase/migrations/), numbered in the order they must run. Each is idempotent (safe to re-run).

| File | What it creates |
|---|---|
| `001_shared_auth.sql` | `shakhas`, `profiles`, roles, auto-provisioning trigger |
| `002_feast_core.sql` | `feasts`, `competitions`, `competition_categories` (+ seeded age-category cutoffs), `stages`, `feast_competitions` |
| `003_participants.sql` | `participants`, `participant_registrations`, the registration-number sequence |
| `004_teams.sql` | `team_registrations`, `team_registration_members` |
| `005_results.sql` | `competition_results`, `team_results`, `shakha_point_ledger`, `shakha_feast_standings` |
| `006_org_settings.sql` | The `org_settings` singleton (your org's name/logo/tagline) |
| `007_arts_fest_competitions.sql` *(optional)* | Example competition catalog copied from a real deployment — skip this if you'd rather define your own competitions from scratch in the admin panel |
| `008_attach_arts_fest_competitions.sql` *(optional)* | Attaches `007`'s catalog to a specific feast — edit the `feast_id` at the top of the file, or skip entirely |
| `009_feast_competitions_updated_at.sql` | Tracks per-competition status changes for the landing page's Live Updates feed |
| `010_external_feast_points.sql` | `feasts.is_external` — marks a feast whose shakha points are entered by hand (competition happened outside the app) instead of computed from results |
| `011_certificate_templates.sql` | `certificate_templates` — one saved certificate layout (paper size, background image URL, field positions) per feast, used by `/admin/certificates` |

**Option A — Supabase SQL Editor (simplest, no CLI needed):**

1. In your Supabase project, open **SQL Editor**.
2. Open each file in `supabase/migrations/` in order, paste its contents in, and click **Run**.
3. Repeat for `001` through `006` (and `007`/`008` only if you want the example data).

**Option B — Supabase CLI:**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

---

## 4. Install and run locally *(optional — skip if you're deploying straight to Vercel)*

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). If you're not planning to develop locally, skip straight to [Deploy to Vercel](#6-deploy-to-vercel) — you can do step 5 (create your first admin) on your live Vercel URL instead.

---

## 5. Create your first admin account

Once the migrations have run, visit **`/setup`** — either `http://localhost:3000/setup` if you're running locally, or `https://<your-vercel-domain>/setup` if you deployed straight to Vercel (step 6) without a local run. This route is only reachable while the `profiles` table is empty — it lets you create the first Super Admin (`sa_admin`) account and set your organization's basic identity (name, area). Once that account exists, `/setup` permanently redirects to `/admin/login`.

From there, sign in at `/admin/login` and use the admin panel to:
- **Organization Settings** (`/admin/org-settings`) — set your org/area name, tagline, and logo.
- **Shakhas** (`/admin/shakhas`) — add your branch/unit list with colors.
- **Feasts** (`/admin/feasts`) — create a feast, then open it to build its competition lineup and stages.
- **Users** (`/admin/users`) — invite additional admins.

---

## 6. Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Go to [vercel.com](https://vercel.com), sign in, and click **Add New → Project**.
3. Import the repository. Vercel auto-detects Next.js — no build configuration needed.
4. Before deploying, add the same four environment variables described in [step 2](#2-configure-environment-variables) under **Environment Variables** (whether or not you ever created a local `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` — set this to your Vercel deployment URL (e.g. `https://your-app.vercel.app`, or your custom domain once attached)
5. Click **Deploy**.
6. Once live, visit `https://<your-domain>/setup` to create your first admin on the production database (skip this if you already ran `/setup` locally against the same Supabase project — one profile is enough to lock the route).

If you later attach a custom domain in Vercel, update `NEXT_PUBLIC_SITE_URL` to match and redeploy.

---

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint`
- `npx tsc --noEmit` — type-check
