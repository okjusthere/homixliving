/**
 * Tiled, faint identity watermark drawn over each training video — the logged-in
 * agent's email, repeated. Deters casual screen-recording and makes any leaked
 * recording traceable to a person. `pointer-events-none` keeps the player usable.
 * (It overlays the iframe, so it isn't present inside the player's own
 * fullscreen — a true burned-in watermark would be a later add.)
 */
export function Watermark({ label }: { label: string }) {
  const tiles = Array.from({ length: 18 });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex flex-wrap items-center justify-around overflow-hidden p-6"
      style={{ opacity: 0.16, rowGap: 40 }}
    >
      {tiles.map((_, i) => (
        <span
          key={i}
          className="select-none whitespace-nowrap font-mono text-[10px] uppercase"
          style={{ color: "#fff", letterSpacing: "0.12em", transform: "rotate(-22deg)" }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
