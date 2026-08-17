import { fileURLToPath } from "node:url";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import type { AppDeps } from "./deps.js";
import { runTutorTurn } from "./tutor/pipeline.js";

/** Minimal static web UI lives here (served at `/`). */
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

/** The single controlled error shape. Every failure resolves to this — never a
 * stack trace (brief: "a useful, controlled error instead of a crash"). */
export type ApiError = { error: { code: string; message: string } };

const CreateSessionSchema = z.object({
  lang: z.enum(["en", "es"]).optional(),
});

const PostMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

function invalidRequest(res: Response, error: z.ZodError): void {
  const message = error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  res.status(400).json({ error: { code: "invalid_request", message } } satisfies ApiError);
}

function notFound(res: Response): void {
  res
    .status(404)
    .json({ error: { code: "session_not_found", message: "Session not found." } } satisfies ApiError);
}

/** Forwards rejected promises from async handlers to the error middleware so an
 * unexpected throw becomes a controlled 500 rather than an unhandled rejection. */
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

/**
 * Builds the Express app around injected dependencies. Exported (not started
 * here) so tests drive it in-process via supertest — the HTTP test seam.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: "32kb" }));

  // Minimal chat UI at `/` (serves public/index.html). Missing files fall
  // through to the API routes / 404 handler below.
  app.use(express.static(PUBLIC_DIR));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      provider: deps.provider.name,
      model: deps.provider.model,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Start (or resume) a session.
  app.post("/api/sessions", (req, res) => {
    const parsed = CreateSessionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalidRequest(res, parsed.error);
    const session = deps.repos.createSession(parsed.data.lang ?? "en");
    res.status(201).json({
      sessionId: session.id,
      lang: session.lang,
      createdAt: session.created_at,
    });
  });

  // Post a learner message and get validated Socratic feedback.
  app.post(
    "/api/sessions/:id/messages",
    asyncHandler(async (req, res) => {
      const parsed = PostMessageSchema.safeParse(req.body ?? {});
      if (!parsed.success) return invalidRequest(res, parsed.error);
      const sessionId = req.params.id as string; // guaranteed by the route pattern
      if (!deps.repos.getSession(sessionId)) return notFound(res);

      const { response, meta } = await runTutorTurn(deps, {
        sessionId,
        message: parsed.data.message,
      });
      // Required contract fields at top level; observability under `meta`.
      res.status(200).json({ ...response, meta });
    }),
  );

  // Fetch a session transcript (messages only — never the observability logs).
  app.get("/api/sessions/:id", (req, res) => {
    const session = deps.repos.getSession(req.params.id as string);
    if (!session) return notFound(res);
    const messages = deps.repos.getMessages(session.id).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tutor: m.tutor_json ? JSON.parse(m.tutor_json) : undefined,
      createdAt: m.created_at,
    }));
    res.json({
      session: { id: session.id, lang: session.lang, createdAt: session.created_at },
      messages,
    });
  });

  // Unmatched route.
  app.use((_req, res) => {
    res
      .status(404)
      .json({ error: { code: "not_found", message: "Route not found." } } satisfies ApiError);
  });

  // Central error handler — controlled shape, no stack trace to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const isBadJson = err instanceof SyntaxError && "body" in (err as SyntaxError & object);
    const status = isBadJson ? 400 : 500;
    res.status(status).json({
      error: {
        code: isBadJson ? "invalid_json" : "internal_error",
        message: isBadJson
          ? "Request body is not valid JSON."
          : "Something went wrong. Please try again.",
      },
    } satisfies ApiError);
  });

  return app;
}
