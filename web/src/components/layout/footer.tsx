import Link from "next/link";
import { LineChart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LineChart className="size-4" />
          <span>&copy; {new Date().getFullYear()} Trade Intelligence. Not financial advice.</span>
        </div>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/about" className="hover:text-foreground">About</Link>
          <Link href="/login" className="hover:text-foreground">Log in</Link>
        </nav>
      </div>
    </footer>
  );
}
