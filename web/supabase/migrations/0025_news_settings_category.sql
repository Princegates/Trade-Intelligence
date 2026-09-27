-- Trade Intelligence: add "news" as an app_settings category.
--
-- Backs the Market News card on the dashboard (web/src/lib/news.ts) the
-- same way the existing "ai" category backs the Guda chat feature
-- (web/src/lib/ai-settings.ts) — an admin picks a provider and API token
-- from /admin/settings, ProviderSettingsForm handles the UI generically
-- for any category, no new table needed.
--
-- Safe to re-run.

alter table public.app_settings drop constraint if exists app_settings_category_check;
alter table public.app_settings
  add constraint app_settings_category_check
  check (category in ('email', 'sms', 'payments', 'push', 'ai', 'news'));
