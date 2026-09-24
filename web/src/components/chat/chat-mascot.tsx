/** A tiny animated bot face for the chat FAB — hand-drawn SVG rather than a
 * stock icon, since a static message-bubble glyph reads as "button," not
 * "assistant." Blinking eyes and a wiggling antenna run continuously via
 * CSS (see globals.css); the mouth and antenna glow change shape when the
 * panel opens, so it visibly reacts to being clicked instead of just
 * swapping to a generic X. */
export function ChatMascot({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
      {/* Antenna */}
      <line x1="12" y1="3.2" x2="12" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="chat-mascot-antenna" />
      <circle cx="12" cy="2.6" r="1.15" fill="currentColor" className="chat-mascot-antenna-tip" />

      {/* Eyes — a wrapping group scaled on the Y axis to blink */}
      <g className="chat-mascot-eyes">
        <circle cx="8.4" cy="12" r="1.7" fill="currentColor" />
        <circle cx="15.6" cy="12" r="1.7" fill="currentColor" />
      </g>

      {/* Mouth: a bigger, happier curve once the panel is open */}
      {open ? (
        <path d="M8 15.2c1.2 2 2.6 3 4 3s2.8-1 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M8.6 15.6c1 1.1 2.1 1.6 3.4 1.6s2.4-.5 3.4-1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}
