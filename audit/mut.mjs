// CRUD mutation batch runner. node mut.mjs <cases.json> <results.json>
// cases.json: [{label, method, path, body, expect}]
// `{{ts}}` placeholders inside body strings are replaced with Date.now().
// Uses a FRESH owner login. Saves full responses to results.json.
import { readFileSync, writeFileSync } from "node:fs";
const state0 = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const rawCases = readFileSync(process.argv[2], "utf8");
const cases = JSON.parse(rawCases.replaceAll("{{ts}}", String(Date.now())));
const resultsPath = process.argv[3];

// fresh owner token
const lr = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "fullaudit20260825@example.com", password: "password123", deviceId: "owner-" + Date.now() }),
});
const lj = await lr.json();
const token = lj.data?.accessToken;
if (!token) { console.log("OWNER LOGIN FAILED"); process.exit(1); }

const results = {};
for (const c of cases) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (c.auth !== "none") headers.Authorization = "Bearer " + token;
  let status = 0, bodyText = "";
  try {
    const res = await fetch("http://localhost:4000" + c.path, {
      method: c.method, headers, body: c.body ? JSON.stringify(c.body) : undefined,
    });
    status = res.status;
    bodyText = await res.text();
  } catch (e) {
    bodyText = "NETERR: " + e.message;
  }
  const parsed = (() => { try { return JSON.parse(bodyText); } catch { return { text: bodyText.slice(0, 200) }; } })();
  results[c.label] = { status, body: parsed, path: c.path, method: c.method };
  const pass = status === c.expect;
  console.log((pass ? "PASS" : "FAIL") + " [" + c.label + "] " + c.method + " " + c.path + " -> " + status + (parsed?.error?.code ? "/" + parsed.error.code : "") + " (exp " + c.expect + ")");
}
writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log("results saved ->", resultsPath);