import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSiteAppearance } from "@/lib/site-appearance";
import { ModeProvider } from "@/components/mode/mode-provider";
import { ModeScript } from "@/components/mode/mode-script";
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
    default: "SignalsVault AI",
    template: "%s | SignalsVault AI",
  },
  description:
    "Trade intelligence for BTC and gold: rule-based signals with the reasoning behind every call, and a track record you can audit.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The color theme is a single site-wide, admin-controlled setting (see
  // /admin/appearance) rather than a per-visitor preference, so it's read
  // here server-side and baked straight into data-theme — no client-side
  // cookie or flash-prevention step needed for it, since the server already
  // knows the real value for everyone.
  //
  // Day/night mode is different: every visitor picks their own (ModeToggle),
  // with the admin's `mode` value here acting only as the *default* for a
  // visitor who hasn't chosen yet. That's a per-visitor cookie the server
  // can't see, so data-mode below is just the starting guess — ModeScript
  // corrects it to the visitor's real cookie before first paint, the same
  // flash-prevention pattern the old site-wide theme used to need for both.
  const { theme, mode: defaultMode } = await getSiteAppearance();

  return (
    <html
      lang="en"
      data-theme={theme}
      data-mode={defaultMode}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ModeScript defaultMode={defaultMode} />
      </head>
      <body className="min-h-full flex flex-col">
        <ModeProvider defaultMode={defaultMode}>{children}</ModeProvider>
      </body>
    </html>
  );
}
