import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <BrandMark />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
