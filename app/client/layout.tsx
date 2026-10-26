import type { ReactNode } from "react";

export const metadata = { title: { default: "Client portal", template: "%s · Client portal" } };

/** The client portal: each page authorises its own data and wraps itself in PortalShell. */
export default function ClientLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
