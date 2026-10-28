import { describe, expect, it } from "vitest";
import {
  CONNECT_TIMEOUT_MS,
  DEFAULT_ICE_SERVERS,
  MAX_ATTEMPTS,
  WAIT_TIMEOUT_MS,
  callEligibility,
  callReducer,
  callStatusLabel,
  initialCall,
  parseIceServers,
  parseSignal,
  routeSignal,
  type CallState,
  type Signal,
} from "@/lib/media/live-call";
import { SessionRuntime } from "@/lib/server/runtime";
import { SignalRelay, relaySignal } from "@/lib/server/signal-relay";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { users } from "@/lib/config/catalog";
import type { Actor } from "@/lib/session/orchestrator";

const SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n";
const agentUser = users.find((u) => u.tenantId === "tnt_northline" && u.role === "agent")!;
const otherAgent = users.find((u) => u.tenantId === "tnt_northline" && u.role === "agent" && u.id !== agentUser.id);
const customer: Actor = { type: "customer", id: "c", name: "Test" };
const human: Actor = { type: "human_agent", id: agentUser.id, name: agentUser.name };

function runtime() {
  return new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
}

/** A live session with consent and the camera on; `join` adds the human agent. */
function session(opts: { join?: boolean; camera?: boolean } = {}) {
  const rt = runtime();
  const { id } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
  rt.dispatch(id, { type: "media.update", media: { camera: opts.camera ?? true, microphone: true } }, customer);
  rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
  if (opts.join) expect(rt.dispatch(id, { type: "human.join" }, human).error).toBeUndefined();
  return { rt, id };
}

const base = (from: "customer" | "agent", peer: string) => ({ v: 1 as const, sessionId: "ses_1", from, peer });
const AGENT_PEER = "agentPeer0001";
const CUSTOMER_PEER = "custPeer00001";

describe("live video eligibility", () => {
  it("needs consent and an active human agent; with the camera off it is a voice call", () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
    expect(callEligibility(rt.get(id)!.state)).toMatchObject({ eligible: false, reason: "no_consent" });

    const noHuman = session();
    expect(callEligibility(noHuman.rt.get(noHuman.id)!.state)).toMatchObject({ eligible: false, reason: "no_human" });
    expect(noHuman.rt.customerView(noHuman.id)!.liveVideo).toBe(false);

    const voiceOnly = session({ join: true, camera: false });
    expect(callEligibility(voiceOnly.rt.get(voiceOnly.id)!.state)).toMatchObject({ eligible: true, reason: "ok" });

    const { rt: rt2, id: id2 } = session({ join: true });
    expect(callEligibility(rt2.get(id2)!.state)).toEqual({ eligible: true, agentUserId: agentUser.id, reason: "ok" });
    expect(rt2.customerView(id2)!.liveVideo).toBe(true);
  });

  it("stops when the agent leaves or the session ends", () => {
    const { rt, id } = session({ join: true });
    rt.dispatch(id, { type: "human.leave" }, human);
    expect(callEligibility(rt.get(id)!.state).reason).toBe("no_human");

    const s2 = session({ join: true });
    s2.rt.dispatch(s2.id, { type: "session.end", reason: "test" }, human);
    expect(callEligibility(s2.rt.get(s2.id)!.state).reason).toBe("ended");
  });

  it("is with the earliest agent still present", () => {
    if (!otherAgent) return;
    const { rt, id } = session({ join: true });
    rt.dispatch(id, { type: "human.join" }, { type: "human_agent", id: otherAgent.id, name: otherAgent.name });
    expect(callEligibility(rt.get(id)!.state).agentUserId).toBe(agentUser.id);
  });
});

describe("ICE servers", () => {
  it("defaults to public STUN", () => {
    expect(parseIceServers(undefined)).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServers("")).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServers("not json")).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('{"urls":"stun:x"}')).toEqual(DEFAULT_ICE_SERVERS);
  });

  it("accepts STUN and TURN with credentials, drops invalid entries", () => {
    const servers = parseIceServers(
      JSON.stringify([
        { urls: "stun:stun.example.com:3478" },
        { urls: ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:443?transport=tcp"], username: "u", credential: "p" },
        { urls: "turn:no-credentials.example.com" },
        { urls: "https://not-ice.example.com" },
        42,
      ]),
    );
    expect(servers).toEqual([
      { urls: "stun:stun.example.com:3478" },
      { urls: ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:443?transport=tcp"], username: "u", credential: "p" },
    ]);
  });
});

