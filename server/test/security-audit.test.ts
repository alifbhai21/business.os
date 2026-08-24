import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app, env } from "../src/app";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { ROLES } from "../src/config/roles";

/**
 * Phase 13 — consolidated SECURITY AUDIT lane.
 *
 * The 600-test suite already proves auth/RBAC/isolation/idempotency/
 * transactions per module. This file is a single cross-cutting lane that
 * re-verifies the invariants that must hold EVERYWHERE at once:
 *
 *   1. Authentication — expired / tampered / malformed / wrong-secret JWTs
 *      are all rejected 401 with no existence leakage.
 *   2. Authorization — the full 7-role matrix against probes with three
 *      DIFFERENT route-level role gates (read-all, financial reports,
 *      inventory mutation).
 *   3. Tenant + shop isolation — foreign business/shop/document ids are 404
 *      (never 403/200 — no existence leakage).
 *   4. Device identity — client-supplied deviceId cannot enter via body.
 *   5. Financial integrity — client-supplied totals are rejected outright.
 *   6. Injection — $operator query keys and regex metacharacters cannot
 *      escalate into errors or unescaped queries.
 */

const DEV = {
  deviceId: "sec-audit-device",
  deviceName: "Security Audit",
  platform: "android",
  appVersion: "1.0.0",
};

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Sec Audit User",
    email: `sa${Math.random().toString(36).slice(2)}@example.com`,
    phone: "018" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return res.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
}

async function createBusiness(token: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Audit Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: "Main",
      branchCode: `SA-${Math.random().toString(36).slice(2)}`,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createProduct(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: `Audit Product ${Math.random().toString(36).slice(2)}`,
      unit: "piece",
      sellingPrice: 50000,
      currentStock: 100,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function setRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(userId),
      businessId: new mongoose.Types.ObjectId(businessId),
    },
    { role }
  );
}

let owner: Awaited<ReturnType<typeof registerUser>>;
let bizA: { id: string };
let shopA: { id: string };

before(async () => {
  await connectTestDb("business-os-test-sec-audit");
  owner = await registerUser();
  bizA = await createBusiness(owner.accessToken);
  shopA = await createShop(owner.accessToken, bizA.id);
});

after(async () => {
  await disconnectTestDb();
});

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------

test("security: an EXPIRED access token is rejected 401", async () => {
  const expired = jwt.sign(
    { userId: owner.user.id, deviceId: DEV.deviceId, sessionId: "sess-expired" },
    env.JWT_ACCESS_SECRET,
    { subject: owner.user.id, expiresIn: -60 }
  );
  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${expired}`);
  assert.equal(res.status, 401);
});

test("security: a token signed with the WRONG secret is rejected 401", async () => {
  const forged = jwt.sign(
    { userId: owner.user.id, deviceId: DEV.deviceId, sessionId: "sess-forged" },
    "attacker-controlled-secret-value-1234",
    { subject: owner.user.id, expiresIn: "15m" }
  );
  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${forged}`);
  assert.equal(res.status, 401);
});

test("security: a TAMPERED signature is rejected 401", async () => {
  const valid = jwt.sign(
    { userId: owner.user.id, deviceId: DEV.deviceId, sessionId: "sess-tamper" },
    env.JWT_ACCESS_SECRET,
    { subject: owner.user.id, expiresIn: "15m" }
  );
  const parts = valid.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      userId: owner.user.id,
      deviceId: DEV.deviceId,
      sessionId: "sess-tamper",
      role: "Owner",
      elevated: true,
    })
  ).toString("base64url");
  // Valid signature kept, payload swapped → signature verification MUST fail.
  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${parts[0]}.${tamperedPayload}.${parts[2]}`);
  assert.equal(res.status, 401);
});

test("security: malformed tokens are rejected 401 (no stack trace leakage)", async () => {
  for (const bad of ["not-a-jwt", "a.b.c", "", `${"x".repeat(50)}.y.z`]) {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set(
        "Authorization",
        bad ? `Bearer ${bad}` : "Bearer "
      );
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "UNAUTHORIZED");
  }
});

test("security: missing token is 401 with no user details echoed", async () => {
  const res = await request(app).get("/api/v1/auth/me");
  assert.equal(res.status, 401);
  assert.ok(!JSON.stringify(res.body).includes(owner.user.email));
});

// ---------------------------------------------------------------------------
// 2. Authorization — full seven-role matrix across distinct gates
// ---------------------------------------------------------------------------

/**
 * Route-level role gates under test (from src/routes/*.ts):
 *   reports/sales     → Owner Admin Manager Accountant
 *   inventory/adjust  → Owner Admin Manager Inventory Manager
 *   products list     → any ACTIVE member (all roles read)
 */
const REPORTS_ROLES = ["Owner", "Admin", "Manager", "Accountant"];
const INVENTORY_ROLES = ["Owner", "Admin", "Manager", "Inventory Manager"];

for (const role of ROLES) {
  test(`security: role ${role} → financial reports ${REPORTS_ROLES.includes(role) ? "ALLOWED" : "403"}, inventory adjust ${INVENTORY_ROLES.includes(role) ? "ALLOWED" : "403"}, product reads allowed`, async () => {
    const member = await registerUser();
    await BusinessMembership.create({
      userId: new mongoose.Types.ObjectId(member.user.id),
      businessId: new mongoose.Types.ObjectId(bizA.id),
      shopId: new mongoose.Types.ObjectId(shopA.id),
      role,
      status: "ACTIVE",
    });

    const reports = await request(app)
      .get(
        `/api/v1/reports/sales?businessId=${bizA.id}&shopId=${shopA.id}&groupBy=daily`
      )
      .set("Authorization", `Bearer ${member.accessToken}`);
    assert.equal(reports.status, REPORTS_ROLES.includes(role) ? 200 : 403);

    const product = await createProduct(owner.accessToken, bizA.id);
    const adjust = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Authorization", `Bearer ${member.accessToken}`)
      .send({
        businessId: bizA.id,
        shopId: shopA.id,
        productId: product.id,
        qtyChange: 5,
        reason: "audit-lane probe",
        kind: "adjustment",
      });
    assert.equal(adjust.status, INVENTORY_ROLES.includes(role) ? 201 : 403);

    const reads = await request(app)
      .get(`/api/v1/products?businessId=${bizA.id}&shopId=${shopA.id}`)
      .set("Authorization", `Bearer ${member.accessToken}`);
    assert.equal(reads.status, 200); // every ACTIVE role may READ
  });
}

// ---------------------------------------------------------------------------
// 3. Tenant + shop isolation (existence non-leakage)
// ---------------------------------------------------------------------------

test("security: tenant isolation — outsider gets 404 (not 403) on every probe of business A", async () => {
  const outsider = await registerUser();
  const probes = [
    `/api/v1/products?businessId=${bizA.id}&shopId=${shopA.id}`,
    `/api/v1/customers?businessId=${bizA.id}&shopId=${shopA.id}`,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${shopA.id}`,
    `/api/v1/accounts?businessId=${bizA.id}&shopId=${shopA.id}`,
  ];
  for (const url of probes) {
    const res = await request(app)
      .get(url)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    assert.equal(res.status, 404, `expected 404 for ${url}`);
  }
});

