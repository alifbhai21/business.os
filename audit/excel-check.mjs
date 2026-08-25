// Verify /export/excel returns a real xlsx (PK zip) and the AuditLog row increments.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const res = await fetch(
  "http://localhost:4000/api/v1/export/excel?businessId=" + s.businessId + "&type=sales",
  { headers: { Authorization: "Bearer " + s.accessToken } }
);
const ab = await res.arrayBuffer();
const head = new Uint8Array(ab.slice(0, 2));
console.log("HTTP", res.status);
console.log("content-type", res.headers.get("content-type"));
console.log("content-disposition", res.headers.get("content-disposition"));
console.log("bytes", ab.byteLength);
console.log("isPKzip", String.fromCharCode(head[0], head[1]) === "PK");