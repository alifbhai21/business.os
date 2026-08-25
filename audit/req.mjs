// Minimal HTTP harness for the Business OS audit.
// Reads tokens/ids from audit/state.json, executes one request, prints result safely.
import { readFileSync } from "node:fs";

const BASE = "http://localhost:4000";
const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));

const method = process.argv[2] ?? "GET";
const path = process.argv[3];
const body = process.argv[4];
const authHeader = process.argv[5] === "none" ? null : process.argv[5] ?? `Bearer ${state.accessToken}`;

const headers = { "Content-Type": "application/json", Accept: "application/json" };
if (authHeader) headers.Authorization = authHeader;

const opts = { method, headers };
if (body) opts.body = body;

const t0 = Date.now();
const res = await fetch(BASE + path, opts);
const ms = Date.now() - t0;
const text = await res.text();

// Redact token-shaped values so secrets never print in tool output.
const SENSITIVE_KEYS = ["accessToken", "refreshToken", "token", "resetToken"];
let out = text;
try {
  const parsed = JSON.parse(text);
  const redact = (obj) => {
    if (Array.isArray(obj)) return obj.map(redact);
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        if (SENSITIVE_KEYS.includes(k) && typeof obj[k] === "string" && obj[k].length > 12) {
          obj[k] = "[REDACTED]";
        } else redact(obj[k]);
      }
    }
    return obj;
  };
  out = JSON.stringify(redact(parsed));
} catch { /* non-JSON body (csv/xlsx) — print as-is */ }

console.log("HTTP " + res.status + " " + ms + "ms");
console.log(out);