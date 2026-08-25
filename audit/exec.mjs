// General executor: node audit/exec.mjs <method> <path> [bodyFile|none] [auth]
// auth: omit -> bearer from state.json; "none" -> no Authorization header.
import { readFileSync } from "node:fs";

const BASE = "http://localhost:4000";
const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const bodyFile = process.argv[4];
const authMode = process.argv[5] ?? "bearer";

const headers = { "Content-Type": "application/json", Accept: "application/json" };
if (authMode !== "none") headers.Authorization = `Bearer ${state.accessToken}`;

const body = bodyFile && bodyFile !== "none" ? readFileSync(bodyFile, "utf8") : undefined;
const opts = { method: process.argv[2], headers };
if (body) opts.body = body;

const t0 = Date.now();
let res;
try {
  res = await fetch(BASE + process.argv[3], opts);
} catch (e) {
  console.log("NETWORK ERROR " + e.message);
  process.exit(2);
}
const ms = Date.now() - t0;
const text = await res.text();
const SENSITIVE_KEYS = ["accessToken", "refreshToken", "token", "resetToken"];
let out = text;
try {
  const parsed = JSON.parse(text);
  const redact = (o) => {
    if (Array.isArray(o)) return o.map(redact);
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        if (SENSITIVE_KEYS.includes(k) && typeof o[k] === "string" && o[k].length > 12) o[k] = "[REDACTED]";
        else redact(o[k]);
      }
    }
    return o;
  };
  out = JSON.stringify(redact(parsed));
} catch {}
console.log("HTTP " + res.status + " " + ms + "ms");
console.log(out);