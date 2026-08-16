import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "../src/db/index.js";
import { Repositories } from "../src/db/repositories.js";

describe("Repositories (in-memory SQLite)", () => {
  let db: DB;
  let repos: Repositories;

  beforeEach(() => {
    db = createDb(":memory:");
    repos = new Repositories(db);
  });

  it("creates and reads back a session", () => {
    const s = repos.createSession("en");
    expect(s.id).toMatch(/^sess_/);
    expect(repos.getSession(s.id)?.lang).toBe("en");
  });

  it("returns undefined for an unknown session", () => {
    expect(repos.getSession("sess_missing")).toBeUndefined();
  });

  it("stores messages and returns them in chronological order", () => {
    const s = repos.createSession();
    repos.insertMessage({ sessionId: s.id, role: "user", content: "first" });
    repos.insertMessage({
      sessionId: s.id,
      role: "assistant",
      content: "second",
      tutorJson: { confidence: 0.8 },
    });
    const msgs = repos.getMessages(s.id);
    expect(msgs.map((m) => m.content)).toEqual(["first", "second"]);
    expect(JSON.parse(msgs[1]!.tutor_json!).confidence).toBe(0.8);
  });

  it("windows recent messages but returns them chronologically", () => {
    const s = repos.createSession();
    for (let i = 0; i < 5; i++) {
      repos.insertMessage({ sessionId: s.id, role: "user", content: `m${i}` });
    }
    const recent = repos.getRecentMessages(s.id, 3);
    expect(recent.map((m) => m.content)).toEqual(["m2", "m3", "m4"]);
  });

  it("enforces the foreign key from message to session", () => {
    expect(() =>
      repos.insertMessage({
        sessionId: "sess_missing",
        role: "user",
        content: "orphan",
      }),
    ).toThrow();
  });

  it("writes a request log without raw student content", () => {
    const s = repos.createSession();
    repos.insertRequestLog({
      sessionId: s.id,
      provider: "ollama",
      model: "llama3.1:8b",
      latencyMs: 1200,
      tokensIn: 400,
      tokensOut: 80,
      estCost: 0,
      retrievedIds: ["fractions.compare.02"],
      safetyFlags: [],
    });
    const row = db
      .prepare(`SELECT * FROM request_logs WHERE session_id = ?`)
      .get(s.id) as { retrieved_ids: string; error: string | null };
    expect(JSON.parse(row.retrieved_ids)).toEqual(["fractions.compare.02"]);
    expect(row.error).toBeNull();
  });
});
