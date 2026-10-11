"use client";

import { useCallback, useState } from "react";
import { postJson } from "@/lib/client/use-event-stream";
import { useAgentId } from "./agent-identity";

export function useAgentCommands(sessionId: string) {
  const agentId = useAgentId();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const run = useCallback(
    async (command: Record<string, unknown>) => {
      setPending(String(command.type));
      setError(undefined);
      const r = await postJson(`/api/sessions/${sessionId}/commands`, { agentId, command });
      setPending(null);
      if (!r.ok) setError(r.error);
      return r.ok;
    },
    [agentId, sessionId],
  );

  return { run, pending, error, clearError: () => setError(undefined), agentId };
}
