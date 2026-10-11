import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { tenantName } from "@/lib/config/catalog";
import { PageHeader } from "@/components/ui/primitives";
import { WorkflowEditor } from "@/components/platform/workflow-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = getWorkflowRegistry().get(id);
  return { title: wf ? `Edit ${wf.name} v${wf.version}` : "Edit workflow" };
}

export default async function EditWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  await platformRuntime();
  const { id } = await params;
  const reg = getWorkflowRegistry();
  const wf = reg.get(id);
  if (!wf) notFound();
  if (wf.status !== "draft" && wf.status !== "in_review") redirect(`/platform/workflows/${id}`);
  const base = wf.basedOnVersion ? reg.versions(wf.tenantId, wf.key).find((v) => v.version === wf.basedOnVersion) : undefined;
  return (
    <>
      <Link href={`/platform/workflows/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
        <ArrowLeft className="size-3" aria-hidden /> Back to workflow
      </Link>
      <PageHeader
        title={`${wf.name} v${wf.version}`}
        description={`${tenantName(wf.tenantId)} · ${wf.status === "draft" ? "Editing draft" : "In review"}`}
      />
      <WorkflowEditor workflow={structuredClone(wf)} base={base ? structuredClone(base) : undefined} />
    </>
  );
}
