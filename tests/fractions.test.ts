import { describe, expect, it } from "vitest";
import { buildFractionFacts, parseFractions } from "../src/tutor/fractions.js";

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

describe("buildFractionFacts", () => {
  it("returns null when there are no fractions", () => {
    expect(buildFractionFacts(["hello", "10"])).toBeNull();
  });

  it("computes the correct smallest common denominator and comparison", () => {
    const notes = buildFractionFacts(["How do I compare 2/5 and 1/2?"])!;
    expect(notes).toContain("smallest common denominator is 10");
    expect(notes).toContain("4/10 and 5/10");
    expect(notes).toContain("2/5 < 1/2"); // 0.4 < 0.5
  });

  it("classifies against the 1/2 benchmark", () => {
    const notes = buildFractionFacts(["is 2/5 near a half?"])!;
    expect(notes).toContain("2/5 = 0.400");
    expect(notes).toContain("less than 1/2");
  });

  it("deduplicates equivalent fractions (5/10 collapses to 1/2)", () => {
    const notes = buildFractionFacts(["compare 1/2 and 2/5", "I wrote 5/10 and 4/10"])!;
    // 5/10 and 4/10 are equivalents of 1/2 and 2/5, so no new fractions appear
    expect(notes).toContain("Fractions in play: 1/2, 2/5");
    expect(notes).not.toContain("5/10 =");
  });
});
