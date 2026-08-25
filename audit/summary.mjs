// node audit/summary.mjs <method> <path> [auth=none|bearer]
// Fires request and prints a compact structural summary (array lengths, top-level keys).
import { readFileSync } from "node:fs";
const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const headers = { "Content-Type": "application/json", Accept: "application/json" };
if (process.argv[4] !== "none") headers.Authorization = `Bearer ${state.accessToken}`;
const t0 = Date.now();
const res = await fetch("http://localhost:4000" + process.argv[3], { method: process.argv[2], headers });
const ms = Date.now() - t0;
const text = await res.text();
console.log("HTTP " + res.status + " " + ms + "ms");
if (!text) { console.log("(empty body)"); process.exit(0); }
let parsed;
try { parsed = JSON.parse(text); } catch { console.log("NON-JSON (" + text.length + " bytes) first 200: " + text.slice(0, 200)); process.exit(0); }
const summarize = (o, depth = 0) => {
  if (Array.isArray(o)) return "[" + o.length + "]";
  if (o && typeof o === "object") {
    const keys = Object.keys(o);
    if (depth > 1) return "{" + keys.length + "}";
    const parts = keys.map((k) => k + ":" + summarize(o[k], depth + 1));
    return "{" + parts.join(", ") + "}";
  }
  return typeof o === "string" && o.length > 40 ? "str[" + o.length + "]" : JSON.stringify(o);
};
console.log(JSON.stringify(parsed, null, 1).slice(0, 60));
console.log(summarize(parsed));