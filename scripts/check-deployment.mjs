#!/usr/bin/env node
// Checks a deployed server edition and reports, in plain English, what is
// switched on and what is still missing for real testing.
//
//   npm run check:deployment -- https://visual-assist.onrender.com
//
// Reads only public endpoints (/api/health, /api/capabilities, the customer
// and console pages). Sends no data and needs no credentials.

const base = (process.argv[2] ?? process.env.DEPLOYMENT_URL ?? "").replace(/\/+$/, "");
if (!base) {
  console.error("Usage: npm run check:deployment -- https://your-server.example");
  process.exit(2);
}

const results = [];
const add = (state, area, detail) => results.push({ state, area, detail });

async function get(path, { json = true } = {}) {
  const started = Date.now();
  const res = await fetch(base + path, { headers: { accept: json ? "application/json" : "text/html" }, signal: AbortSignal.timeout(20_000) });
  const ms = Date.now() - started;
  const body = json ? await res.json().catch(() => null) : await res.text();
  return { status: res.status, body, ms };
}

try {
  const url = new URL(base);
  if (url.protocol === "https:") add("ok", "HTTPS", "Served over HTTPS, so phone cameras and microphones are allowed.");
  else if (["localhost", "127.0.0.1"].includes(url.hostname)) add("warn", "HTTPS", "Plain HTTP on localhost: fine on this computer, but phones need an HTTPS address.");
  else add("fail", "HTTPS", "Not HTTPS. Phones will block the camera and microphone. Use the https:// address.");

  const liveProbe = await get("/api/health?probe=live").catch((e) => ({ status: 0, error: e }));
  if (liveProbe.status !== 200) {
    add("fail", "Server", `Not reachable (${liveProbe.error?.cause?.code ?? liveProbe.error?.message ?? `HTTP ${liveProbe.status}`}). Check the address and that the service is running.`);
    report();
    process.exit(1);
  }
  add("ok", "Server", `Up for ${liveProbe.body?.uptimeSec ?? "?"} s (responded in ${liveProbe.ms} ms).`);

  const health = await get("/api/health");
  const h = health.body ?? {};
  if (health.status === 200 && h.status === "ok") add("ok", "Health", "Ready.");
  else if (h.status === "degraded") add("warn", "Health", `Degraded: ${h.store?.lastError ?? "store write error"}.`);
  else add("fail", "Health", `Not ready (HTTP ${health.status}, status ${h.status ?? "unknown"}).`);

  if (h.store?.durable) add("ok", "Storage", `Sessions are saved to disk (${h.store.kind}); they survive a restart.`);
  else add("warn", "Storage", "Sessions are kept in memory only and are lost on restart. Set DATA_DIR to a persistent disk.");

  const caps = (await get("/api/capabilities")).body ?? {};
  if (caps.liveReasoning) add("ok", "AI (Claude)", `Real AI is on (${caps.model}). Start test sessions with "Live AI" to use it.`);
  else add("fail", "AI (Claude)", "Real AI is off; only scripted scenarios run. Set ANTHROPIC_API_KEY.");

  if (caps.speechToText) add("ok", "Speech recognition", `Server speech-to-text is on (${caps.sttProvider}); iPhone customers can speak.`);
  else add("warn", "Speech recognition", "Server speech-to-text is off; only browsers with built-in recognition (mainly Chrome) can speak. Set STT_PROVIDER and its key.");

  if (caps.textToSpeech) add("ok", "Voice", "ElevenLabs voice is on for every line.");
  else add("warn", "Voice", "ElevenLabs voice is off; only the recorded demo lines use it and other lines use the phone's own voice. Set ELEVENLABS_API_KEY.");

  if (caps.turnRelay) add("ok", "Live video", "A TURN relay is configured, so live video should connect on mobile data.");
  else add("warn", "Live video", "No TURN relay: live video may fail on 4G/5G and strict networks. Set ICE_SERVERS with a TURN server.");

  const sms = caps.delivery?.sms;
  if (sms && !sms.simulated) add("ok", "SMS links", `Customer links are sent by SMS (${sms.provider}).`);
  else add("warn", "SMS links", "SMS is simulated; links appear on Platform → Integrations instead of being texted. Set the TWILIO_* settings.");

  const connectors = Array.isArray(caps.connectors) ? caps.connectors : [];
  if (connectors.length) add("ok", "Business actions", `Connected to real systems: ${connectors.map((c) => `${c.tool} (${c.tenantId})`).join(", ")}.`);
  else add("warn", "Business actions", "All business actions are simulated. Set INTEGRATIONS_CONFIG (see docs/INTEGRATION-CONTRACT.md §11 for n8n).");

  const signIn = await get("/sign-in", { json: false }).catch(() => ({ status: 0 }));
  if (signIn.status === 200) add("ok", "Pages", "Sign-in page loads.");
  else add("fail", "Pages", `Sign-in page returned HTTP ${signIn.status}.`);

  const sessions = await get("/api/sessions").catch(() => ({ status: 0 }));
  if (sessions.status === 401) add("ok", "Access control", "The sessions API refuses requests that aren't signed in.");
  else add("fail", "Access control", `The sessions API answered HTTP ${sessions.status} without sign-in (expected 401).`);
} catch (e) {
  add("fail", "Check", `Stopped early: ${e.message}`);
}

report();
process.exit(results.some((r) => r.state === "fail") ? 1 : 0);

function report() {
  const icon = { ok: "OK  ", warn: "TODO", fail: "FAIL" };
  console.log(`\nVisual Assist deployment check: ${base}\n`);
  for (const r of results) console.log(`  [${icon[r.state]}] ${r.area.padEnd(20)} ${r.detail}`);
  const todo = results.filter((r) => r.state !== "ok").length;
  console.log(todo ? `\n${todo} item(s) to finish before full real testing.\n` : "\nEverything needed for real testing is switched on.\n");
}
