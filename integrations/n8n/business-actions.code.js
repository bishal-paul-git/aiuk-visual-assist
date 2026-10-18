const req = $input.first().json;
const body = req.body || {};
const headers = req.headers || {};
const TENANT = 'tnt_northline';
const KEEP_MS = 48 * 3600 * 1000;
const reply = (httpCode, response) => [{ json: { httpCode, response } }];
const SECRET_SHA256 = '__SECRET_SHA256__';
const sha256hex = (str) => {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = Array.from(unescape(encodeURIComponent(str)), (c) => c.charCodeAt(0));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const W = new Array(64);
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
};
const given = String(headers['x-va-secret'] || '');
const digest = sha256hex(given);
let diff = given ? 0 : 1;
for (let i = 0; i < 64; i++) diff |= digest.charCodeAt(i) ^ SECRET_SHA256.charCodeAt(i);
if (diff !== 0) return reply(401, { error: 'unauthorized' });

if (body.tenantId !== TENANT) return reply(403, { error: 'forbidden' });
const tool = String(body.tool || '');
const key = String(headers['idempotency-key'] || body.actionId || '');
if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(key)) return reply(400, { error: 'missing Idempotency-Key' });

const store = $getWorkflowStaticData('global');
store.actions = store.actions || {};
const now = Date.now();
for (const k of Object.keys(store.actions)) if (now - store.actions[k].at > KEEP_MS) delete store.actions[k];

const fingerprint = JSON.stringify([tool, body.params || {}, body.sessionId, body.tenantId]);
const seen = store.actions[key];
if (seen) return seen.fingerprint === fingerprint ? reply(200, seen.response) : reply(409, { error: 'idempotency key reused with a different body' });

const p = body.params || {};
const ref = (prefix) => prefix + '-' + key.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
const nextSlot = () => {
  const d = new Date(now + 24 * 3600 * 1000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  return day + ', 08:00-13:00';
};

let response;
switch (tool) {
  case 'line_test': {
    const fault = String(p.simulate || '') === 'fault';
    response = { status: 'succeeded', result: fault
      ? { status: 'fault_detected', detail: 'Loss of sync at street cabinet (n8n test system)', testId: ref('LT') }
      : { status: 'no_fault', detail: 'Line in sync, no fault found (n8n test system)', testId: ref('LT') }, externalRef: ref('LT') };
    break;
  }
  case 'update_case':
    response = { status: 'succeeded', result: { caseId: ref('CS'), status: String(p.status || 'updated') }, externalRef: ref('CS') };
    break;
  case 'create_ticket':
    response = { status: 'succeeded', result: { ticketId: ref('TK'), queue: String(p.queue || 'network_l2') }, externalRef: ref('TK') };
    break;
  case 'book_engineer':
    response = { status: 'succeeded', result: { jobId: ref('JOB'), slot: nextSlot() }, externalRef: ref('JOB') };
    break;
  case 'order_replacement_router':
    response = { status: 'succeeded', result: { orderId: ref('ORD'), dispatch: 'next working day' }, externalRef: ref('ORD') };
    break;
  case 'issue_account_credit':
    response = { status: 'succeeded', result: { creditId: ref('CR'), amount: String(p.amount ?? '0') }, externalRef: ref('CR') };
    break;
  default:
    response = { status: 'failed', result: { code: 'unsupported_tool' } };
}

store.actions[key] = { at: now, fingerprint, response, tool, sessionId: body.sessionId, requestedBy: body.requestedBy };
return reply(200, response);
