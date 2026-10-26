"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { isPlatformRole } from "@/lib/auth/rbac";
import { useIdentity } from "@/lib/client/identity";

/**
 * Link from the console back to the user's own portal: the admin portal for
 * Absolute Intelligence staff, the client portal for everyone else.
 */
export function PortalLink() {
  const id = useIdentity();
  const platform = id.status === "signed_in" && isPlatformRole(id.user.role);
  return (
    <Link href={platform ? "/platform" : "/client"} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
      <LayoutGrid className="size-3.5" aria-hidden /> {platform ? "Platform" : "Client portal"}
    </Link>
  );
}
