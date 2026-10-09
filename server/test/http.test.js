import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { chatRouter } from "../src/routes/chat.js";
import { adminRouter } from "../src/routes/admin.js";

// These tests only cover requests that are rejected before the database is touched.
const config = { adminEmail: "admin@example.com", adminPassword: "s3cret-pass", jwtSecret: "test-secret", dashboardOrigins: ["http://localhost:5173"] };
const app = express();
app.use(express.json());
app.use("/api/chat", chatRouter({ llm: null }));
app.use("/api/admin", adminRouter({ config, retriever: { invalidate() {} }, embedder: null }));

let server, base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("chat rejects invalid session ids and bad messages", async () => {
  assert.equal((await post("/api/chat", { sessionId: "short", message: "hi" })).status, 400);
  const sid = "a".repeat(24);
  assert.equal((await post("/api/chat", { sessionId: sid, message: "" })).status, 400);
  assert.equal((await post("/api/chat", { sessionId: sid, message: "x".repeat(1001) })).status, 400);
  assert.equal((await fetch(`${base}/api/chat/bad`)).status, 400);
  assert.equal((await post(`/api/chat/${sid}/email`, { email: "not-an-email" })).status, 400);
});

test("admin login accepts the right credentials and rejects the wrong ones", async () => {
  assert.equal((await post("/api/admin/login", { email: "admin@example.com", password: "wrong" })).status, 401);
  assert.equal((await post("/api/admin/login", {})).status, 401);
  const ok = await post("/api/admin/login", { email: "admin@example.com", password: "s3cret-pass" });
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).token.split(".").length === 3);
});

test("admin routes need a valid token", async () => {
  for (const path of ["/stats", "/conversations", "/tickets", "/documents", "/orders"]) {
    assert.equal((await fetch(base + "/api/admin" + path)).status, 401, path);
  }
  assert.equal((await fetch(base + "/api/admin/stats", { headers: { Authorization: "Bearer nonsense" } })).status, 401);
});
