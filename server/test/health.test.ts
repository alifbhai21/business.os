import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app";

test("GET /health returns 200 ok", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.status, "ok");
});

test("GET /ready returns 503 when DB disconnected", async () => {
  const res = await request(app).get("/ready");
  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.status, "not_ready");
});

test("GET /unknown returns 404", async () => {
  const res = await request(app).get("/unknown-route");
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, "NOT_FOUND");
});
