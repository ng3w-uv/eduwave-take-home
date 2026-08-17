import { describe, expect, it } from "vitest";
import {
  buildFractionFactsForTurn,
  parseFractions,
} from "../src/tutor/fractions.js";

describe("parseFractions", () => {
  it("extracts a/b fractions and ignores non-fractions", () => {
    expect(parseFractions("compare 2/5 and 1/2, not 10")).toEqual([
      { n: 2, d: 5 },
      { n: 1, d: 2 },
    ]);
  });
  it("skips zero denominators", () => {
    expect(parseFractions("3/0 is undefined")).toEqual([]);
  });
});

describe("buildFractionFactsForTurn", () => {
  it("returns null when there are no fractions anywhere", () => {
    expect(buildFractionFactsForTurn("hello", ["10"])).toBeNull();
  });

  it("computes the smallest common denominator, equivalents, and plain verdict", () => {
    const notes = buildFractionFactsForTurn("How do I compare 2/5 and 1/2?", [])!;
    expect(notes).toContain("common denominator is 10");
    expect(notes).toContain("2/5 = 4/10");
    expect(notes).toContain("1/2 = 5/10");
    expect(notes).toContain("the greater fraction is 1/2");
    expect(notes).toContain("2/5 < 1/2"); // 0.4 < 0.5
  });

  it("classifies each fraction against the 1/2 benchmark", () => {
    const notes = buildFractionFactsForTurn("is 2/5 near a half?", [])!;
    expect(notes).toContain("2/5 = 0.400");
    expect(notes).toContain("less than 1/2");
  });

  it("deduplicates equivalent fractions (5/10 collapses to 1/2)", () => {
    const notes = buildFractionFactsForTurn("is 1/2 the same as 5/10?", [])!;
    expect(notes).toContain("Fractions in play: 1/2");
    expect(notes).not.toContain("5/10");
  });

  it("scopes to the current message, ignoring stale earlier pairs", () => {
    const notes = buildFractionFactsForTurn("Is 1/2 greater than 2/5?", [
      "earlier we compared 5/6 and 1/2",
      "and before that 3/4 and 1/2",
    ])!;
    expect(notes).toContain("Fractions in play: 1/2, 2/5");
    expect(notes).not.toContain("5/6");
    expect(notes).not.toContain("3/4");
    expect(notes).toContain("1/2 > 2/5"); // 0.5 > 0.4
  });

  it("falls back to the most-recent prior pair when the message has no fractions", () => {
    const notes = buildFractionFactsForTurn("10", [
      "How do I compare 2/5 and 1/2?",
    ])!;
    expect(notes).toContain("common denominator is 10");
    expect(notes).toContain("2/5");
    expect(notes).toContain("1/2");
  });
});
