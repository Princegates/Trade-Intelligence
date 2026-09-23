import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export default async function AccountSettingsPage() {
  const user = await requireUser();

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-border py-2">
            <span className="text-muted-foreground">Name</span>
            <span>{user.fullName || "—"}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Email</span>
            <span>{user.email}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
