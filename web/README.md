# Trade Intelligence — Web

The public site, login, user dashboard, and admin panel for Trade Intelligence, built with commercialization in
mind: real accounts (Supabase Auth), an admin-only settings panel with pre-wired API config slots (email, SMS,
payments, push, AI), 10 visual themes, and a day/night mode. It reads the same kind of BTC/gold signals the
Python engine in the repo root produces (see `../README.md`), with sample data shown until a live Supabase
project is wired up.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for styling, with a CSS-variable theme system (10 themes × light/dark)
- **Supabase** (Postgres + Auth) for accounts, roles, settings, and signals
- Radix UI primitives for accessible components (Tabs, Select, Dialog, Switch, Dropdown, Avatar)

## Demo mode (no setup required)

Without Supabase credentials, the app runs in **demo mode**: `/dashboard` and `/admin` are viewable directly
(no login wall), all data is mock data from `src/lib/demo-data.ts`, and nothing you edit in the admin settings
panel or user table is persisted. This is intentional — it's how you can look around the whole product,
including the admin settings panel with Stripe/Paystack/Hubtel/Twilio/etc. slots, before creating a Supabase
project. It's controlled entirely by `isSupabaseConfigured()` (`src/lib/supabase/env.ts`) checking for
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — once those are set, demo mode turns off
everywhere automatically.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is enough to start).

3. **Run the schema migrations.** In the Supabase SQL editor, paste and run every file in
   `supabase/migrations/`, **in filename order** (`0001_init.sql`, `0002_...`, and so on through the highest
   number) — each one builds on the last. They create `profiles` (roles + admin-approval), `app_settings` (the
   settings panel's storage), `signals` and friends (mirrors the Python engine's schema), and `site_appearance`
   (the admin-controlled theme), all with Row Level Security policies. All of them are safe to re-run if you're
   ever unsure whether one already applied.

4. **Set environment variables.** Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Settings → API in the Supabase dashboard.
   - `SUPABASE_SERVICE_ROLE_KEY` — same page. Server-only, never sent to the browser.
   - `NEXT_PUBLIC_SITE_URL` — your deployed URL (used for the email confirmation link).

5. **Sign up through the app**, then promote yourself to admin from the Supabase SQL editor (there's no other
   way to create the first admin, by design). Every new signup starts unapproved (see "Access control"
   below), so set both columns together for your own account:

   ```sql
   update public.profiles set role = 'admin', approved = true where email = 'you@example.com';
   ```

6. **Run it:**

   ```bash
   npm run dev
   ```

## Project layout

```
src/
  app/
    (marketing)/      Public site: landing, pricing, about
    (auth)/            Login, signup
    auth/callback/     Supabase email-confirmation redirect target
    dashboard/         Signed-in user area: signals, history, profile settings
    admin/             Admin-only: overview, user management, appearance, settings panel
  components/
    ui/                Shared primitives (button, card, table, tabs, dialog, ...)
    layout/            Navbar, footer, dashboard/admin shell (sidebar + header)
    dashboard/, admin/ Feature-specific components
  lib/
    supabase/          Browser/server/admin Supabase clients + hand-written DB types
    auth.ts            requireUser() / requireAdmin() — used by every protected page
    signals.ts          Reads the signals table, falls back to demo data
    settings.ts, actions/settings.ts   Admin settings panel data + save action
    users.ts, actions/users.ts         Admin user management
    demo-data.ts       All mock/demo data in one place
    themes.ts          Theme metadata (keep in sync with scripts/generate-themes.mjs)
    site-appearance.ts, actions/appearance.ts   Site-wide theme: read + admin-only save
supabase/migrations/    SQL schema + RLS policies
scripts/generate-themes.mjs   Regenerates src/app/themes.css from theme definitions
```

## Theme system

10 themes (Default, Midnight, Ocean, Forest, Sunset, Royal, Crimson, Gold Rush, Cyberpunk, Slate Mono), each
with its own light and dark palette and a slightly different corner radius for visual character. Themes are
plain CSS custom properties keyed by `[data-theme="..."]` / `[data-theme="..."][data-mode="dark"]` selectors
on `<html>`, mapped into Tailwind's color tokens via `@theme inline` in `globals.css`.

The theme is a **single site-wide setting, not a per-visitor preference**: only an admin can change it (from
`/admin/appearance`), and it then applies to every visitor — the public site and every user's dashboard alike.
`app/layout.tsx` reads the current value server-side from the `site_appearance` table
(`src/lib/site-appearance.ts`) and renders it directly as the real `data-theme`/`data-mode` attributes on
`<html>` — there's no client-side cookie or inline script involved, since the server already knows the correct
value for everyone.

To change a theme's hue/saturation/radius, edit the `THEMES` array in `scripts/generate-themes.mjs` and run
`npm run generate-themes` — this regenerates `src/app/themes.css`. Don't hand-edit that file.

## Access control

Public signup is open, but a new account starts **unapproved**: `src/lib/auth.ts#requireUser` redirects an
unapproved, non-admin user to `/pending` instead of the dashboard. An admin approves (or later revokes) access
per-user from `/admin/users`, via the switch in the "Access" column (`setUserApproval` in
`src/lib/actions/users.ts`). Admins always have access regardless of their own `approved` flag.

This is enforced in two layers, matching how the rest of the schema is built: the page-level redirect above,
and Row Level Security on `signal_suppressions`, `candles`, and `economic_events` (gated on the
`public.has_access()` SQL function, added in `0009_access_approval.sql`) — an authenticated-but-unapproved
session can't read those tables directly either, not just through the UI. `signals` itself is deliberately left
out of that RLS tightening: `0008_public_signal_preview.sql` already made it fully readable by anonymous
visitors for the homepage preview, so gating the authenticated policy on approval wouldn't add anything real.

## Settings panel (email / SMS / payments / push / AI)

`/admin/settings` has a tab per category, each listing provider cards from `SETTINGS_PROVIDERS` in
`src/lib/demo-data.ts` (Resend/SendGrid/Postmark/SES for email; Twilio/Hubtel/Vonage for SMS; Stripe/Paystack/
Hubtel Payments for payments; Web Push/FCM for push; Anthropic/OpenAI for AI). Saving writes to the
`app_settings` table (admin-only via RLS). Secret fields (API keys, tokens) are **never sent back to the
browser** after saving — the form shows a "Saved — leave blank to keep" placeholder instead of the value, and
the save action only overwrites a field if you actually typed a new value into it.

Payments are config-only for now (per the current scope): the panel stores provider credentials, but no
checkout flow is wired up yet — billing is handled manually until that's built.

## Connecting the Python signal engine

The `signals` table mirror in `supabase/migrations/0001_init.sql` matches the schema the Python engine
(`../src/storage/db.py`) already writes to SQLite. To show live signals instead of demo data, point the
GitHub Actions cron job at this Supabase database (e.g. add a small `src/storage/supabase_db.py` writer, or
swap the sqlite3 calls for `psycopg`/the Supabase REST API) instead of — or in addition to — the committed
SQLite file. Until then, `/dashboard` and `/admin` show demo data whenever the `signals` table is empty.

## Deploying

Any Next.js host works (Vercel is the path of least resistance). Set the same environment variables from
`.env.example` in the host's dashboard. Nothing here needs a persistent filesystem — all state lives in
Supabase.
