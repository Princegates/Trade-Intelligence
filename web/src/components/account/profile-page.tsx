import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProfileForm } from "@/components/account/profile-form";
import type { SessionUser } from "@/lib/auth";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function ProfilePage({ user }: { user: SessionUser }) {
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="size-12">
              <AvatarFallback>{initials(user.fullName, user.email)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>{user.fullName || user.email}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {user.email}
                <Badge variant="outline" className="capitalize">
                  {user.role}
                </Badge>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={user.fullName} email={user.email} />
        </CardContent>
      </Card>
    </div>
  );
}
