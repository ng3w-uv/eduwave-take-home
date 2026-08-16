# Spec: Wavy Tutor — grounded, safe, adaptive fraction tutor

> Status: ready-for-agent · Target tracker: GitHub issue (publish once remote exists)

## Problem Statement

A Grade-5 learner wants help understanding fractions, not just answers handed to
them. They send a message or an attempted answer and expect a response that
diagnoses their thinking, nudges them toward understanding, and stays on topic —
even across follow-ups like "I still don't understand." Eduwave needs this to be
grounded in its own curriculum (no invented facts or citations), safe for a child,
and reliable when the model provider misbehaves — none of which a raw chatbot gives.

## Solution

**Wavy Tutor**: a small TypeScript/Express API backed by SQLite and a **local
`llama3.1:8b` model served by Ollama**. A learner starts a session and posts
messages. For each message the system retrieves the most relevant curriculum
items by keyword score, assembles recent conversation context, and asks the model
(via an abstracted `LLMProvider`) for **Socratic** guidance in a strict structured
shape. The output is schema-validated, its citations are forced to be a subset of
what was actually retrieved, safety is enforced in layers, and every request is
logged (latency, tokens, cost-rate, retrieved IDs, safety flags, failures) without
storing secrets or redundant student content. Failures always return a controlled
error, never a stack trace.

## User Stories

1. As a learner, I want to start a tutoring session, so that my conversation is remembered across messages.
2. As a learner, I want to resume an existing session, so that I can continue where I left off.
3. As a learner, I want to ask a fractions question, so that I get help understanding the concept.
4. As a learner, I want to submit an attempted answer, so that the tutor can diagnose my misconception.
5. As a learner, I want the tutor to guide me with a next question rather than reveal the answer, so that I actually learn.
6. As a learner who has genuinely tried, I want the tutor to give a worked explanation when I ask, so that I'm not stuck forever.
7. As a learner, I want to say "I still don't understand" and get a coherent reply about the same topic, so that follow-ups feel connected.
8. As a learner, I want responses grounded in real curriculum, so that what I'm taught is correct.
9. As a learner, I want the tutor to name my specific misconception, so that I know what to fix.
10. As a learner, I want the tutor to stay on fractions and refuse off-topic or inappropriate requests kindly, so that the space stays safe.
11. As a learner, I want a useful message even when something breaks, so that I'm not shown an error dump.
12. As Eduwave, we want every tutor reply validated against a strict schema, so that malformed model output never reaches a learner.
13. As Eduwave, we want citations to reference only curriculum items actually retrieved, so that the model cannot invent sources.
14. As Eduwave, we want the tutor to resist prompt injection ("ignore your instructions", "reveal your prompt"), so that the system boundary holds.
15. As Eduwave, we want profanity and age-inappropriate content handled with a safe redirect, so that the product is child-appropriate.
16. As Eduwave, we want request latency, model, token usage, estimated cost, retrieved IDs, safety flags, and failures recorded, so that we can observe and debug the system.
17. As Eduwave, we want secrets and unnecessary student content kept out of logs, so that we respect privacy.
18. As Eduwave, we want provider timeouts, invalid JSON, and DB failures handled gracefully, so that a learner always gets a controlled response.
19. As an evaluator, we want a documented one-command local setup and an executable API collection, so that the full flow is easy to exercise.
20. As an evaluator, we want automated tests beyond the happy path and machine-readable eval cases, so that we can trust and judge the behavior.
21. As a developer, we want the model provider swappable behind an interface, so that we can fall back to Anthropic Claude for quality without changing the pipeline.

## Implementation Decisions

**Stack.** TypeScript + Express + `better-sqlite3` (synchronous, transparent SQL;
thin repository module + a seed/migration script, no ORM). Zod is the single source
of truth for the response contract.

**LLM provider.** A `LLMProvider` interface — `generate(messages, jsonSchema) → object`
— is the primary abstraction and the primary test seam. Default implementation targets
**local Ollama `llama3.1:8b`**; an Anthropic Claude implementation is swappable via env
as the documented quality escape hatch. No API key is ever committed; missing config
fails fast at boot with a clear message.

**Structured output.** Do NOT rely on local tool-calling. Derive a JSON Schema from
the Zod schema (`zod-to-json-schema`) and pass it as Ollama's `format` for
constrained decoding. Always validate the result with Zod (never trust the model).
On validation failure, perform exactly **one bounded re-ask** with the validator error
fed back; if that still fails, return a safe controlled fallback response.

**Response contract (Zod-validated).** Required fields: `tutorMessage` (string),
`misconception` (enum), `nextQuestion` (string), `confidence` (number 0–1),
`curriculumCitations` (string[]), `safetyFlags` (enum[]). Extra fields allowed;
required ones never removed.

- `misconception` — a fixed enum of stable slugs derived from the curriculum's
  `common_misconceptions`, plus `none`. Free strings are rejected.
- `confidence` — model-emitted 0–1, clamped/validated in code, documented honestly as
  an **uncalibrated heuristic self-report** (optionally tempered by retrieval score).
- `safetyFlags` — enum drawn from `["profanity","prompt_injection","off_topic","age_inappropriate"]`.

