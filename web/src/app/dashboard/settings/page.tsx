import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PasswordForm } from "@/components/account/password-form";
import { RedeemCodeForm } from "@/components/account/redeem-code-form";
import { requireUser } from "@/lib/auth";
import { hasFullAccess, daysRemaining } from "@/lib/access";
import { ADMIN_WHATSAPP, SITE_NAME } from "@/lib/site";

export default async function AccountSettingsPage() {
  const user = await requireUser();
  const fullAccess = hasFullAccess(user);
  const remaining = daysRemaining(user);

  // Opens a WhatsApp chat with the admin, message pre-filled with the
  // account's email so the admin knows whose code to generate.
  const whatsAppLink = `https://wa.me/${ADMIN_WHATSAPP.international}?text=${encodeURIComponent(
    `Hi, I'd like an access code to unlock premium on ${SITE_NAME}. My account email is ${user.email}.`
  )}`;

  return (
    <div className="max-w-2xl space-y-6">
      {user.role !== "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              {fullAccess ? (
                `Full access — ${remaining === 0 ? "trial ends today" : `${remaining} day${remaining === 1 ? "" : "s"} left`}.`
              ) : (
                <>
                  Enter a code to unlock premium. Contact admin on WhatsApp only:{" "}
                  <a
                    href={whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {ADMIN_WHATSAPP.display}
                  </a>
                  .
                </>
              )}
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
