"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Building2, Check, ChevronDown, Menu, Search } from "lucide-react";
import { clients } from "@/lib/data/clients";
import { actions, useAppState } from "@/lib/store";
import { DEMO_NOW } from "@/lib/data/sessions";
import { navGroups } from "./nav";
import { Chip } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";

function ClientSwitcher() {
  const value = useAppState((s) => s.clientFilter);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = clients.find((c) => c.id === value);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} className="flex h-8 items-center gap-2 rounded border border-line bg-surface px-2.5 text-[13px] hover:bg-subtle">
        <Building2 size={14} className="text-ink-mute" />
        <span className="max-w-[150px] truncate font-medium">{current?.name ?? "All clients"}</span>
        <ChevronDown size={13} className="text-ink-mute" />
      </button>
      {open && (
        <ul role="listbox" className="anim-fade-in absolute left-0 top-9 z-40 w-64 rounded-lg border border-line bg-surface py-1 shadow-pop">
          <li className="px-3 py-1 label">Client context</li>
          {[{ id: "all", name: "All clients", sub: "Platform-wide view" }, ...clients.map((c) => ({ id: c.id, name: c.name, sub: c.industry }))].map((c) => (
            <li key={c.id}>
              <button role="option" aria-selected={value === c.id} onClick={() => { actions.setClientFilter(c.id as never); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-subtle">
                <span className="flex-1"><span className="block text-[13px] font-medium">{c.name}</span><span className="block text-2xs text-ink-mute">{c.sub}</span></span>
                {value === c.id && <Check size={14} className="text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const user = useAppState((s) => s.user);
  const [q, setQ] = useState("");
  const [bell, setBell] = useState(false);
  const section = navGroups.flatMap((g) => g.items).find((i) => path === i.href || path.startsWith(i.href + "/"));

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const m = q.trim().toUpperCase();
    if (/^VA-\d+$/.test(m)) router.push(`/sessions/${m}`);
    else if (m) router.push(`/sessions?q=${encodeURIComponent(q.trim())}`);
    setQ("");
  };
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-surface px-3 lg:px-5">
      <button onClick={onMenu} aria-label="Open navigation" className="rounded p-1.5 text-ink-soft hover:bg-subtle lg:hidden"><Menu size={18} /></button>
      <div className="hidden min-w-0 items-center gap-2 text-[13px] sm:flex">
        <span className="text-ink-mute">Visual Assist</span><span className="text-ink-mute">/</span>
        <span className="truncate font-medium">{section?.label ?? "Console"}</span>
      </div>
      <ClientSwitcher />
      <form onSubmit={onSearch} className="relative ml-auto hidden max-w-xs flex-1 md:block">
        <Search size={14} className="absolute left-2.5 top-2.5 text-ink-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search session ID or customer…" aria-label="Search sessions" className="h-8 w-full rounded border border-line bg-subtle/60 pl-8 pr-2 text-[13px] placeholder:text-ink-mute focus:bg-surface" />
      </form>
      <Chip tone="warn" className="hidden xl:inline-flex">Demo data</Chip>
      <span className="num hidden text-2xs text-ink-mute xl:block">{DEMO_NOW}</span>
      <div className="relative ml-auto md:ml-0">
        <button onClick={() => setBell(!bell)} aria-label="Notifications" className="relative rounded p-1.5 text-ink-soft hover:bg-subtle"><Bell size={16} /><span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-bad" /></button>
        {bell && (
          <div className="anim-fade-in absolute right-0 top-9 z-40 w-72 rounded-lg border border-line bg-surface p-2 shadow-pop">
            <p className="label px-2 py-1">Notifications</p>
            {[["VA-27428 is escalating — customer requested a human", "/sessions/VA-27428"], ["INC-0412 · Visual AI latency under observation", "/health"], ["3 sessions awaiting QA review", "/qa"]].map(([t, h]) => (
              <Link key={t} href={h} onClick={() => setBell(false)} className="block rounded px-2 py-1.5 text-xs hover:bg-subtle">{t}</Link>
            ))}
          </div>
        )}
      </div>
      <Link href="/settings" className="flex items-center gap-2 rounded px-1 py-1 hover:bg-subtle" title={user?.email}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">AH</span>
        <span className="hidden text-left leading-tight lg:block"><span className="block text-xs font-medium">{user?.name}</span><span className="block text-2xs text-ink-mute">{user?.role}</span></span>
      </Link>
    </header>
  );
}
export { cn };
