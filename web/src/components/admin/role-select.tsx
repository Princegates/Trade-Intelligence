"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setUserRole } from "@/lib/actions/users";
import type { Role } from "@/lib/supabase/types";

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(value) =>
        startTransition(async () => {
          await setUserRole(userId, value as Role);
        })
      }
    >
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user">User</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}
