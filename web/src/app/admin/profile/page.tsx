import { ProfilePage } from "@/components/account/profile-page";
import { requireAdmin } from "@/lib/auth";

export default async function AdminProfilePage() {
  const user = await requireAdmin();
  return <ProfilePage user={user} />;
}
