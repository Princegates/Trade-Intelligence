import { DEFAULT_THEME, MODE_COOKIE, THEME_COOKIE } from "@/lib/themes";

// Runs synchronously during HTML parsing, before first paint, so the right
// theme/mode is applied with no flash. See Next.js's "preventing flash
// before hydration" guide — this is the canonical pattern for it.
const script = `(function(){
  try {
    var m1 = document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
    var m2 = document.cookie.match(/(?:^|; )${MODE_COOKIE}=([^;]*)/);
    var theme = m1 ? decodeURIComponent(m1[1]) : "${DEFAULT_THEME}";
    var mode = m2
      ? decodeURIComponent(m2[1])
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-mode", mode);
    root.setAttribute("data-theme-ready", "true");
  } catch (e) {}
})();`;

export function ThemeScript() {
  // type flips to "text/plain" on the client so React never tries to
  // re-execute this as a script during client-side rendering/navigation —
  // it only needs to run once, synchronously, while the server HTML is
  // being parsed. suppressHydrationWarning covers the resulting type
  // mismatch between server and client markup.
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
