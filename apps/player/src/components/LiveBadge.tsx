/** Says a feed is live. A dot rather than a word alone, so it reads at a glance. */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-primary">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
      LIVE
    </span>
  );
}
