import { MODE_COOKIE, type Mode } from "@/lib/themes";

// Runs synchronously during HTML parsing, before first paint, so a
// visitor's own day/night choice (if they have one) is applied with no
// flash — the same pattern the old site-wide ThemeScript used, now scoped
// to just this one per-visitor attribute. `defaultMode` is the admin's
// chosen default (site_appearance.mode) for a visitor with no cookie yet.
function buildScript(defaultMode: Mode) {
  return `(function(){
  try {
    var m = document.cookie.match(/(?:^|; )${MODE_COOKIE}=([^;]*)/);
    var mode = m ? decodeURIComponent(m[1]) : "${defaultMode}";
    if (mode !== "light" && mode !== "dark") mode = "${defaultMode}";
    document.documentElement.setAttribute("data-mode", mode);
  } catch (e) {}
})();`;
}

export function ModeScript({ defaultMode }: { defaultMode: Mode }) {
  const script = buildScript(defaultMode);
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
