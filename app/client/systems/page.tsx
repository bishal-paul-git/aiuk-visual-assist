import Link from "next/link";
import { Database, FlaskConical, Plug } from "lucide-react";
import { clientScope } from "@/lib/server/client-data";
import { staticSafeSearchParams } from "@/lib/server/platform-data";
import { getConnectorRegistry } from "@/lib/integrations/config";
import { lookupSecret } from "@/lib/integrations/secret-vault";
import { connectorStatuses } from "@/lib/integrations/status";
import { humanize } from "@/lib/domain/labels";
import { PageHeader, Panel, Table, Td, Th, buttonClass } from "@/components/ui/primitives";
import { ConnectorModeBadge, LastCall } from "@/components/platform/connector-status";
import { PortalShell } from "@/components/client/portal-shell";

export const metadata = { title: "Connected systems" };

export default async function ClientSystems({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await staticSafeSearchParams(searchParams);
  const scope = await clientScope("/client/systems", org);
  const showHosts = scope.allows("settings.view");
  const rows = connectorStatuses(scope.tenant.id, getConnectorRegistry(), scope.states(), lookupSecret);

  return (
    <PortalShell scope={scope} active="systems">
      <PageHeader
        title="Connected systems"
        description="When the AI or an agent needs to do something, such as run a line test or book an engineer, it asks one of these actions. Each runs in one of three ways."
        actions={
          scope.allows("settings.edit") ? (
            <Link href="/platform/integrations" className={buttonClass("secondary", "sm")}>
              <Plug className="size-3.5" aria-hidden /> Change how actions run
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Way icon={<Database className="size-4" aria-hidden />} title="Built-in: recorded by Visual Assist">
          Visual Assist keeps the record itself and gives it a reference. Good for trying the full journey before your own systems are connected.
        </Way>
        <Way icon={<Plug className="size-4" aria-hidden />} title="Client API: sent to your system">
          The action goes securely to your own system, such as a ticketing tool, and your system answers with its own reference.
        </Way>
        <Way icon={<FlaskConical className="size-4" aria-hidden />} title="Simulated: a pretend answer">
          So the rest of the journey can be tried. Nothing is recorded anywhere.
        </Way>
      </div>

      <Panel title={`${scope.tenant.name} actions`} className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Action</Th>
              <Th>How it runs</Th>
              <Th>Last result</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.tool}>
                <Td>
                  <div className="font-medium text-ink">{humanize(c.tool)}</div>
                </Td>
                <Td>
                  <ConnectorModeBadge mode={c.mode} />
                  {showHosts && c.endpointHost && <div className="mt-0.5 font-mono text-[11px] text-muted">{c.endpointHost}</div>}
                  {c.mode === "invalid" && <div className="mt-0.5 text-[11px] text-danger">Not set up correctly. Ask your administrator.</div>}
                </Td>
                <Td className="text-xs">
                  <LastCall c={c} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </PortalShell>
  );
}

function Way({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {icon} {title}
      </h3>
      <p className="mt-1 text-xs text-ink-2">{children}</p>
    </div>
  );
}
