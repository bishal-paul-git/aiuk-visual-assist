import { PageHeader } from "@/components/ui/primitives";
import { AuditLog } from "@/components/audit/AuditLog";

export const metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only, tamper-evident record of AI, human, policy and administrative actions. Every event carries the workflow, policy and model version in force."
      />
      <AuditLog />
    </>
  );
}
