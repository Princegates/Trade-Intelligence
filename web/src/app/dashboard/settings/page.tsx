import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThemePicker } from "@/components/theme/theme-picker";
import { ModeToggle } from "@/components/theme/mode-toggle";
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

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Pick a theme and switch between day and night mode.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Day / night</span>
            <ModeToggle />
          </div>
          <ThemePicker />
        </CardContent>
      </Card>
    </div>
  );
}
