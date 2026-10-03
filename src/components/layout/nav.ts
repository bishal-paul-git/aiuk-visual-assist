import { Activity, BarChart3, Bot, Building2, ClipboardCheck, Coins, FileClock, GitBranch, HeartPulse, LayoutDashboard, Plug, Radio, ScrollText, Settings, ShieldCheck, Video, Headset, Smartphone } from "lucide-react";

export const navGroups = [
  { title: "Operate", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/live", label: "Live Sessions", icon: Radio, live: true },
    { href: "/sessions", label: "Sessions", icon: Video },
    { href: "/qa", label: "QA", icon: ClipboardCheck },
  ]},
  { title: "Configure", items: [
    { href: "/clients", label: "Clients", icon: Building2 },
    { href: "/agents", label: "AI Agents", icon: Bot },
    { href: "/workflows", label: "Visual Workflows", icon: GitBranch },
    { href: "/policies", label: "Policies", icon: ShieldCheck },
    { href: "/integrations", label: "Integrations", icon: Plug },
  ]},
  { title: "Insight", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/costs", label: "Costs", icon: Coins },
    { href: "/audit", label: "Audit Logs", icon: ScrollText },
    { href: "/health", label: "System Health", icon: HeartPulse },
  ]},
  { title: "Platform", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

export const demoSurfaces = [
  { href: "/assist/demo", label: "Customer Visual Assist", icon: Smartphone },
  { href: "/agent-console/demo", label: "Human Agent Console", icon: Headset },
];
export { Activity, FileClock };
