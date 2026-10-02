-- Trade Intelligence: admin-initiated password resets.
--
-- An admin can now set a temporary password for a user (shown to the
-- admin once, same never-stored-plaintext-after-the-fact pattern
-- access_codes already uses) and send it to them out of band. This flag
-- forces that user through a password change before they can reach the
-- dashboard or admin area (src/lib/auth.ts#requireUser/requireAdmin),
-- regardless of role — cleared automatically once they successfully set
-- their own new password (src/lib/actions/profile.ts#changeForcedPassword).
--
-- Safe to re-run.

alter table public.profiles add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Set true when an admin resets this account''s password to a temporary one — forces a password change on next login before the dashboard/admin area is reachable (see /change-password). Cleared automatically once the user sets their own new password.';
