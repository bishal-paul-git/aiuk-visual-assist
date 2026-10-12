import type { Server } from "node:http";

export function verify(secret: string, signatureHeader: string | undefined, timestamp: string | undefined, rawBody: string, nowSec?: number): boolean;

export function createReferenceServer(opts: {
  secret: string | undefined;
  tenantId?: string;
  lineTestResult?: "fault_detected" | "no_fault";
  log?: (message: string) => void;
}): Server;
