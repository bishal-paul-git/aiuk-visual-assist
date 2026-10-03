import { PageHeader } from "@/components/ui/primitives";
import { HealthDashboard } from "@/components/health/HealthDashboard";

export const metadata = { title: "System health" };

export default function HealthPage() {
  return (
    <>
      <PageHeader title="System health" description="Service status, latency and reliability across the real-time visual assistance pipeline. All figures are demo data." />
      <HealthDashboard />
    </>
  );
}
