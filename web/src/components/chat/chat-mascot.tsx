/** A small animated robot character for the chat FAB — inline SVG, no
 * image asset or new dependency, styled after a glossy white bot with a
 * glowing cyan face (open the chat and compare). Gradients + a highlight
 * streak give the plastic shell a 3D, glossy-toy look instead of flat
 * vector fills. Antennae wiggle, the eyes blink, and the chest light
 * pulses continuously via CSS (see globals.css); the mouth widens
 * slightly once the panel is open, so it visibly reacts to being clicked.
 * Colors are fixed rather than theme-derived — a mascot keeps its own
 * palette regardless of which of the ten site themes is active, the same
 * way a logo would. There's only ever one of these on screen at a time
 * (the single persistent chat widget), so the gradient/filter ids below
 * are plain fixed strings rather than generated per instance. */
export function ChatMascot({ open }: { open: boolean }) {
  const GLOW = "#22e6e0";

  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 overflow-visible drop-shadow-[0_8px_14px_rgba(0,0,0,0.32)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mascot-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#eef1f6" />
          <stop offset="100%" stopColor="#ccd4de" />
        </linearGradient>
        <linearGradient id="mascot-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#333f52" />
          <stop offset="100%" stopColor="#0f141d" />
        </linearGradient>
        <radialGradient id="mascot-screen" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#2c3a4d" />
          <stop offset="100%" stopColor="#0a0f17" />
        </radialGradient>
        <radialGradient id="mascot-glow" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e8fffd" />
          <stop offset="45%" stopColor={GLOW} />
          <stop offset="100%" stopColor="#0f9a95" />
        </radialGradient>
      </defs>

      <g className="chat-mascot-bob">
        {/* Antennae */}
        <line x1="17" y1="10" x2="13" y2="3" stroke="url(#mascot-dark)" strokeWidth="2" strokeLinecap="round" className="chat-mascot-antenna" style={{ animationDelay: "0ms" }} />
        <circle cx="13" cy="3" r="2.3" fill="url(#mascot-glow)" className="chat-mascot-glow" style={{ animationDelay: "0ms" }} />
        <line x1="47" y1="10" x2="51" y2="3" stroke="url(#mascot-dark)" strokeWidth="2" strokeLinecap="round" className="chat-mascot-antenna" style={{ animationDelay: "300ms" }} />
        <circle cx="51" cy="3" r="2.3" fill="url(#mascot-glow)" className="chat-mascot-glow" style={{ animationDelay: "300ms" }} />

        {/* Ears */}
        <rect x="2" y="19" width="7" height="13" rx="3.5" fill="url(#mascot-dark)" />
        <circle cx="5.5" cy="25.5" r="1.3" fill="url(#mascot-glow)" />
        <rect x="55" y="19" width="7" height="13" rx="3.5" fill="url(#mascot-dark)" />
        <circle cx="58.5" cy="25.5" r="1.3" fill="url(#mascot-glow)" />

        {/* Head */}
        <rect x="9" y="9" width="46" height="31" rx="16" fill="url(#mascot-shell)" stroke="#c5cdd8" strokeWidth="1" />
        <ellipse cx="20" cy="16" rx="10" ry="4.5" fill="#ffffff" opacity="0.55" transform="rotate(-18 20 16)" />

        {/* Face screen */}
        <rect x="15" y="15" width="34" height="19" rx="9.5" fill="url(#mascot-screen)" />
        <g className="chat-mascot-eyes">
          <path d="M20.5 23.5 Q24.5 18.5 28.5 23.5" stroke={GLOW} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M35.5 23.5 Q39.5 18.5 43.5 23.5" stroke={GLOW} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </g>
        {open ? (
          <path d="M22 27.5c2 3.4 4.8 5 10 5s8-1.6 10-5" stroke={GLOW} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M24 28c1.6 2.4 3.9 3.6 8 3.6s6.4-1.2 8-3.6" stroke={GLOW} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        )}

        {/* Neck + body */}
        <rect x="27" y="39" width="10" height="4" fill="url(#mascot-dark)" />
        <path
          d="M15 45 Q15 41 20 41 L44 41 Q49 41 49 45 L49 54 Q49 61 32 62 Q15 61 15 54 Z"
          fill="url(#mascot-shell)"
          stroke="#c5cdd8"
          strokeWidth="1"
        />
        <ellipse cx="23" cy="46" rx="7" ry="3" fill="#ffffff" opacity="0.45" transform="rotate(-14 23 46)" />
        <rect x="10" y="43" width="6" height="11" rx="3" fill="url(#mascot-dark)" />
        <rect x="48" y="43" width="6" height="11" rx="3" fill="url(#mascot-dark)" />
        <path d="M18 45 Q16 50 18 56" stroke={GLOW} strokeWidth="1.2" fill="none" opacity="0.8" />
        <path d="M46 45 Q48 50 46 56" stroke={GLOW} strokeWidth="1.2" fill="none" opacity="0.8" />
        <circle cx="32" cy="49.5" r="3" fill="url(#mascot-glow)" className="chat-mascot-glow" style={{ animationDelay: "600ms" }} />
      </g>
    </svg>
  );
}
