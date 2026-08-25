// RBAC matrix audit. Reuses authaudit user as one Employee whose role is cycled.
// Creates employee link + tests allow/deny. Prints status/code/message only (no secrets).
import { readFileSync, writeFileSync } from "node:fs";

const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const bid = state.businessId, sid = state.shopId, pid = state.productId,
  cid = state.customerId, acc = state.accountId;

const call = async (path, method, body, token) => {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("http://localhost:4000" + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let code = "";
  try { const j = await res.json(); code = j?.error?.code ?? ""; } catch {}
  return [res.status, code];
};

// 1) Fresh owner token
const lres = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "fullaudit20260825@example.com", password: "password123", deviceId: "owner-rbac-" + Date.now() }),
});
const ownerToken = (await lres.json()).data?.accessToken;
console.log("owner login HTTP", lres.status, "token:", ownerToken ? "yes" : "NO");

// 2) Create/link employee (authaudit phone) as Salesperson
const empRes = await fetch("http://localhost:4000/api/v1/employees", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerToken },
  body: JSON.stringify({ businessId: bid, name: "Auth Audit User", phone: "01733334444", role: "Salesperson" }),
});
const empData = await empRes.json();
console.log("employee create HTTP", empRes.status, "role:", empData.data?.role, "linked userId:", empData.data?.userId ? "yes" : "no", "status:", empData.data?.status);
const employeeId = empData.data?.id;

// 3) Login authaudit as the RBAC actor
const spLogin = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: state.authTest.email, password: "newpass987", deviceId: "rbac-actor-" + Date.now() }),
});
const spj = await spLogin.json();
const actorToken = spj.data?.accessToken;
console.log("actor login HTTP", spLogin.status, "user:", spj.data?.user?.email, "token:", actorToken ? "yes" : "NO");
writeFileSync("d:/business-os/audit/rbac-state.json", JSON.stringify({ actorToken, employeeId, bid, sid, pid, cid, acc, ownerToken }, null, 4));
console.log("rbac-state.json saved");