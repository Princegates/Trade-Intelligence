import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PasswordForm } from "@/components/account/password-form";
import { getSessionUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { changeForcedPassword } from "@/lib/actions/profile";

// Deliberately calls getSessionUser() rather than requireUser() here, same
// reasoning as /pending: requireUser() redirects anyone with
// must_change_password set to this exact page, so using it in the page
// itself would loop.
export default async function ChangePasswordPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard"); // demo mode: nothing to force

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard"); // nothing forced, nothing to do here

  return (
    <Card>
      <CardHeader>
        <KeyRound className="size-8 text-primary" />
        <CardTitle className="mt-2">Set a new password</CardTitle>
        <CardDescription>
          An admin issued you a temporary password. Enter it below along with the new one you want to use going
          forward — you won&apos;t be able to reach the dashboard until it&apos;s changed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordForm action={changeForcedPassword} currentPasswordLabel="Temporary password" />
      </CardContent>
    </Card>
  );
}
