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

3. **Run the schema migration.** In the Supabase SQL editor, paste and run `supabase/migrations/0001_init.sql`.
   This creates `profiles` (roles), `app_settings` (the settings panel's storage), and `signals` (mirrors the
   Python engine's schema), all with Row Level Security policies.

4. **Set environment variables.** Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Settings → API in the Supabase dashboard.
   - `SUPABASE_SERVICE_ROLE_KEY` — same page. Server-only, never sent to the browser.
   - `NEXT_PUBLIC_SITE_URL` — your deployed URL (used for the email confirmation link).

5. **Sign up through the app**, then promote yourself to admin from the Supabase SQL editor (there's no other
   way to create the first admin, by design):

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
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
    dashboard/         Signed-in user area: signals, history, profile/theme settings
    admin/             Admin-only: overview, user management, settings panel
  components/
    theme/             10-theme + day/night system (see below)
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
supabase/migrations/    SQL schema + RLS policies
scripts/generate-themes.mjs   Regenerates src/app/themes.css from theme definitions
```

## Theme system

10 themes (Default, Midnight, Ocean, Forest, Sunset, Royal, Crimson, Gold Rush, Cyberpunk, Slate Mono), each
with its own light and dark palette and a slightly different corner radius for visual character. Themes are
plain CSS custom properties keyed by `[data-theme="..."]` / `[data-theme="..."][data-mode="dark"]` selectors
on `<html>`, mapped into Tailwind's color tokens via `@theme inline` in `globals.css`.

- To change a theme's hue/saturation/radius, edit the `THEMES` array in `scripts/generate-themes.mjs` and run
  `npm run generate-themes` — this regenerates `src/app/themes.css`. Don't hand-edit that file.
- Switching is instant and flash-free: an inline script in `app/layout.tsx` (`ThemeScript`) reads the
  `ti-theme`/`ti-mode` cookies and sets the `data-theme`/`data-mode` attributes before first paint. This is
  Next.js's documented pattern for avoiding a flash of the wrong theme.
- `ThemeProvider` (React context) and the `ThemePicker`/`ModeToggle` components handle live switching and
  persist the choice back to the same cookies.

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
