function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`s${n}`} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight">
        <span className="mr-2 text-muted-foreground">{n}.</span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Table({ rows }: { rows: { name: string; purpose: string; duration: string }[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Purpose</th>
            <th className="px-4 py-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono text-xs text-foreground">{r.name}</td>
              <td className="px-4 py-2">{r.purpose}</td>
              <td className="px-4 py-2 whitespace-nowrap">{r.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const metadata = { title: "Cookie Policy" };

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Cookie Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="mt-10 space-y-10">
        <Section n="1" title="What this covers">
          <p>
            This explains the cookies SignalsVault AI sets in your browser, and the closely related browser storage
            (localStorage) it uses for the same kind of purpose — remembering something about you or your device
            between visits. It lists every one we actually use; nothing here is a generic template.
          </p>
        </Section>

        <Section n="2" title="Strictly necessary cookies">
          <p>
            These keep you signed in and the site secure. The service cannot function without them, and they are set
            automatically — there is no consent banner to opt out of them, since &quot;necessary for a service you
            explicitly requested&quot; is the recognized legal basis that lets a strictly-necessary cookie skip
            consent in the first place.
          </p>
          <Table
            rows={[
              {
                name: "sb-*-auth-token",
                purpose: "Supabase Auth session — keeps you signed in across page loads and visits.",
                duration: "Session / up to 1 year (refreshed on use)",
              },
            ]}
          />
        </Section>

        <Section n="3" title="Preference cookie">
          <p>These remember a choice you made so you don&apos;t have to make it again on your next visit.</p>
          <Table
            rows={[
              {
                name: "ti-mode",
                purpose:
                  "Your light/dark mode choice, if you've changed it from the site's default (via the sun/moon toggle).",
                duration: "1 year",
              },
            ]}
          />
        </Section>

        <Section n="4" title="Local storage (not cookies, but similar)">
          <p>
            Browser localStorage isn&apos;t sent to our servers on every request the way a cookie is — it just sits
            in your browser, scoped to this site, until you clear it. We use a few small entries the same way a
            preference cookie works: to remember something about how you left the interface. None of it is sent to
            us or shared with anyone else.
          </p>
          <Table
            rows={[
              { name: "sidebar-pinned", purpose: "Whether the dashboard sidebar is pinned open or collapsed to a rail.", duration: "Until cleared" },
              { name: "ti-chat-fab-pos", purpose: "Where you last dragged the Guda chat bubble on screen.", duration: "Until cleared" },
              { name: "(position-size calculator)", purpose: "The account balance and lot size you last typed into the position-size tool, so it's prefilled next time.", duration: "Until cleared" },
              { name: "(economic calendar)", purpose: "Whether you've collapsed the economic-calendar card on the dashboard.", duration: "Until cleared" },
            ]}
          />
        </Section>

        <Section n="5" title="Analytics — and what we don't use">
          <p>
            We use Vercel Web Analytics for aggregate page-view counts. It doesn&apos;t set a cookie, doesn&apos;t
            use any persistent identifier to recognize you across visits or sites, and doesn&apos;t collect personal
            data — it reports anonymized, aggregated traffic numbers only. Because it sets nothing on your device,
            it isn&apos;t one of the cookies in the tables above and isn&apos;t affected by the choice you make in
            the banner.
          </p>
          <p>
            Beyond that, we don&apos;t run any advertising or tracking scripts — no Google Analytics, no ad pixels,
            no cross-site trackers — and we don&apos;t sell or share browsing data. If that ever changes, this page
            will be updated first, and where required by law, you&apos;ll be asked for consent before anything new
            is set.
          </p>
        </Section>

        <Section n="6" title="Managing and clearing cookies">
          <p>
            Your browser lets you view, delete, and block cookies on a per-site basis, usually under
            Settings → Privacy. Blocking or clearing <span className="font-mono text-xs text-foreground">sb-*-auth-token</span>{" "}
            will sign you out and require logging in again. Blocking or clearing{" "}
            <span className="font-mono text-xs text-foreground">ti-mode</span>, or the localStorage entries above,
            just resets that one preference to its default — nothing else on the site stops working.
          </p>
        </Section>

        <Section n="7" title="Changes">
          <p>
            We may update this policy if what we store changes. Material changes — adding a new tracking or
            advertising cookie in particular — will be reflected here, and where the law requires it, you&apos;ll be
            asked for consent before it&apos;s set.
          </p>
        </Section>

        <Section n="8" title="Contact">
          <p>
            Questions about this policy can be sent to the contact address on the{" "}
            <a href="/about" className="underline underline-offset-4 hover:text-foreground">
              About page
            </a>
            . See also our{" "}
            <a href="/disclaimer" className="underline underline-offset-4 hover:text-foreground">
              Disclaimer
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
