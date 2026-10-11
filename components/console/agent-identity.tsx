"use client";

import { useIdentity } from "@/lib/client/identity";
import { IdentityMenu } from "@/components/auth/identity-menu";

/**
 * The console acts as the signed-in user (server edition) or the demo
 * identity (static demo). Returns "" until the identity is known.
 */
export function useAgentId(): string {
  const id = useIdentity();
  return id.status === "signed_in" ? id.user.id : "";
}

export function AgentPicker() {
  return <IdentityMenu variant="navy" />;
}