describe("signal validation", () => {
  it("accepts well-formed messages and normalises them", () => {
    expect(parseSignal({ ...base("agent", AGENT_PEER), kind: "ready", extra: "dropped" })).toEqual({ ...base("agent", AGENT_PEER), kind: "ready" });
    expect(parseSignal({ ...base("customer", CUSTOMER_PEER), kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: SDP })).toMatchObject({ kind: "offer" });
    expect(parseSignal({ ...base("agent", AGENT_PEER), kind: "answer", callId: "call00000001", sdp: SDP })).toMatchObject({ kind: "answer" });
    expect(
      parseSignal({ ...base("customer", CUSTOMER_PEER), kind: "ice", callId: "call00000001", candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 } }),
    ).toMatchObject({ kind: "ice", candidate: { sdpMid: "0", sdpMLineIndex: 0, usernameFragment: null } });
    expect(parseSignal({ ...base("agent", AGENT_PEER), kind: "ice", callId: "call00000001", candidate: null })).toMatchObject({ candidate: null });
    expect(parseSignal({ ...base("agent", AGENT_PEER), kind: "bye" })).toEqual({ ...base("agent", AGENT_PEER), kind: "bye" });
  });

  it("rejects malformed, oversized or wrong-direction messages", () => {
    const bad: unknown[] = [
      null,
      "ready",
      [],
      { ...base("agent", AGENT_PEER), kind: "unknown" },
      { ...base("agent", AGENT_PEER), v: 2, kind: "ready" },
      { ...base("agent", "short"), kind: "ready" },
      { ...base("customer", CUSTOMER_PEER), kind: "ready" }, // only the agent announces
      { ...base("agent", AGENT_PEER), kind: "offer", callId: "call00000001", to: CUSTOMER_PEER, sdp: SDP }, // only the customer offers
      { ...base("customer", CUSTOMER_PEER), kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: "not sdp" },
      { ...base("customer", CUSTOMER_PEER), kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: "v=" + "x".repeat(40_000) },
      { ...base("agent", AGENT_PEER), kind: "answer", callId: "bad id!", sdp: SDP },
      { ...base("agent", AGENT_PEER), kind: "ice", callId: "call00000001", candidate: { candidate: 5 } },
      { ...base("agent", AGENT_PEER), kind: "ice", callId: "call00000001", candidate: { candidate: "c", sdpMLineIndex: -1 } },
      { ...base("agent", AGENT_PEER), sessionId: "../etc", kind: "ready" },
      { ...base("agent", AGENT_PEER), from: "supervisor", kind: "ready" },
    ];
    for (const b of bad) expect(parseSignal(b), JSON.stringify(b)?.slice(0, 120)).toBeNull();
  });

  it("takes the sender from the relay's stamp, not the body", () => {
    const s = parseSignal({ peer: AGENT_PEER, kind: "ready", from: "customer", sessionId: "ses_other" }, { sessionId: "ses_1", from: "agent" });
    expect(s).toEqual({ ...base("agent", AGENT_PEER), kind: "ready" });
  });
});

