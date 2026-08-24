import mongoose from "mongoose";
import request from "supertest";
import { app } from "../../../src/app";
import { BusinessMembership, ROLES } from "../../../src/models/BusinessMembership";

/** Unique run prefix so concurrent/atlas data never collides across runs. */
const runId = Math.random().toString(36).slice(2, 10);

export function uid(prefix: string): string {
  return `${prefix}-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function randomEmail(prefix: string): string {
  return `${prefix}-${runId}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function randomPhone(): string {
  return "01" + Math.floor(10000000 + Math.random() * 89999999);
}

/** Device input sent on register/login — verified JWT device identity. */
export const DEV = {
  deviceId: uid("dev"),
  deviceName: "AtlasHarnessDevice",
  platform: "android",
  appVersion: "1.0.0",
};

export interface AtlasUser {
  user: { id: string };
  accessToken: string;
  refreshToken: string;
  businessId: string | null;
  /** Phase 09 — the account phone, needed for employee-invite flows. */
  phone: string;
}

export async function registerUser(prefix = "user"): Promise<AtlasUser> {
  const phone = randomPhone();
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Atlas User",
      email: randomEmail(prefix),
      phone,
      password: "password123",
      ...DEV,
    });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...(res.body.data as AtlasUser), phone };
}

export async function createBusiness(token: string): Promise<{ id: string } & Record<string, unknown>> {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `AtlasBiz-${runId}`, type: "retail" });
  if (res.status !== 201) throw new Error(`createBusiness failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createShop(
  token: string,
  businessId: string,
  openingCashPaisa = 1000000
): Promise<{ id: string } & Record<string, unknown>> {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: `Shop-${uid("s")}`,
      branchCode: `BR-${uid("bc").slice(0, 10)}`,
      openingCash: openingCashPaisa,
    });
  if (res.status !== 201) throw new Error(`createShop failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createAccount(
  token: string,
  businessId: string,
  shopId: string,
  type: string = "CASH",
  name?: string
): Promise<{ id: string } & Record<string, unknown>> {
  const res = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, shopId, type, name: name ?? `Account-${uid("a")}` });
  if (res.status !== 201) throw new Error(`createAccount failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createProduct(
  token: string,
  businessId: string,
  over: Record<string, unknown> = {}
): Promise<{ id: string } & Record<string, unknown>> {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: `P-${uid("p")}`,
      unit: "piece",
      purchasePrice: 10000, // paisa
      sellingPrice: 15000, // paisa
      currentStock: 100,
      taxRate: 0,
      ...over,
    });
  if (res.status !== 201) throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createCustomer(
  token: string,
  businessId: string,
  over: Record<string, unknown> = {}
): Promise<{ id: string } & Record<string, unknown>> {
  const res = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: `C-${uid("c")}`, phone: randomPhone(), ...over });
  if (res.status !== 201) throw new Error(`createCustomer failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createSupplier(
  token: string,
  businessId: string,
  over: Record<string, unknown> = {}
): Promise<{ id: string } & Record<string, unknown>> {
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: `Sup-${uid("sup")}`, phone: randomPhone(), ...over });
  if (res.status !== 201) throw new Error(`createSupplier failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/**
 * Grant a role to a user within a business by writing a BusinessMembership
 * directly (the memberships are only auto-created for the Owner). Role is
 * derived from an explicit membership, matching production invariants.
 */
export async function grantRole(userId: string, businessId: string, role: (typeof ROLES)[number]) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { $set: { role, status: "ACTIVE", permissions: [] } },
    { upsert: true }
  );
}

/** Fetch a brand-new access token for a registered user (via login). */
export async function loginUser(email: string, password: string, deviceId?: string): Promise<AtlasUser> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password, deviceId: deviceId ?? uid("lg"), deviceName: "HarnessLogin" });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as AtlasUser;
}
