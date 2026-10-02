import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleSelect } from "@/components/admin/role-select";
import { ApprovalToggle } from "@/components/admin/approval-toggle";
import { AccessCodeButton } from "@/components/admin/access-code-button";
import { ResetPasswordButton } from "@/components/admin/reset-password-button";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { listUsers } from "@/lib/users";
import { hasFullAccess, daysRemaining } from "@/lib/access";
import { requireAdmin } from "@/lib/auth";
import { getAccessPolicy } from "@/lib/access-policy";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export default async function AdminUsersPage() {
  const [admin, users, { trialDays }] = await Promise.all([requireAdmin(), listUsers(), getAccessPolicy()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access control</CardTitle>
        <CardDescription>Approve new sign-ups before they can reach the dashboard, and set who&apos;s an admin.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {/* Below md, the 7-column table forces a sideways scroll a phone
            visitor may not even notice is there — a stacked card per user
            reads top-to-bottom instead, reusing exactly the same
            interactive components as the table (so there's one source of
            truth for the actions themselves, just two layouts around
            them). Both render in the DOM at every width; only one is ever
            visible, same hidden/md: pattern DashboardShell already uses
            for its two sidebars. */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const remaining = daysRemaining(u);
                const fullAccess = hasFullAccess(u);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{initials(u.fullName, u.email)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{u.fullName || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <ApprovalToggle userId={u.id} approved={u.approved} />
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant={fullAccess ? "outline" : "warning"}>
                            {fullAccess ? `${remaining}d left` : "Basic view"}
                          </Badge>
                          <AccessCodeButton userId={u.id} name={u.fullName || u.email} defaultDays={trialDays} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <RoleSelect userId={u.id} role={u.role} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ResetPasswordButton userId={u.id} name={u.fullName || u.email} />
                        <DeleteUserButton userId={u.id} name={u.fullName || u.email} isSelf={u.id === admin.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="divide-y divide-border md:hidden">
          {users.map((u) => {
            const remaining = daysRemaining(u);
            const fullAccess = hasFullAccess(u);
            return (
              <div key={u.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="shrink-0">
                      <AvatarFallback>{initials(u.fullName, u.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium">{u.fullName || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                  <ApprovalToggle userId={u.id} approved={u.approved} />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                  <RoleSelect userId={u.id} role={u.role} />
                </div>

                {u.role !== "admin" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={fullAccess ? "outline" : "warning"}>
                      {fullAccess ? `${remaining}d left` : "Basic view"}
                    </Badge>
                    <AccessCodeButton userId={u.id} name={u.fullName || u.email} defaultDays={trialDays} />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <ResetPasswordButton userId={u.id} name={u.fullName || u.email} />
                  <DeleteUserButton userId={u.id} name={u.fullName || u.email} isSelf={u.id === admin.id} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
