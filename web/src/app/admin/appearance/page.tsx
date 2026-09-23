import { AppearanceForm } from "@/components/admin/appearance-form";
import { getSiteAppearance } from "@/lib/site-appearance";
import { requireAdmin } from "@/lib/auth";

export default async function AdminAppearancePage() {
  await requireAdmin();
  const current = await getSiteAppearance();

  return (
    <div className="max-w-3xl">
      <AppearanceForm current={current} />
    </div>
  );
}
