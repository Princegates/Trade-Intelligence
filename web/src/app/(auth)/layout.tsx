import Link from "next/link";
import { LineChart } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <LineChart className="size-5 text-primary" />
        <span>Trade Intelligence</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
