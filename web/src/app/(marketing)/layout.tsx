import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSessionUser } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <>
      <Navbar isAuthed={!!user} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
