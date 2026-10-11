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

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operate",
    items: [
      { href: "/platform", label: "Dashboard", icon: Gauge },
      { href: "/platform/live", label: "Live Sessions", icon: Radio },
      { href: "/platform/sessions", label: "Session History", icon: History },
    ],
  },
  {
    group: "Configure",
    items: [
      { href: "/platform/clients", label: "Clients", icon: Building2 },
      { href: "/platform/agents", label: "AI Agents", icon: Bot },
      { href: "/platform/workflows", label: "Visual Workflows", icon: Workflow },
      { href: "/platform/policies", label: "Policies", icon: ShieldCheck },
      { href: "/platform/teams", label: "Human Teams", icon: Users },
      { href: "/platform/integrations", label: "Integrations", icon: PlugZap },
    ],
  },
  {
    group: "Assure",
    items: [
      { href: "/platform/qa", label: "QA", icon: ClipboardCheck },
      { href: "/platform/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/platform/costs", label: "Costs", icon: PoundSterling },
      { href: "/platform/audit", label: "Audit Logs", icon: ScrollText },
      { href: "/platform/health", label: "System Health", icon: Activity },
    ],
  },
  { group: "Admin", items: [{ href: "/platform/settings", label: "Settings", icon: Settings }] },
];
