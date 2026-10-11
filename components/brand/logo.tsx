import { cx } from "@/components/ui/primitives";

/** Absolute Intelligence mark: an "A" monogram. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#1D5BD8" />
      <path d="M16 6.5 7.5 25h4.2l1.6-3.8h5.4l1.6 3.8h4.2L16 6.5Zm-1.3 11.3L16 14.6l1.3 3.2h-2.6Z" fill="#fff" />
    </svg>
  );
}

export function Logo({ inverted, product = true }: { inverted?: boolean; product?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="size-7" />
      <span className="leading-tight">
        <span className={cx("block text-[13px] font-semibold tracking-tight", inverted ? "text-white" : "text-ink")}>Absolute Intelligence</span>
        {product && <span className={cx("block text-[11px]", inverted ? "text-white/60" : "text-muted")}>Visual Assist</span>}
      </span>
    </span>
  );
}
