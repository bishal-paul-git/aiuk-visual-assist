#!/usr/bin/env node
// Downloads freely licensed photos of real routers (and a few devices that are
// not routers) from Wikimedia Commons for the photo evaluation, with an
// attribution file. Run where commons.wikimedia.org is reachable (CI).
//
//   node scripts/collect-commons-photos.mjs eval/router-photos/commons

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = process.argv[2] ?? "eval/router-photos/commons";
const PER_TERM = Number(process.env.PER_TERM ?? 8);
const TERMS = [
  "broadband router front lights",
  "wireless router LED",
  "BT Home Hub",
  "BT Smart Hub",
  "Virgin Media Super Hub",
  "Sky router",
  "TalkTalk router",
  "Fritz!Box",
  "Netgear router",
  "TP-Link router",
  "Linksys router",
  "ADSL modem router",
  "DSL modem lights",
  "cable modem",
  "router back ports",
  "router rear panel ethernet",
  "set-top box",
  "wifi range extender",
];
const UA = "VisualAssistPhotoEval/1.0 (evaluation of a support assistant; contact via GitHub bishal-paul-git/aiuk-visual-assist)";

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** GET with polite retries: Commons answers 429 when asked too fast. */
async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.status !== 429 && r.status < 500) return r;
    await sleep(Number(r.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
  }
  throw new Error(`Gave up on ${url}`);
}

async function api(params) {
  const r = await get(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ format: "json", origin: "*", ...params })}`);
  if (!r.ok) throw new Error(`Commons API ${r.status}`);
  return r.json();
}

await mkdir(out, { recursive: true });
const seen = new Set();
const rows = [["file", "search", "title", "author", "licence", "source"]];
let n = 0;
for (const term of TERMS) {
  let res;
  try {
    res = await api({
    action: "query",
    generator: "search",
    gsrsearch: `${term} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(PER_TERM * 2),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata|size",
    iiurlwidth: "1280",
    });
  } catch (e) {
    console.log(`${term}: skipped (${e.message})`);
    continue;
  }
  const pages = Object.values(res.query?.pages ?? {});
  let taken = 0;
  for (const p of pages) {
    if (taken >= PER_TERM) break;
    const info = p.imageinfo?.[0];
    if (!info || seen.has(p.title) || !/image\/(jpeg|png)/.test(info.mime) || (info.width ?? 0) < 400) continue;
    const meta = info.extmetadata ?? {};
    const licence = meta.LicenseShortName?.value ?? "";
    if (!/CC|Public domain|PD|GFDL/i.test(licence)) continue;
    const r = await get(info.thumburl ?? info.url).catch(() => null);
    if (!r?.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    n += 1;
    const file = `c${String(n).padStart(3, "0")}.${info.mime === "image/png" ? "png" : "jpg"}`;
    await writeFile(path.join(out, file), buf);
    seen.add(p.title);
    taken += 1;
    const author = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
    rows.push([file, term, p.title, author, licence, info.descriptionurl ?? ""]);
    await sleep(1200);
  }
  console.log(`${term}: ${taken}`);
}
const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
await writeFile(path.join(out, "ATTRIBUTION.csv"), csv + "\n");
console.log(`Downloaded ${n} photos to ${out}`);
