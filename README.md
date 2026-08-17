# Wavy Tutor

A grounded, safe, and adaptive AI learning coach for **Grade 5 fractions**. A
learner sends a message or an answer; the system retrieves relevant curriculum
context, reasons over the conversation, and returns **age-appropriate Socratic
feedback in a validated structure** — guiding toward understanding instead of
handing over the answer.

Built with **TypeScript + Express + SQLite**, running a **local `llama3.1:8b`
model via Ollama** by default (no API key required), with Anthropic Claude
available as a swappable provider.

> **Not an agent — a workflow.** The LLM is a single, schema-constrained step
> inside a deterministic pipeline that *we* control. No agent framework
> (LangChain/etc.): the flow is narrow and reliability matters more than
> autonomy. Every structural, grounding, and safety guarantee is enforced by
> code around the model, not by the model.

---

## Quick start

Prerequisites: Node ≥ 20 and [Ollama](https://ollama.com) running locally.

```bash
ollama pull llama3.1:8b        # one-time; ~4.9 GB
cp .env.example .env           # defaults to local Ollama — no secrets needed
npm install
npm run seed                   # optional: init SQLite + validate the curriculum
npm run dev                    # starts http://localhost:3000
```

Then exercise the full flow with the committed [`requests.http`](./requests.http)
collection (VS Code REST Client / IntelliJ), or:

```bash
curl -s localhost:3000/health
SID=$(curl -s -XPOST localhost:3000/api/sessions -H 'content-type: application/json' -d '{"lang":"en"}' | jq -r .sessionId)
curl -s -XPOST localhost:3000/api/sessions/$SID/messages -H 'content-type: application/json' -d '{"message":"How do I compare 2/5 and 1/2?"}' | jq
```

To use Claude instead: set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the server with reload |
| `npm test` | Full test suite (incl. eval cases); live Ollama smoke skipped |
| `RUN_OLLAMA_SMOKE=1 npm test` | Also run the live model smoke test |
| `npm run eval` | Print the human-readable evaluation report |
| `npm run typecheck` | Strict TypeScript check |
| `npm run seed` | Apply migrations + validate curriculum |

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/sessions` | Start a session (`{ lang?: "en" \| "es" }`) → `{ sessionId }` |
| `POST /api/sessions/:id/messages` | Send a learner message → validated tutor response + `meta` |
| `GET /api/sessions/:id` | Fetch the transcript (never the observability logs) |
| `GET /health` | Liveness + active provider/model |

Response contract (required fields at top level; observability under `meta`):

```json
{
  "tutorMessage": "Let's give both fractions the same size parts first.",
  "misconception": "numerator_only_comparison",
  "nextQuestion": "What denominator could both 5 and 2 share?",
  "confidence": 0.82,
  "curriculumCitations": ["fractions.compare.02"],
  "safetyFlags": []
}
```

## Architecture

```
Client (requests.http / curl)
        │ HTTP · JSON
        ▼
   Express API  ── validates body, controlled errors, 404s
        │
        ▼
  Tutor Pipeline (deterministic; src/tutor/pipeline.ts)
   ├─ Safety pre-check ....... src/tutor/safety.ts
   ├─ Retrieval (keyword) .... src/retrieval/       ──► Curriculum index (8 items)
   ├─ Memory window .......... src/db/repositories   ──► SQLite (sessions/messages)
   ├─ Reveal gate ............ src/tutor/reveal.ts
   ├─ Prompt build ........... src/tutor/prompt.ts
   ├─ LLMProvider  ◄── SEAM ... src/llm/  ───────────► Ollama llama3.1:8b (or Claude)
   ├─ Validate → repair ...... src/llm/structured + src/tutor/contract (Zod)
   ├─ Citation enforcement ... src/tutor/pipeline (finalize)
   └─ Persist + log .......... src/db/repositories   ──► SQLite (request_logs)
```

The `LLMProvider` interface is the one meaningful test seam: injecting a fake
provider makes the entire pipeline deterministic. Everything above the model
call is pure; everything below is code-enforced.

---

## README questions

### 7. Request lifecycle, from incoming message to stored response

`POST /api/sessions/:id/messages` → validate body (Zod) → 404 if the session is
unknown → **persist the learner message** → load the recent-message window →
**safety pre-check** (obvious violations short-circuit with a canned redirect,
model never called) → **retrieve** curriculum by keyword (low-signal follow-ups
reuse the prior topic) → compute **`revealAllowed`** → **build the prompt**
(hardened system instruction; curriculum + learner text as *delimited data*) →
**`generateStructured`** (constrained decode → Zod validate → one repair re-ask →
safe fallback) → **enforce citations ⊆ retrieved** and clamp confidence →
**persist the assistant message** (with the tutor JSON) and a **`request_logs`**
row (latency, tokens, est. cost, retrieved IDs, safety flags, error) → return the
validated response + `meta`. See `src/tutor/pipeline.ts`.

### 8. How does retrieval work, and what would make it fail?

Lexical keyword scoring over the 8 curriculum items (`src/retrieval/`): the query
is lowercased, tokenized, stop-worded, and lightly singularized; each item scores
a weighted sum of matches in **keywords (3) > title (2) > content (1)**, and the
matched terms are returned as the "why this is relevant." We return the top-k
(default 3) above a threshold. **Failure modes:** paraphrases with no shared
keywords (e.g. "unlike bottoms" for "different denominators"), which is why
low-signal turns fall back to the prior topic; and genuine bag-of-words
collisions ("different denominators" also matches the *addition* lesson), which
we accept because top-k passes both and citation enforcement keeps grounding
honest. Embeddings would improve recall but add infra and a second failure mode
for negligible gain on 8 items — a documented future improvement.

### 9. What does the confidence score mean? Calibrated or heuristic?

It is the model's own **0–1 self-report**, clamped to range and treated as an
**uncalibrated heuristic** — a rough hint, not a probability. We do not trust it
for control flow; we *lower* it in code when grounding is weak (e.g. every
proposed citation was invented → capped at 0.3). Calibrating it would require a
labeled dataset and reliability-diagram analysis we don't have here.

### 10. How do you prevent the model from inventing curriculum citations?

Grounding is enforced by **code, not trust**. Only the retrieved IDs are given to
the model, and after generation we filter `curriculumCitations` to the set that
was actually retrieved (`finalize()` in `src/tutor/pipeline.ts`). Anything else is
stripped; if that empties the list, confidence is pulled down. Covered by the
`grounding-strip-invented-citation` eval and a pipeline unit test.

### 11. What if the provider times out or returns invalid JSON?

Timeouts are bounded by an `AbortController` and surface as a typed `LlmError`,
which the pipeline turns into a **controlled Socratic fallback** response (still
schema-valid) and logs with the error code — the learner never sees a stack
trace. Invalid/malformed output is caught by Zod, retried **once** with the
validator error fed back, and if it still fails, the same safe fallback is
returned. See the `reliability-provider-timeout` eval and `tests/pipeline.test.ts`.

### 12. What would change for 100,000 learner messages/day?

(≈1.2 msg/s average, higher at peak.) Move SQLite → Postgres (concurrent writes,
connection pool) and make request logging async/batched. Cap and summarize
conversation memory with a **rolling summary** of older turns instead of a raw
window. Run a pool of Ollama workers (or a hosted endpoint) behind a queue with
backpressure, and add a retrieval/response cache for repeated questions. Promote
observability to real metrics (p50/p95 latency, error rate, cost) with alerting.
The `LLMProvider` seam means the app code barely changes.

### 13. How to reduce model cost by 50% without harming learning quality?

Locally, marginal API cost is already ~$0; the lever is **compute/latency**. Use a
smaller/more-quantized model for easy turns and reserve a larger one for hard
ones (a router); trim the prompt (shorter system text, fewer/leaner retrieved
items, tighter memory window); **cache** identical or near-identical requests; and
cap `max_tokens`. For a hosted provider the same prompt-size and caching levers
plus model tiering cut billed tokens directly. Quality is protected by keeping
retrieval + validation + safety unchanged — only the generation budget shrinks.

### 14. Biggest weakness in the current implementation

**Tutoring quality depends on an 8B local model**, which adheres to the schema and
Socratic constraints less reliably than a frontier model — so the repair loop and
safety pre-checks carry real load, and subtle prompt-injection that dodges the
regex pre-check leans entirely on the hardened prompt. The `LLMProvider` seam lets
us swap to Claude for quality, but the local default is the honest weak point.
Secondary: keyword retrieval misses paraphrases (see Q8).

---

## Known limitations & next three improvements

**Limitations:** local-model quality (Q14); keyword-only retrieval; safety
pre-checks are regex heuristics (not exhaustive); rolling-summary memory is
designed but not built; the Anthropic provider is implemented but not covered by
an automated live test.

**Next three:**
1. Add embeddings/hybrid retrieval to catch paraphrases.
2. Implement rolling-summary memory for long conversations.
3. Add streaming responses while preserving the validated structured metadata.

## Tech choices

TypeScript (their preference + strongest for a live-modification review); Express
(4 routes, nothing to explain); `better-sqlite3` (synchronous, transparent SQL,
zero-infra local setup) over an ORM; Zod as the single source of truth for the
contract; Ollama `format`-constrained decoding over tool-calling for local
reliability. Run via `tsx`; `tsc` for type-checking only.
