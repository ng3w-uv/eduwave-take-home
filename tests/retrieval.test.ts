import { describe, expect, it } from "vitest";
import { Curriculum } from "../src/curriculum/index.js";
import { retrieve, tokenize } from "../src/retrieval/index.js";

const curriculum = Curriculum.load();

describe("tokenize", () => {
  it("lowercases, drops stopwords, and singularizes", () => {
    expect(tokenize("How do I compare fractions with different denominators?")).toEqual([
      "compare",
      "fraction",
      "different",
      "denominator",
    ]);
  });
});

describe("retrieve", () => {
  it("returns relevant curriculum IDs for a known fractions question", () => {
    // Bag-of-words: "different denominators" also matches the addition lesson,
    // so we assert the relevant item is retrieved (a set), not a strict rank #1.
    const { results, lowSignal } = retrieve(
      curriculum,
      "How do I compare fractions with different denominators?",
    );
    expect(lowSignal).toBe(false);
    expect(results.map((r) => r.id)).toContain("fractions.compare.02");
  });

  it("selects the same-denominator addition lesson", () => {
    const { results } = retrieve(
      curriculum,
      "add fractions with the same denominator",
    );
    expect(results[0]!.id).toBe("fractions.add.01");
  });

  it("exposes matched terms as the relevance explanation", () => {
    const { results } = retrieve(curriculum, "equivalent fractions simplify");
    expect(results[0]!.id).toBe("fractions.equivalent.01");
    expect(results[0]!.matched).toContain("equivalent");
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("respects topK", () => {
    const { results } = retrieve(curriculum, "compare fractions", { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("flags low-signal follow-ups that match nothing", () => {
    const { results, lowSignal } = retrieve(curriculum, "I still don't understand");
    expect(lowSignal).toBe(true);
    expect(results).toEqual([]);
  });
});
