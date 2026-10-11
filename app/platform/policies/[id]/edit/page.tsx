import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformRuntime, STATIC_EXPORT } from "@/lib/server/platform-data";
import { getPolicyRegistry } from "@/lib/policy/registry";
import { policies, policyKey, tenantName } from "@/lib/config/catalog";
import { editorIdentity } from "@/lib/server/config-admin";
import { PageHeader } from "@/components/ui/primitives";
import { PolicyEditor } from "@/components/platform/policy-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPolicyRegistry().get(id);
  return { title: p ? `Edit ${p.name} v${p.version}` : "Edit policy" };
}

export async function generateStaticParams() {
  return policies.map((p) => ({ id: p.id }));
}

export default async function EditPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  await platformRuntime();
  const { id } = await params;
  const reg = getPolicyRegistry();
  const policy = reg.get(id);
  if (!policy) notFound();
  if (STATIC_EXPORT) {
    return (
      <PageHeader
        title={`${policy.name} v${policy.version}`}
        description="Policy editing and publishing need the server edition. This static demo shows configuration read-only."
      />
    );
  }
  if (policy.status !== "draft" && policy.status !== "in_review") redirect(`/platform/policies#${policyKey(policy)}`);
  const base = policy.basedOnVersion ? reg.versions(policyKey(policy)).find((v) => v.version === policy.basedOnVersion) : undefined;
  return (
    <>
      <Link href="/platform/policies" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
        <ArrowLeft className="size-3" aria-hidden /> All policies
      </Link>
      <PageHeader
        title={`${policy.name} v${policy.version}`}
        description={`${tenantName(policy.tenantId)} · ${policy.status === "draft" ? "Editing draft" : "In review"}`}
      />
      <PolicyEditor policy={structuredClone(policy)} base={base ? structuredClone(base) : undefined} admins={await editorIdentity(policy.tenantId, "policy.edit")} />
    </>
  );
}
