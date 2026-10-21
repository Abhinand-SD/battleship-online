/** Fixed ocean backdrop: deep gradient, faint grid, drifting radar rings. Purely decorative. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ocean-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,116,144,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(31,68,124,0.35),transparent_55%)]" />
      <div className="absolute inset-0 grid-lines opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="absolute -right-40 -top-40 h-[34rem] w-[34rem] animate-float rounded-full border border-accent/10" />
      <div className="absolute -right-24 -top-24 h-[22rem] w-[22rem] rounded-full border border-accent/10" />
      <div className="absolute -right-8 -top-8 h-[12rem] w-[12rem] rounded-full border border-accent/15" />
      <div
        className="absolute -right-40 -top-40 h-[34rem] w-[34rem] animate-radar-sweep rounded-full opacity-60"
        style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,0) 0deg, rgba(34,211,238,0.12) 50deg, rgba(34,211,238,0) 52deg)' }}
      />
      <div className="absolute -bottom-32 -left-32 h-[26rem] w-[26rem] rounded-full bg-accent/5 blur-3xl" />
    </div>
  );
}
