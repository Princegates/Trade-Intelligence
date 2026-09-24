import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PasswordForm } from "@/components/account/password-form";
import { RedeemCodeForm } from "@/components/account/redeem-code-form";
import { requireUser } from "@/lib/auth";
import { hasFullAccess, daysRemaining } from "@/lib/access";

export default async function AccountSettingsPage() {
  const user = await requireUser();
  const fullAccess = hasFullAccess(user);
  const remaining = daysRemaining(user);

  return (
    <div className="max-w-2xl space-y-6">
      {user.role !== "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              {fullAccess
                ? `Full access — ${remaining === 0 ? "trial ends today" : `${remaining} day${remaining === 1 ? "" : "s"} left`}.`
                : "You're on the basic view (latest signal only). Enter a code from your admin to unlock full history."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RedeemCodeForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account security</CardTitle>
          <CardDescription>Change the password used to sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
