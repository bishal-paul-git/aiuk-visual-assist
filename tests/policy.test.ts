import { describe, expect, it } from "vitest";
import { getPolicy } from "@/lib/config/catalog";
import { canReturnToAi, checkTool, detectHumanRequest } from "@/lib/policy/engine";

const policy = getPolicy("pol_northline_standard")!;

describe("tool permissions", () => {
  it("allows low-risk tools for AI", () => {
    expect(checkTool(policy, "line_test", "ai").decision).toBe("allow");
  });
  it("keeps high-risk tools human-only", () => {
    expect(checkTool(policy, "book_engineer", "ai").decision).toBe("requires_human");
    expect(checkTool(policy, "book_engineer", "human").decision).toBe("allow");
  });
  it("denies prohibited and unknown tools for everyone", () => {
    expect(checkTool(policy, "factory_reset_remote", "human").decision).toBe("deny");
    expect(checkTool(policy, "delete_account", "ai").decision).toBe("deny");
  });
  it("treats regulated actions as human-only", () => {
    expect(checkTool(policy, "issue_account_credit", "ai").decision).toBe("requires_human");
  });
});

describe("return to AI", () => {
  const base = { id: "e", sessionId: "s", reasonDetail: "", severity: "medium" as const, requestedAt: "" };
  it("is blocked for mandatory-human escalations", () => {
    expect(canReturnToAi(policy, { ...base, reason: "customer_requested", mandatoryHuman: true }).allowed).toBe(false);
  });
  it("is allowed for non-mandatory escalations where policy permits", () => {
    expect(canReturnToAi(policy, { ...base, reason: "low_visual_confidence", mandatoryHuman: false }).allowed).toBe(true);
  });
  it("is blocked when the tenant policy forbids it", () => {
    const strict = getPolicy("pol_brightwater_safety")!;
    expect(canReturnToAi(strict, { ...base, reason: "low_visual_confidence", mandatoryHuman: false }).allowed).toBe(false);
  });
});

describe("human request detection", () => {
  it.each(["Can I speak to a person please", "I want a real human", "let me talk to someone", "agent please"])("detects “%s”", (t) => {
    expect(detectHumanRequest(t)).toBe(true);
  });
  it.each(["My internet isn't working", "the lights are off", "done"])("ignores “%s”", (t) => {
    expect(detectHumanRequest(t)).toBe(false);
  });
});
