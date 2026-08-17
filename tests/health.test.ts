import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { makeDeps } from "./helpers.js";

describe("GET /health", () => {
  const app = createApp(makeDeps().deps);

  it("serves the web UI at /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("Wavy Tutor");
  });

  it("reports ok with the active provider", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.provider).toBe("fake");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("returns a controlled 404 for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns a controlled 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .set("Content-Type", "application/json")
      .send('{ "bad": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
