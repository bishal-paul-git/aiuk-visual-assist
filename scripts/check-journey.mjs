#!/usr/bin/env node
// Runs one real conversation against a deployed server, end to end, and
// reports each step in plain English:
//   trial login → start a conversation (real AI when it is on) → customer with
//   no camera describes the problem → AI moves on correctly → customer asks a
//   question → AI answers and stays on the step → customer asks for a person →
//   an agent joins and greets them → the conversation ends with a note.
//
//   npm run check:journey -- https://visual-assist.onrender.com
//
// It creates one clearly labelled test conversation and ends it. No camera,
// no text messages.

const base = (process.argv[2] ?? process.env.DEPLOYMENT_URL ?? "").replace(/\/+$/, "");
if (!base) {
  console.error("Usage: npm run check:journey -- https://your-server.example");
  process.exit(2);
}
const email = process.env.TRIAL_LOGIN_EMAIL ?? "demo@xtelecom.example";
const password = process.env.TRIAL_LOGIN_PASSWORD ?? "VisualAssist-Trial";

const results = [];
const add = (state, area, detail) => results.push({ state, area, detail });
let cookie = "";

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), origin: base },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const m = setCookie.match(/va_session=[^;]+/);
    if (m) cookie = m[0];
  }
  return { status: res.status, body: await res.json().catch(() => null) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls the agent view until `test(state)` is true or the time is up. */
async function waitFor(id, test, ms = 45_000) {
  const until = Date.now() + ms;
  let state;
  while (Date.now() < until) {
    const r = await call("GET", `/api/sessions/${id}`);
    state = r.body?.state;
    if (state && test(state)) return { ok: true, state };
    await sleep(1500);
  }
  return { ok: false, state };
}

const lastAi = (s) => [...(s?.transcript ?? [])].reverse().find((t) => t.speaker === "ai")?.text ?? "";

let id;
let token;
try {
  const caps = (await call("GET", "/api/capabilities")).body ?? {};
  const live = Boolean(caps.liveReasoning);

  const login = await call("POST", "/api/auth/trial", { email, password });
  if (login.status !== 200 || !cookie) throw new Error(`Trial login failed (HTTP ${login.status})`);
  add("ok", "Login", "The trial login works.");

  const created = await call("POST", "/api/sessions", {
    workflowKey: "router-troubleshooting",
    tenantId: "tnt_northline",
    scenario: live ? "live" : "wan_down",
    channel: "secure_link",
    // Must match AUTOMATED_CHECK_LABEL (lib/domain/labels.ts): hidden from the client portal.
    customerLabel: "Automated production check",
  });
  if (created.status !== 200 && created.status !== 201) throw new Error(`Could not start a conversation (HTTP ${created.status}: ${created.body?.error ?? ""})`);
  ({ id, token } = created.body);
  add("ok", "Start", `Conversation started with ${live ? "the real AI" : "the guided example (real AI is off)"}.`);

  const customer = (command) => call("POST", `/api/assist/${token}/commands`, { command });
  await customer({ type: "media.update", media: { camera: false, microphone: false } });
  await customer({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
  await customer({ type: "customer.utterance", text: "Hi, my broadband has stopped working", confidence: 1 });

  const described = await waitFor(id, (s) => s.workflow?.currentStep === "describe_lights");
  if (described.ok) add("ok", "Understands the problem", "The AI understood the problem and, with no camera, asked the customer to describe the lights.");
  else add("fail", "Understands the problem", `The AI did not move on as expected (step: ${described.state?.workflow?.currentStep ?? "unknown"}; said: "${lastAi(described.state)}").`);

  if (described.ok) {
    await customer({ type: "customer.utterance", text: "the second light is orange", confidence: 1 });
    const cables = await waitFor(id, (s) => s.workflow?.currentStep === "guide_cables_by_touch");
    if (cables.ok) add("ok", "Reads a description", "\"The second light is orange\" was understood as no internet connection, and the AI moved to the cable check.");
    else add("fail", "Reads a description", `Not understood (step: ${cables.state?.workflow?.currentStep}; said: "${lastAi(cables.state)}").`);

    const before = cables.state?.transcript?.length ?? 0;
    const step = cables.state?.workflow?.currentStep;
    await customer({ type: "customer.utterance", text: "Will this lose my wifi password?", confidence: 1 });
    const answered = await waitFor(id, (s) => (s.transcript?.length ?? 0) > before + 1 && s.transcript.at(-1).speaker === "ai");
    const reply = lastAi(answered.state);
    if (answered.ok && answered.state.workflow.currentStep === step && /setting|password|keep|lose/i.test(reply)) add("ok", "Answers questions", `Answered from the approved answers and stayed on the step: "${reply}"`);
    else add("warn", "Answers questions", `Reply was: "${reply || "none"}" (step now ${answered.state?.workflow?.currentStep}).`);
  }

  await customer({ type: "customer.request_human" });
  const escalated = await waitFor(id, (s) => Boolean(s.escalation), 15_000);
  if (escalated.ok) add("ok", "Human help", "Pressing Human help put the customer in the queue for a person.");
  else add("fail", "Human help", "Human help did not reach the queue.");

  const joined = await call("POST", `/api/sessions/${id}/commands`, { agentId: "usr_demo", command: { type: "human.join" } });
  const greeted = await waitFor(id, (s) => s.session?.ownerType === "human" && s.transcript.some((t) => t.speaker === "human_agent"), 15_000);
  if (joined.status < 300 && greeted.ok) add("ok", "Agent joins", "The agent joined, took charge and greeted the customer.");
  else add("fail", "Agent joins", `Join answered HTTP ${joined.status}${joined.body?.error ? `: ${joined.body.error}` : ""}.`);
} catch (e) {
  add("fail", "Journey", `Stopped early: ${e.message}`);
} finally {
  if (id) {
    await call("POST", `/api/sessions/${id}/commands`, { agentId: "usr_demo", command: { type: "human.note", text: "Automated production check (scripts/check-journey.mjs). Not a real customer." } }).catch(() => undefined);
    const ended = await call("POST", `/api/sessions/${id}/commands`, { agentId: "usr_demo", command: { type: "session.end", outcome: "customer_abandoned", reason: "Automated production check" } }).catch(() => ({ status: 0 }));
    if (ended.status < 300) add("ok", "Tidy up", "The test conversation was ended and labelled as a check.");
  }
}

const icon = { ok: "OK  ", warn: "WARN", fail: "FAIL" };
console.log(`\nVisual Assist journey check: ${base}\n`);
for (const r of results) console.log(`  [${icon[r.state]}] ${r.area.padEnd(24)} ${r.detail}`);
const failed = results.filter((r) => r.state === "fail").length;
console.log(failed ? `\n${failed} step(s) failed.\n` : "\nThe whole journey works.\n");
process.exit(failed ? 1 : 0);