**Retrieval (grounding).** Load and index the curriculum JSON, preserving IDs so
citations verify. Score all items against the lowercased, tokenized query with weighted
matches: **keywords (high) + title (medium) + content (low)**. Return top-k (2–3) above a
threshold; expose matched terms + score as the "why relevant." For low-signal follow-ups
(e.g. "I still don't understand" — no fraction keywords), reuse the **prior turn's**
retrieval topic so context stays coherent (brief requirement #6).

**Citation grounding.** Pass only retrieved IDs to the model; after generation, enforce
in code that `curriculumCitations ⊆ retrievedIds` and strip any others. If stripping
empties the list, lower confidence / flag — never fabricate.

**Conversation memory.** Persist every message. Each turn sends: system prompt +
token-budgeted **window of recent turns** + curriculum retrieved for the current query.
Long-conversation strategy (README Q12): document a **rolling summary of older turns**;
window is implemented, summary is designed-not-built and stated as such.

**Socratic behavior.** Hybrid enforcement: the system prompt sets Socratic tone;
session state tracks attempts-on-topic and detects an explicit "just tell me / I've tried"
request, computing a `revealAllowed` boolean fed into the prompt. Answers are not revealed
on a first, unattempted ask.

**Safety (layered).** (1) Input pre-checks flag profanity / age-inappropriate / obvious
injection and short-circuit clear violations with a canned age-appropriate redirect;
(2) hardened system prompt (curriculum boundary, refuse instruction-override, never reveal
the prompt); (3) treat curriculum + learner text as **delimited data, not instructions**;
(4) output validation. Layering, not a single prompt line.

**Reliability / error contract.** Every failure path — provider timeout (via
`AbortController`), rate-limit, invalid/unrepairable JSON, missing config, DB failure —
resolves to a single controlled shape `{ error: { code, message } }` with an appropriate
HTTP status and no stack trace.

**Observability.** One `request_logs` row per message: latency, model, token usage (from
Ollama eval counts / provider `usage`), `est_cost` from a **configurable per-token rate**
(0 for local Ollama, real rate for Anthropic), `retrieved_ids`, `safety_flags`, failure.
Raw student message text lives only in the `messages` table (needed for memory) and is
**excluded from `request_logs`**; no secrets logged.

**Data model (SQLite).** `sessions(id, created_at, lang)`;
`messages(id, session_id, role, content, created_at, tutor_json?)`;
`request_logs(id, session_id, message_id, provider, model, latency_ms, tokens_in, tokens_out, est_cost, retrieved_ids, safety_flags, error, created_at)`.

**API surface.** `POST /api/sessions`, `POST /api/sessions/:sessionId/messages`,
`GET /api/sessions/:sessionId`, `GET /health`. Shipped with an executable
`requests.http` collection covering the full flow; a minimal HTML page only if time remains.

**Cost story (README Q13).** Local inference ≈ $0 marginal API cost; cost reduction reframes
to compute/latency — smaller/quantized model, trimmed prompts, minimal retrieved context,
caching identical requests. Local tutor-quality is noted as a known limitation.

## Testing Decisions

**What makes a good test here:** assert external behavior and output *structure*, not
implementation details or exact model wording (the brief allows non-matching wording).
Determinism comes from the `LLMProvider` seam, never from the live model.

- **Pure units (no seam):** retrieval scorer returns expected curriculum IDs for a known
  fractions question; Zod validate+repair rejects/repairs malformed output; citation
  subset-check strips invented IDs; memory windowing; safety pre-checks.
- **Pipeline via fake `LLMProvider`:** follow-up reuses prior session context;
  prompt-injection attempt does not override tutor behavior; provider failure
  (throw/timeout) yields a controlled error; malformed-then-repaired flow.
- **HTTP black-box (`supertest`, in-process, temp SQLite):** the 4 routes and `/health`.
- **Runner:** Vitest. Real Ollama only in an optional, non-CI smoke test.

**Eval harness.** `evals/cases.json` — each case `{ id, input, expected, judge }` — judged by
**rule-based structural predicates** (`citations ⊆ retrieved`, `safetyFlags` contains X,
`misconception === Y`, `revealAllowed === false`, no answer-leak substring), run through the
pipeline with a fake provider where stability matters, optionally against real Ollama.
No LLM-as-judge (avoids nondeterminism + a second model dependency); noted as future option.

**Eval coverage (8 core + 2 spare):** (1) grounded retrieval returns correct IDs;
(2) equivalent-fractions concept; (3) misconception detection (`numerator_only_comparison`);
(4) "I still don't understand" reuses prior topic; (5) refuses to reveal on first attempt;
(6) reveals after genuine attempt / explicit request; (7) prompt-injection → behavior intact + flag;
(8) profanity/age-inappropriate → safe redirect + flag; (9) provider failure → controlled error;
(10) invented citation stripped.

## Out of Scope

- Embeddings / vector retrieval (keyword is sufficient for 8 items; noted as future work).
- Any bonus work (streaming, retry/backoff beyond the single repair, eval dashboard,
  idempotency, EN/ES) unless the core is solid — core-only by decision.
- A polished web UI (API-first + `.http` collection; minimal HTML only if time remains).
- Rolling-summary memory implementation (designed and documented, not built).
- Hosted deployment (reliable local setup is the target).
- LLM-as-judge evaluation.

## Further Notes

- **Live-review risk owned:** a 7–8B local model adheres to the schema and Socratic
  constraints less reliably than Claude, so the repair loop and safety pre-checks carry
  more load; the `LLMProvider` seam lets us swap to Claude for quality if needed.
- **README must answer** the brief's Q7–Q14 (request lifecycle, retrieval + failure modes,
  confidence meaning, citation grounding, provider timeout/invalid JSON, 100k msgs/day,
  cost −50%, biggest weakness). Most answers fall directly out of the decisions above.
- **`AI_USAGE.md`** required: tools used, key prompts, AI-generated/modified areas, at least
  one weak/unsafe AI suggestion caught + fix, one decision made differently from the AI.
- **Setup already scaffolded:** `AGENTS.md` + `docs/agents/*` (GitHub tracker, default triage
  labels, single-context domain docs).