describe("call state machine", () => {
  const self = (peer: string) => ({ sessionId: "ses_1", peer });

  it("negotiates a call: ready → offer → answer → ICE → live", () => {
    let customer = callReducer(initialCall("customer"), { type: "eligibility", eligible: true, now: 0 });
    let agent = callReducer(initialCall("agent"), { type: "eligibility", eligible: true, now: 0 });
    expect([customer.phase, agent.phase]).toEqual(["waiting", "waiting"]);
    expect(callStatusLabel(agent)).toBe("Connecting");

    const ready: Signal = { ...base("agent", AGENT_PEER), kind: "ready" };
    expect(routeSignal(customer, ready, self(CUSTOMER_PEER))).toEqual({ type: "offer", to: AGENT_PEER });
    customer = callReducer(customer, { type: "started", callId: "call00000001", remotePeer: AGENT_PEER, now: 10 });
    expect(customer.phase).toBe("connecting");
    // A ready that crossed the offer in flight does not start a second call.
    expect(routeSignal(customer, ready, self(CUSTOMER_PEER))).toEqual({ type: "ignore" });

    const offer: Signal = { ...base("customer", CUSTOMER_PEER), kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: SDP };
    const action = routeSignal(agent, offer, self(AGENT_PEER));
    expect(action.type).toBe("answer");
    agent = callReducer(agent, { type: "started", callId: "call00000001", remotePeer: CUSTOMER_PEER, now: 20 });
    // An offer addressed to another console tab is not for this one.
    expect(routeSignal(initialCall("agent"), { ...offer, to: "otherPeer0001" }, self(AGENT_PEER)).type).toBe("ignore");

    const answer: Signal = { ...base("agent", AGENT_PEER), kind: "answer", callId: "call00000001", sdp: SDP };
    expect(routeSignal(customer, answer, self(CUSTOMER_PEER))).toEqual({ type: "apply_answer", sdp: SDP });
    expect(routeSignal(customer, { ...answer, callId: "call00000002" }, self(CUSTOMER_PEER)).type).toBe("ignore");

    const ice: Signal = { ...base("agent", AGENT_PEER), kind: "ice", callId: "call00000001", candidate: null };
    expect(routeSignal(customer, ice, self(CUSTOMER_PEER))).toEqual({ type: "add_ice", candidate: null });
    expect(routeSignal(customer, { ...ice, callId: "callStale0001" }, self(CUSTOMER_PEER)).type).toBe("ignore");

    customer = callReducer(customer, { type: "connected", now: 30 });
    agent = callReducer(agent, { type: "connected", now: 30 });
    expect([callStatusLabel(customer), callStatusLabel(agent)]).toEqual(["Live", "Live"]);
  });

  it("ignores its own messages and other sessions", () => {
    const agent = callReducer(initialCall("agent"), { type: "eligibility", eligible: true, now: 0 });
    expect(routeSignal(agent, { ...base("agent", AGENT_PEER), kind: "ready" }, self(AGENT_PEER)).type).toBe("ignore");
    const offer: Signal = { ...base("customer", CUSTOMER_PEER), sessionId: "ses_2", kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: SDP };
    expect(routeSignal(agent, offer, self(AGENT_PEER)).type).toBe("ignore");
  });

  it("ignores everything while idle", () => {
    const offer: Signal = { ...base("customer", CUSTOMER_PEER), kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: SDP };
    expect(routeSignal(initialCall("agent"), offer, self(AGENT_PEER)).type).toBe("ignore");
  });

  it("an agent accepts a fresh offer from a reloaded customer", () => {
    let agent = callReducer(initialCall("agent"), { type: "eligibility", eligible: true, now: 0 });
    agent = callReducer(agent, { type: "started", callId: "call00000001", remotePeer: CUSTOMER_PEER, now: 0 });
    agent = callReducer(agent, { type: "connected", now: 1 });
    const offer: Signal = { ...base("customer", "custPeer00002"), kind: "offer", callId: "call00000002", to: AGENT_PEER, sdp: SDP };
    expect(routeSignal(agent, offer, self(AGENT_PEER)).type).toBe("answer");
    expect(routeSignal(agent, { ...offer, callId: "call00000001" }, self(AGENT_PEER)).type).toBe("ignore");
  });

  it("goes back to waiting on a hang-up, without counting a failure", () => {
    let c = live("customer");
    const bye: Signal = { ...base("agent", AGENT_PEER), kind: "bye", callId: "call00000001", reason: "left" };
    expect(routeSignal(c, bye, self(CUSTOMER_PEER))).toEqual({ type: "close", failed: false });
    // A hang-up because the connection failed counts as a failure on this side too.
    expect(routeSignal(c, { ...bye, reason: "ice_failed" }, self(CUSTOMER_PEER))).toEqual({ type: "close", failed: true });
    expect(routeSignal(c, { ...bye, callId: "callOther0001" }, self(CUSTOMER_PEER)).type).toBe("ignore");
    c = callReducer(c, { type: "remote_bye", now: 50 });
    expect(c).toMatchObject({ phase: "waiting", attempts: 0 });
    expect(c.callId).toBeUndefined();
  });

  it("retries failures, then the agent falls back to snapshots", () => {
    let c = live("agent");
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      c = callReducer(c, { type: "failed", reason: "ice_failed", now: i });
      expect(c).toMatchObject({ phase: "waiting", attempts: i });
      c = callReducer(c, { type: "started", callId: `call0000000${i + 1}`, remotePeer: CUSTOMER_PEER, now: i });
    }
    c = callReducer(c, { type: "failed", reason: "ice_failed", now: 99 });
    expect(c.phase).toBe("fallback");
    expect(callStatusLabel(c)).toBe("Fallback: snapshots");
    // In fallback nothing restarts the call except a retry or an eligibility reset.
    const offer: Signal = { ...base("customer", CUSTOMER_PEER), kind: "offer", callId: "call00000009", to: AGENT_PEER, sdp: SDP };
    expect(routeSignal(c, offer, self(AGENT_PEER)).type).toBe("ignore");
    expect(callReducer(c, { type: "retry", now: 100 })).toMatchObject({ phase: "waiting", attempts: 0 });
    expect(callReducer(callReducer(c, { type: "eligibility", eligible: false, now: 100 }), { type: "eligibility", eligible: true, now: 101 })).toMatchObject({
      phase: "waiting",
      attempts: 0,
    });
  });

  it("a customer never gives up on its own: it keeps waiting for the agent to call again", () => {
    let c = live("customer");
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      c = callReducer(c, { type: "failed", reason: "ice_failed", now: i });
      expect(c.phase).toBe("waiting");
      expect(routeSignal(c, { ...base("agent", AGENT_PEER), kind: "ready" }, self(CUSTOMER_PEER)).type).toBe("offer");
      c = callReducer(c, { type: "started", callId: "call00000001", remotePeer: AGENT_PEER, now: i });
    }
  });

  it("times out a connection that never completes", () => {
    let c = callReducer(initialCall("customer"), { type: "eligibility", eligible: true, now: 0 });
    c = callReducer(c, { type: "started", callId: "call00000001", remotePeer: AGENT_PEER, now: 1000 });
    expect(callReducer(c, { type: "tick", now: 1000 + CONNECT_TIMEOUT_MS }).phase).toBe("connecting");
    expect(callReducer(c, { type: "tick", now: 1001 + CONNECT_TIMEOUT_MS })).toMatchObject({ phase: "waiting", attempts: 1, reason: "timeout" });
  });

  it("an agent with no offer eventually falls back", () => {
    let a = callReducer(initialCall("agent"), { type: "eligibility", eligible: true, now: 0 });
    let now = 0;
    for (let i = 0; i < MAX_ATTEMPTS; i++) a = callReducer(a, { type: "tick", now: (now += WAIT_TIMEOUT_MS + 1) });
    expect(a).toMatchObject({ phase: "fallback", reason: "no_offer" });
    // A waiting customer does not time out: the agent may join at any time.
    const c = callReducer(initialCall("customer"), { type: "eligibility", eligible: true, now: 0 });
    expect(callReducer(c, { type: "tick", now: 10 * WAIT_TIMEOUT_MS }).phase).toBe("waiting");
  });

  it("recovers from a brief disconnection", () => {
    let c = live("customer");
    c = callReducer(c, { type: "disconnected", now: 100 });
    expect(callStatusLabel(c)).toBe("Reconnecting");
    c = callReducer(c, { type: "connected", now: 200 });
    expect(c.phase).toBe("live");
  });

  it("falls back straight away when WebRTC is unsupported, and retry does not loop", () => {
    const c = callReducer(callReducer(initialCall("customer"), { type: "eligibility", eligible: true, now: 0 }), { type: "unsupported", now: 1 });
    expect(c).toMatchObject({ phase: "fallback", reason: "unsupported" });
    expect(callReducer(c, { type: "retry", now: 2 }).phase).toBe("fallback");
    const agent = callReducer(initialCall("agent"), { type: "eligibility", eligible: true, now: 0 });
    expect(routeSignal(agent, { ...base("customer", CUSTOMER_PEER), kind: "bye", reason: "unsupported" }, self(AGENT_PEER))).toEqual({ type: "unsupported" });
  });

  it("stops when no longer eligible", () => {
    const c = callReducer(live("agent"), { type: "eligibility", eligible: false, now: 5 });
    expect(c).toEqual(initialCall("agent", 5));
    expect(callStatusLabel(c)).toBeNull();
  });

  function live(role: "customer" | "agent"): CallState {
    let s = callReducer(initialCall(role), { type: "eligibility", eligible: true, now: 0 });
    s = callReducer(s, { type: "started", callId: "call00000001", remotePeer: role === "customer" ? AGENT_PEER : CUSTOMER_PEER, now: 0 });
    return callReducer(s, { type: "connected", now: 1 });
  }
});

