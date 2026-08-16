import { randomUUID } from "node:crypto";
import type { DB } from "./index.js";

export type Role = "user" | "assistant";

export interface Session {
  id: string;
  lang: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: Role;
  content: string;
  tutor_json: string | null;
  created_at: string;
}

export interface RequestLogInput {
  sessionId: string;
  messageId?: string | null;
  provider: string;
  model: string;
  latencyMs?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  estCost?: number | null;
  retrievedIds?: string[];
  safetyFlags?: string[];
  error?: string | null;
}

const id = (prefix: string) => `${prefix}_${randomUUID()}`;

/**
 * Thin data-access layer bound to a DB instance. No ORM — plain, prepared SQL
 * so every query is visible and explainable. Instantiate with an in-memory DB
 * in tests.
 */
export class Repositories {
  constructor(private readonly db: DB) {}

  createSession(lang = "en"): Session {
    const session: Session = {
      id: id("sess"),
      lang,
      created_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO sessions (id, lang, created_at) VALUES (@id, @lang, @created_at)`,
      )
      .run(session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .get(sessionId) as Session | undefined;
  }

  insertMessage(input: {
    sessionId: string;
    role: Role;
    content: string;
    tutorJson?: unknown;
  }): Message {
    const message: Message = {
      id: id("msg"),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      tutor_json: input.tutorJson != null ? JSON.stringify(input.tutorJson) : null,
      created_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, tutor_json, created_at)
         VALUES (@id, @session_id, @role, @content, @tutor_json, @created_at)`,
      )
      .run(message);
    return message;
  }

  /** Messages for a session in chronological order. */
  getMessages(sessionId: string): Message[] {
    return this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC`,
      )
      .all(sessionId) as Message[];
  }

  /** Most recent `limit` messages, returned in chronological order (for the memory window). */
  getRecentMessages(sessionId: string, limit: number): Message[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(sessionId, limit) as Message[];
    return rows.reverse();
  }

  insertRequestLog(input: RequestLogInput): void {
    this.db
      .prepare(
        `INSERT INTO request_logs
           (id, session_id, message_id, provider, model, latency_ms, tokens_in,
            tokens_out, est_cost, retrieved_ids, safety_flags, error, created_at)
         VALUES
           (@id, @session_id, @message_id, @provider, @model, @latency_ms, @tokens_in,
            @tokens_out, @est_cost, @retrieved_ids, @safety_flags, @error, @created_at)`,
      )
      .run({
        id: id("log"),
        session_id: input.sessionId,
        message_id: input.messageId ?? null,
        provider: input.provider,
        model: input.model,
        latency_ms: input.latencyMs ?? null,
        tokens_in: input.tokensIn ?? null,
        tokens_out: input.tokensOut ?? null,
        est_cost: input.estCost ?? null,
        retrieved_ids: JSON.stringify(input.retrievedIds ?? []),
        safety_flags: JSON.stringify(input.safetyFlags ?? []),
        error: input.error ?? null,
        created_at: new Date().toISOString(),
      });
  }
}
