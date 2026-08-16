import "dotenv/config";
import { z } from "zod";

/**
 * Environment config, validated once at boot. Missing/invalid configuration
 * should fail fast here with a clear message rather than crashing mid-request
 * (brief: "Handle ... missing configuration").
 */
const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    LLM_PROVIDER: z.enum(["ollama", "anthropic"]).default("ollama"),
    OLLAMA_HOST: z.string().url().default("http://localhost:11434"),
    OLLAMA_MODEL: z.string().min(1).default("llama3.1:8b"),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
    DB_PATH: z.string().min(1).default("./data/eduwave.db"),
    CURRICULUM_PATH: z
      .string()
      .min(1)
      .default("./eduwave_fraction_curriculum.json"),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
      });
    }
  });

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Fail fast, loudly, without leaking values.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export type Config = ReturnType<typeof loadConfig>;
export const config = loadConfig();
