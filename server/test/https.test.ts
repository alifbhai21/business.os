import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { httpsRedirect } from "../src/middleware/https";

/**
 * Phase 13 — HTTPS enforcement behind a TLS-terminating proxy (Render).
 * Verified against a minimal Express app so the middleware contract is
 * proven without booting the full production stack.
 */
function miniApp() {
  const app = express();
  app.use(httpsRedirect);
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/ready", (_req, res) => res.json({ ok: true }));
  app.post("/api/v1/echo", (req, res) => res.json({ echoed: true }));
  app.all("*", (_req, res) => res.json({ reached: true }));
  return app;
}

test("https: forwarded http request is permanently redirected to https preserving path+query", async () => {
  const res = await request(miniApp())
    .get("/api/v1/products?page=2&search=cola")
    .set("x-forwarded-proto", "http")
    .set("host", "api.example.com");
  assert.equal(res.status, 308);
  assert.equal(res.headers.location, "https://api.example.com/api/v1/products?page=2&search=cola");
});

test("https: comma-separated x-forwarded-proto uses the client-facing protocol", async () => {
  const res = await request(miniApp())
    .get("/api/v1/products")
    .set("x-forwarded-proto", "http,https")
    .set("host", "api.example.com");
  assert.equal(res.status, 308);
});

test("https: forwarded https request passes through untouched", async () => {
  const res = await request(miniApp())
    .get("/api/v1/products")
    .set("x-forwarded-proto", "https");
  assert.equal(res.status, 200);
  assert.equal(res.body.reached, true);
});

test("https: no x-forwarded-proto header passes through (direct/internal traffic)", async () => {
  const res = await request(miniApp()).get("/api/v1/products");
  assert.equal(res.status, 200);
  assert.equal(res.body.reached, true);
});

test("https: /health is exempt so platform probes never fail", async () => {
  const res = await request(miniApp()).get("/health").set("x-forwarded-proto", "http");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("https: /ready is exempt so platform probes never fail", async () => {
  const res = await request(miniApp()).get("/ready").set("x-forwarded-proto", "http");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("https: POST survives the redirect with method and body preserved (308)", async () => {
  const agent = express();
  agent.set("trust proxy", true);
  agent.use(httpsRedirect);
  let sawBody = false;
  agent.use(express.json());
  agent.post("/api/v1/sales", (req, res) => {
    sawBody = Boolean(req.body && (req.body as { marker?: string }).marker);
    res.json({ method: req.method });
  });

  const redirect = await request(agent)
    .post("/api/v1/sales")
    .set("x-forwarded-proto", "http")
    .set("host", "api.example.com")
    .send({ marker: "keep-me" });
  assert.equal(redirect.status, 308);
  // 308 Permanent Redirect preserves method + body for the retrying client.
  assert.equal(redirect.headers.location, "https://api.example.com/api/v1/sales");
  assert.equal(sawBody, false); // first leg only redirected, not re-executed
});
