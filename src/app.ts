import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { config } from "./config.js";

/**
 * The single controlled error shape. Every failure path resolves to this —
 * never a stack trace (brief: "a useful, controlled error instead of a crash").
 */
export type ApiError = { error: { code: string; message: string } };

/**
 * Builds the Express app. Exported (rather than started here) so tests can
 * drive it in-process via supertest — this is the HTTP-level test seam.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      provider: config.LLM_PROVIDER,
      model:
        config.LLM_PROVIDER === "ollama"
          ? config.OLLAMA_MODEL
          : config.ANTHROPIC_MODEL,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // 404 for anything unmatched.
  app.use((_req: Request, res: Response) => {
    const body: ApiError = {
      error: { code: "not_found", message: "Route not found." },
    };
    res.status(404).json(body);
  });

  // Central error handler — controlled shape, no stack trace to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Malformed JSON body surfaces here as a SyntaxError from express.json().
    const isBadJson =
      err instanceof SyntaxError && "body" in (err as SyntaxError & object);
    const status = isBadJson ? 400 : 500;
    const body: ApiError = {
      error: {
        code: isBadJson ? "invalid_json" : "internal_error",
        message: isBadJson
          ? "Request body is not valid JSON."
          : "Something went wrong. Please try again.",
      },
    };
    res.status(status).json(body);
  });

  return app;
}
