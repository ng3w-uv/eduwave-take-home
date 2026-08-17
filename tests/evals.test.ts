import { describe, expect, it } from "vitest";
import { judge, loadCases, runCase } from "../evals/runner.js";

/** Runs every machine-readable eval case through the pipeline (deterministic via
 * the fake provider) and fails CI if any structural expectation regresses. */
describe("evaluation cases (evals/cases.json)", () => {
  const cases = loadCases();

  it("has at least eight cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", async (_id, c) => {
    const { outcome, providerCalls } = await runCase(c);
    const failures = judge(c, outcome, providerCalls);
    expect(failures, `${c.description}\n - ${failures.join("\n - ")}`).toEqual([]);
  });
});
