# AI Usage

AI tools were used throughout, as allowed and expected. I retained ownership of
the design: every decision below was made by me and I can explain and modify any
line in a live review.

## Tools used

- **Claude Code (Claude Opus)** — the primary pair-programmer: scaffolding,
  implementation, test-writing, and iterating on the design. Also drove a
  structured design interview ("grilling") that produced the decision record in
  `docs/spec/0001-wavy-tutor.md` before any code was written.
- **Ollama + `llama3.1:8b`** — the runtime tutor model (not a build tool), chosen
  so the project needs no API key and runs fully locally.

## Most important prompts / workflow

1. **Design-first interview.** Before coding, I had the assistant grill me
   round-by-round on every branching decision (language, provider, persistence,
   retrieval, structured-output mechanism, memory, Socratic enforcement,
   safety layering, observability, testing). Output: a written spec I approved.
2. **Phased build with a runnable checkpoint each phase.** Phases 0–6
   (scaffold → data → retrieval → contract+provider → pipeline → API → evals),
   each ending in `npm run typecheck` + `npm test` and a commit. The repo is
   runnable at every commit.
3. **Seam-first testing.** I insisted the `LLMProvider` interface be the single
   test seam so the whole pipeline is deterministic with a fake provider, then
   verified the real integration with a gated live Ollama smoke test.

## Areas substantially AI-generated (then reviewed by me)

- Boilerplate: `package.json`, `tsconfig`, Express app wiring, SQLite schema and
  repository methods, Zod schema, provider HTTP clients.
- First drafts of most tests and the `evals/` runner and cases.
- Prose in this README's Q&A, which I edited for accuracy against the code.

Areas I directed closely: the retrieval scoring weights and low-signal fallback,
the `revealAllowed` gate logic, the citation-enforcement rule, the safety layering,
and the error/fallback contract.

## A weak/incorrect AI suggestion I caught and corrected

The AI-generated retrieval test asserted a **strict rank** —
`results[0].id === "fractions.compare.02"` for *"compare fractions with different
denominators."* That failed, and the failure was correct: "different denominators"
is literally the *addition* lesson's keyword phrase, so the two items legitimately
tie under bag-of-words. Rather than hack the scorer to force a "right" answer, I
changed the test to assert **set membership** (the item is retrieved), which is
faithful to the brief's wording ("retrieval returns relevant curriculum IDs") and
to how keyword retrieval actually behaves. I also removed a second brittle
strict-rank test I had briefly added.

A second catch: I ensured `request_logs` stores retrieval IDs and metadata but
**never the raw student message** (that lives only in `messages`), to honor "do
not log unnecessary student content."

## A decision I made differently from the AI's default

For structured output, the reflexive AI approach is **tool-calling**. I chose
**Ollama's JSON-schema-constrained decoding (`format`)** instead, because local
7–8B models are unreliable at tool calls, whereas constrained decoding forces
well-formed JSON. I derived the schema from Zod (single source of truth), kept the
validate-then-repair loop regardless, and verified the real model returns
schema-valid JSON via a live smoke test (~11s/call). Anthropic (which *is* good at
tool-use) uses forced tool-use behind the same `LLMProvider` interface.
