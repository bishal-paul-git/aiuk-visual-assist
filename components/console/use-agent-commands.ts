"use client";

import { useCallback, useState } from "react";
import type { Transport } from "@/lib/client/transport";
import { useAgentId } from "./agent-identity";

export function useAgentCommands(sessionId: string, transport: Transport | null) {
  const agentId = useAgentId();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const run = useCallback(
    async (command: Record<string, unknown>) => {
      setPending(String(command.type));
      setError(undefined);
      if (!transport) return false;
      const r = await transport.agentCommand(sessionId, agentId, command);
      setPending(null);
      if (!r.ok) setError(r.error);
      return r.ok;
    },
    [agentId, sessionId, transport],
  );

  return { run, pending, error, clearError: () => setError(undefined), agentId };
}
