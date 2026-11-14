import { describe, expect, it } from "vitest";
import { routerHarness } from "./helpers";
import { costPerSession, ratingStats, reportCsv, reportStates } from "@/lib/analytics/pilot-report";
import { AUTOMATED_CHECK_LABEL } from "@/lib/domain/labels";

function finished(score?: "up" | "down", comment?: string) {
  const h = routerHarness("power_cycle_fix");
  h.runCustomer();
  h.send({ type: "session.end" });
  if (score) h.send({ type: "customer.rating", score, comment });
  return h;
}

describe("customer rating", () => {
  it("is accepted once, after the session has ended", () => {
    const h = finished("down", "Took too long");
    expect(h.state.rating).toMatchObject({ score: "down", comment: "Took too long" });
    expect(h.state.audit.some((a) => a.eventType === "customer.rating")).toBe(true);
    h.send({ type: "customer.rating", score: "up" });
    expect(h.state.rating?.score).toBe("down");
  });
});

describe("pilot report", () => {
  it("leaves out guided examples and the automated check, and counts ratings", () => {
    const a = finished("up").state;
    const b = finished("down", "Didn't fix it").state;
    const real = [a, b].map((s) => ({ ...s, session: { ...s.session, scenario: undefined } }));
    const check = { ...real[0], session: { ...real[0].session, customerLabel: AUTOMATED_CHECK_LABEL } };
    const kept = reportStates([...real, check, a]);
    expect(kept).toHaveLength(2);
    const r = ratingStats(kept);
    expect(r).toMatchObject({ rated: 2, up: 1, down: 1, positiveRate: 0.5 });
    expect(r.comments[0].comment).toBe("Didn't fix it");
    expect(costPerSession(kept)).toBeGreaterThanOrEqual(0);
    const csv = reportCsv(kept);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Customer rating");
    expect(csv).toContain("Not helpful");
    expect(csv).toContain("Resolved by AI");
  });
});
