"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade-in absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="anim-slide-in relative h-full w-64"><Sidebar onNavigate={() => setOpen(false)} /></div>
        </div>
      )}
      <div className="lg:pl-56">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5">{children}</main>
      </div>
    </div>
  );
}