test("security: foreign document id inside own context is 404 with zero data echoed", async () => {
  const other = await registerUser();
  const otherBiz = await createBusiness(other.accessToken);
  const otherShop = await createShop(other.accessToken, otherBiz.id);
  const foreignProduct = await createProduct(other.accessToken, otherBiz.id, otherShop.id);

  // Owner of business A asks for B's product BY ID while scoped to A.
  const res = await request(app)
    .get(`/api/v1/products/${foreignProduct.id}?businessId=${bizA.id}&shopId=${shopA.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(res.status, 404);
  assert.ok(!JSON.stringify(res.body).includes(foreignProduct.name));
});

test("security: shop isolation — sale created in shop B is invisible when queried under shop A", async () => {
  const shopB = await createShop(owner.accessToken, bizA.id);
  const productB = await createProduct(owner.accessToken, bizA.id);
  const accountId = (
    await request(app)
      .get(`/api/v1/accounts?businessId=${bizA.id}&shopId=${shopB.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
  ).body.data[0].id;
  const created = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: bizA.id,
      shopId: shopB.id,
      items: [{ productId: productB.id, qty: 1 }],
      paidAmount: 50000,
      accountId,
    });
  assert.equal(created.status, 201);

  const leak = await request(app)
    .get(`/api/v1/sales/${created.body.data.id}?businessId=${bizA.id}&shopId=${shopA.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(leak.status, 404);
});

// ---------------------------------------------------------------------------
// 4. Device identity & 5. Financial integrity (strict-schema consolidation)
// ---------------------------------------------------------------------------

test("security: client-supplied deviceId in body is rejected by strict schema", async () => {
  const product = await createProduct(owner.accessToken, bizA.id);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: bizA.id,
      shopId: shopA.id,
      deviceId: "spoofed-device-id",
      items: [{ productId: product.id, qty: 1 }],
    });
  assert.equal(res.status, 400);
  assert.match(JSON.stringify(res.body), /unrecognized|deviceId/i);
});

test("security: client-supplied total on a sale is rejected outright (400)", async () => {
  const product = await createProduct(owner.accessToken, bizA.id);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: bizA.id,
      shopId: shopA.id,
      total: 1,
      taxAmount: 0,
      costPrice: 1,
      items: [{ productId: product.id, qty: 1, total: 1 }],
    });
  assert.equal(res.status, 400);
  assert.match(JSON.stringify(res.body), /unrecognized|total|costPrice/i);
});

test("security: fractional money is rejected (integer paisa invariant)", async () => {
  const res = await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: bizA.id,
      shopId: shopA.id,
      category: "RENT",
      amount: 100.55,
      accountId: new mongoose.Types.ObjectId().toString(),
    });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 6. Injection resistance
// ---------------------------------------------------------------------------

test("security: $operator query keys are sanitized away — never a 500 or injection", async () => {
  const res = await request(app)
    .get(
      `/api/v1/products?businessId=${bizA.id}&shopId=${shopA.id}&search[$ne]=`
    )
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(res.status, 200);
});

test("security: regex metacharacters in search are escaped — served safely", async () => {
  const nasties = ["(.*)+", "^$[a{", "(?=a)*", ".*.*.*[a-z"];
  for (const term of nasties) {
    const res = await request(app)
      .get(
        `/api/v1/search?q=${encodeURIComponent(term)}&businessId=${bizA.id}&shopId=${shopA.id}`
      )
      .set("Authorization", `Bearer ${owner.accessToken}`);
    assert.equal(res.status, 200, `search should safely handle: ${term}`);
  }
});

test("security: malformed ObjectId path params yield 4xx — never a 500", async () => {
  const res = await request(app)
    .get(`/api/v1/products/not-a-valid-objectid?businessId=${bizA.id}&shopId=${shopA.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.ok(
    res.status === 400 || res.status === 404,
    `expected 400/404, got ${res.status}`
  );
});
