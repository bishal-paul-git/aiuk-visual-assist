import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass, cx } from "@/components/ui/primitives";

/** Builds a URL for `pathname` keeping the given (non-empty) params. */
export function hrefWith(pathname: string, params: Record<string, string | undefined>, overrides: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...overrides })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Plain-link pagination (works without client JS). */
export function Pagination({
  pathname,
  params,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number) => hrefWith(pathname, params, { page: p > 1 ? String(p) : undefined });
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={link(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cx(buttonClass("secondary", "sm"), page <= 1 && disabled)}
        >
          <ChevronLeft className="size-3.5" aria-hidden /> Previous
        </Link>
        <span className="tabular">
          Page {page} of {pages}
        </span>
        <Link
          href={link(page + 1)}
          aria-disabled={page >= pages}
          tabIndex={page >= pages ? -1 : undefined}
          className={cx(buttonClass("secondary", "sm"), page >= pages && disabled)}
        >
          Next <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}

export function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export const fieldClass =
  "h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";
