"use client";
import { use, useState } from "react";
import { notFound } from "next/navigation";
import { PageHeader, Tabs } from "@/components/ui/primitives";
import { agentById } from "@/lib/data/agents";
import { clientById } from "@/lib/data/clients";
import { AgentAvatar, AgentStatusChip } from "@/components/agents/shared";
import { ClientTag } from "@/components/clients/shared";
import * as T from "@/components/agents/AgentTabs";

type Tab = "identity" | "greeting" | "voice" | "model" | "languages" | "knowledge" | "tools" | "workflows" | "escalation" | "versions" | "test";

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agent = agentById(id);
  const [tab, setTab] = useState<Tab>("identity");
  if (!agent) notFound();
  const client = clientById(agent.clientId);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "AI agents", href: "/agents" }, { label: agent.name }]}
        title={<span className="flex items-center gap-3"><AgentAvatar agent={agent} size={36} />{agent.name}<AgentStatusChip status={agent.status} /></span>}
        description={<span className="flex flex-wrap items-center gap-x-3">{agent.title}<span className="text-ink-mute">·</span><ClientTag id={client?.id ?? ""} /><span className="font-mono text-xs text-ink-mute">{agent.version}</span></span>}
      />
      <Tabs<Tab> className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "identity", label: "Identity" }, { id: "greeting", label: "Greeting" }, { id: "voice", label: "Voice" }, { id: "model", label: "Model" }, { id: "languages", label: "Languages", count: agent.languages.length },
        { id: "knowledge", label: "Knowledge", count: agent.knowledge.length }, { id: "tools", label: "Tools", count: agent.tools.length }, { id: "workflows", label: "Workflows", count: agent.workflowIds.length },
        { id: "escalation", label: "Escalation rules" }, { id: "versions", label: "Version history" }, { id: "test", label: "Test conversation" },
      ]} />
      <div hidden={tab !== "identity"}><T.IdentityTab agent={agent} /></div>
      <div hidden={tab !== "greeting"}><T.GreetingTab agent={agent} /></div>
      <div hidden={tab !== "voice"}><T.VoiceTab agent={agent} /></div>
      <div hidden={tab !== "model"}><T.ModelTab agent={agent} /></div>
      <div hidden={tab !== "languages"}><T.LanguagesTab agent={agent} /></div>
      <div hidden={tab !== "knowledge"}><T.KnowledgeTab agent={agent} /></div>
      <div hidden={tab !== "tools"}><T.ToolsTab agent={agent} /></div>
      <div hidden={tab !== "workflows"}><T.WorkflowsTab agent={agent} /></div>
      <div hidden={tab !== "escalation"}><T.EscalationTab agent={agent} /></div>
      <div hidden={tab !== "versions"}><T.VersionsTab agent={agent} /></div>
      <div hidden={tab !== "test"}><T.TestTab agent={agent} /></div>
    </>
  );
}
