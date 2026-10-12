import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  ClipboardCheck,
  Gauge,
  History,
  PlugZap,
  PoundSterling,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** What the user needs, on top of platform access, for this module to be useful. */
  permission: Permission;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operate",
    items: [
      { href: "/platform", label: "Dashboard", icon: Gauge, permission: "platform.access" },
      { href: "/platform/live", label: "Live Sessions", icon: Radio, permission: "session.view" },
      { href: "/platform/sessions", label: "Session History", icon: History, permission: "session.view" },
    ],
  },
  {
    group: "Configure",
    items: [
      { href: "/platform/clients", label: "Clients", icon: Building2, permission: "platform.access" },
      { href: "/platform/agents", label: "AI Agents", icon: Bot, permission: "workflow.view" },
      { href: "/platform/workflows", label: "Visual Workflows", icon: Workflow, permission: "workflow.view" },
      { href: "/platform/policies", label: "Policies", icon: ShieldCheck, permission: "policy.view" },
      { href: "/platform/teams", label: "Human Teams", icon: Users, permission: "settings.view" },
      { href: "/platform/integrations", label: "Integrations", icon: PlugZap, permission: "settings.view" },
    ],
  },
  {
    group: "Assure",
    items: [
      { href: "/platform/qa", label: "QA", icon: ClipboardCheck, permission: "session.view" },
      { href: "/platform/analytics", label: "Analytics", icon: BarChart3, permission: "session.view" },
      { href: "/platform/costs", label: "Costs", icon: PoundSterling, permission: "session.view" },
      { href: "/platform/audit", label: "Audit Logs", icon: ScrollText, permission: "audit.view" },
      { href: "/platform/health", label: "System Health", icon: Activity, permission: "platform.access" },
    ],
  },
  { group: "Admin", items: [{ href: "/platform/settings", label: "Settings", icon: Settings, permission: "settings.view" }] },
];

/** Navigation filtered to the modules a user can use. `allowed` undefined shows everything (static demo). */
export function visibleNav(allowed?: readonly string[]): { group: string; items: NavItem[] }[] {
  if (!allowed) return NAV;
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed.includes(i.href)) })).filter((g) => g.items.length > 0);
}