describe("signalling relay", () => {
  it("relays between the two sides of an eligible session only", () => {
    const { rt, id } = session({ join: true });
    const relay = new SignalRelay();
    const toAgent: Signal[] = [];
    const toCustomer: Signal[] = [];
    relay.subscribe(id, "agent", (m) => toAgent.push(m));
    relay.subscribe(id, "customer", (m) => toCustomer.push(m));

    expect(relaySignal(rt, relay, { sessionId: id, from: "agent", agentUserId: agentUser.id, body: { peer: AGENT_PEER, kind: "ready" } })).toEqual({ ok: true });
    expect(toCustomer).toEqual([{ v: 1, sessionId: id, from: "agent", peer: AGENT_PEER, kind: "ready" }]);
    expect(toAgent).toHaveLength(0);

    const offer = { peer: CUSTOMER_PEER, kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: SDP };
    expect(relaySignal(rt, relay, { sessionId: id, from: "customer", body: offer })).toEqual({ ok: true });
    expect(toAgent[0]).toMatchObject({ kind: "offer", from: "customer", sessionId: id });
  });

  it("never touches the session audit, transcript or sequence", () => {
    const { rt, id } = session({ join: true });
    const before = rt.get(id)!.state;
    const relay = new SignalRelay();
    relaySignal(rt, relay, { sessionId: id, from: "customer", body: { peer: CUSTOMER_PEER, kind: "offer", callId: "call00000001", to: AGENT_PEER, sdp: SDP } });
    relaySignal(rt, relay, { sessionId: id, from: "agent", agentUserId: agentUser.id, body: { peer: AGENT_PEER, kind: "answer", callId: "call00000001", sdp: SDP } });
    const after = rt.get(id)!.state;
    expect(after).toBe(before);
    expect(JSON.stringify(after)).not.toContain("call00000001");
  });

  it("refuses signalling before the agent joins, from another agent, or when invalid", () => {
    const relay = new SignalRelay();
    const waiting = session();
    expect(relaySignal(waiting.rt, relay, { sessionId: waiting.id, from: "agent", agentUserId: agentUser.id, body: { peer: AGENT_PEER, kind: "ready" } })).toMatchObject({ ok: false, status: 409 });
    // A hang-up is always allowed through.
    expect(relaySignal(waiting.rt, relay, { sessionId: waiting.id, from: "customer", body: { peer: CUSTOMER_PEER, kind: "bye" } })).toEqual({ ok: true });

    const { rt, id } = session({ join: true });
    expect(relaySignal(rt, relay, { sessionId: id, from: "agent", agentUserId: "usr_someone_else", body: { peer: AGENT_PEER, kind: "ready" } })).toMatchObject({ ok: false, status: 403 });
    expect(relaySignal(rt, relay, { sessionId: id, from: "customer", body: { peer: CUSTOMER_PEER, kind: "ready" } })).toMatchObject({ ok: false, status: 400 });
    expect(relaySignal(rt, relay, { sessionId: "ses_missing", from: "customer", body: {} })).toMatchObject({ ok: false, status: 404 });
  });

  it("rate limits a flood from one side", () => {
    const { rt, id } = session({ join: true });
    const relay = new SignalRelay();
    const results = Array.from({ length: 250 }, () =>
      relaySignal(rt, relay, { sessionId: id, from: "customer", body: { peer: CUSTOMER_PEER, kind: "ice", callId: "call00000001", candidate: null } }).ok,
    );
    expect(results.filter((ok) => !ok).length).toBeGreaterThan(0);
  });

  it("unsubscribes cleanly", () => {
    const relay = new SignalRelay();
    const off = relay.subscribe("ses_1", "agent", () => {});
    expect(relay.listenerCount("ses_1", "agent")).toBe(1);
    off();
    expect(relay.listenerCount("ses_1", "agent")).toBe(0);
  });
});
