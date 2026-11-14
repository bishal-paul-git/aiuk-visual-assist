import { afterEach, describe, expect, it } from "vitest";
import { clearAlerts, log, recentAlerts, setLogSink } from "@/lib/server/log";

describe("customer-facing failure alerts", () => {
  afterEach(() => clearAlerts());

  it("counts errors and listed warnings, not ordinary warnings", () => {
    const restore = setLogSink(() => {});
    clearAlerts();
    log.error("store.save_failed");
    log.warn("tts.failed");
    log.warn("provider.call_failed");
    log.warn("command.rejected");
    log.info("session.started");
    restore();
    const a = recentAlerts();
    expect(a.total).toBe(3);
    expect(a.byName).toEqual({ "store.save_failed": 1, "tts.failed": 1, "provider.call_failed": 1 });
  });

  it("forgets failures older than the window", () => {
    const restore = setLogSink(() => {});
    clearAlerts();
    log.error("store.save_failed");
    restore();
    expect(recentAlerts(15 * 60 * 1000, Date.now() + 16 * 60 * 1000).total).toBe(0);
  });
});
