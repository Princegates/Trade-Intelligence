import { ProfilePage } from "@/components/account/profile-page";
import { requireUser } from "@/lib/auth";

export default async function DashboardProfilePage() {
  const user = await requireUser();
  return <ProfilePage user={user} />;
}
