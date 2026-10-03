"use client";
import { useState } from "react";
import { Building2, Bell, Flag, Globe2, KeyRound, ShieldCheck, Timer, Users } from "lucide-react";
import { Tabs } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { OrganisationSection, UsersSection } from "./OrgUsersSections";
import { RolesSection, SecuritySection } from "./RolesSecuritySections";
import { FlagsSection, NotificationsSection, RegionsSection, RetentionSection } from "./OtherSections";

const sections = [
  { id: "organisation", label: "Organisation", icon: Building2, el: OrganisationSection },
  { id: "users", label: "Users", icon: Users, el: UsersSection },
  { id: "roles", label: "Roles", icon: KeyRound, el: RolesSection },
  { id: "security", label: "Security", icon: ShieldCheck, el: SecuritySection },
  { id: "retention", label: "Retention", icon: Timer, el: RetentionSection },
  { id: "regions", label: "Regions", icon: Globe2, el: RegionsSection },
  { id: "notifications", label: "Notifications", icon: Bell, el: NotificationsSection },
  { id: "flags", label: "Feature flags", icon: Flag, el: FlagsSection },
] as const;
type Id = (typeof sections)[number]["id"];

export function SettingsPage() {
  const [active, setActive] = useState<Id>("organisation");
  const Section = sections.find((s) => s.id === active)!.el;
  return (
    <div className="lg:flex lg:gap-6">
      <nav aria-label="Settings sections" className="hidden w-48 shrink-0 lg:block">
        <ul className="sticky top-4 space-y-0.5">
          {sections.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button onClick={() => setActive(id)} aria-current={active === id ? "page" : undefined}
                className={cn("flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[13px] font-medium", active === id ? "bg-brand-soft text-brand-strong" : "text-ink-soft hover:bg-subtle")}>
                <Icon size={14} />{label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mb-4 lg:hidden"><Tabs tabs={sections.map((s) => ({ id: s.id, label: s.label }))} value={active} onChange={setActive} /></div>
      <div className="min-w-0 flex-1"><Section /></div>
    </div>
  );
}
