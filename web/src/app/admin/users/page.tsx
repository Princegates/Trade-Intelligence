import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleSelect } from "@/components/admin/role-select";
import { ApprovalToggle } from "@/components/admin/approval-toggle";
import { listUsers } from "@/lib/users";

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
  const users = await listUsers();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access control</CardTitle>
        <CardDescription>Approve new sign-ups before they can reach the dashboard, and set who&apos;s an admin.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
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
                  <RoleSelect userId={u.id} role={u.role} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
