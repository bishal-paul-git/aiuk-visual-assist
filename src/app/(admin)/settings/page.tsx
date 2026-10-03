import { PageHeader } from "@/components/ui/primitives";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Organisation, access control, security, retention, data residency and feature rollout. Changes are local to this demo." />
      <SettingsPage />
    </>
  );
}
