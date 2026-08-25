// Batch read/probe runner. node audit/probe.mjs <file.json>
// file.json = list of [label, method, path, expect, tokenKey]
// tokenKey "owner" => fresh login each run; "none" => no auth header; else state.accessToken.
import { readFileSync } from "node:fs";
const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));

// Fresh owner token every run so stale JWTs never taint results.
const lr = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "fullaudit20260825@example.com", password: "password123", deviceId: "probe-" + Date.now() }),
});
const fresh = (await lr.json()).data?.accessToken;

const results = [];
for (const [label, method, path, expect, tk] of cases) {
  const token = tk === "owner" ? fresh : tk === "none" ? null : state.accessToken;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  let status = 0, code = "";
  try {
    const res = await fetch("http://localhost:4000" + path, { method, headers });
    status = res.status;
    try { const j = await res.json(); code = j?.error?.code ?? ""; } catch {}
  } catch (e) { code = "NETERR"; }
  const pass = status === expect;
  results.push((pass ? "PASS" : "FAIL") + " [" + label + "] " + method + " " + path + " -> " + status + (code ? "/" + code : "") + " (exp " + expect + ")");
}
console.log(results.join("\n"));