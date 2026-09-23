import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { signOut } from "@/lib/actions/auth";

// Deliberately calls getSessionUser() rather than requireUser() here:
// requireUser() redirects an unapproved user to this exact page, so using
// it in the page itself would loop. This page does its own, narrower check.
export default async function PendingPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard"); // demo mode: nothing to wait for

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.approved || user.role === "admin") redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <Clock className="size-8 text-primary" />
        <CardTitle className="mt-2">Almost there</CardTitle>
        <CardDescription>
          Your account is created, but an admin needs to confirm access before you can use the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{user.email}</span>. You&apos;ll be able to reach the
          dashboard as soon as an admin approves your account — no need to sign up again.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
