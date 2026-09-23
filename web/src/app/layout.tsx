import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSiteAppearance } from "@/lib/site-appearance";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Trade Intelligence",
    template: "%s | Trade Intelligence",
  },
  description:
    "Rule-based BTC and gold trading signals with the reasoning behind every call, and a track record you can audit.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme is a single site-wide, admin-controlled setting (see
  // /admin/appearance) rather than a per-visitor preference, so it's read
  // here server-side and baked straight into the HTML — no client-side
  // cookie, no inline script, no guess-then-correct flash prevention
  // needed, because the server already knows the real value.
  const { theme, mode } = await getSiteAppearance();

  return (
    <html
      lang="en"
      data-theme={theme}
      data-mode={mode}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
