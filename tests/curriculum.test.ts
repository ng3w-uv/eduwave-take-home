import { describe, expect, it } from "vitest";
import { Curriculum, loadCurriculum } from "../src/curriculum/index.js";
import {
  MISCONCEPTION_CODES,
  MISCONCEPTIONS,
} from "../src/curriculum/misconceptions.js";

describe("Curriculum loader", () => {
  it("loads all items with unique, preserved IDs", () => {
    const items = loadCurriculum();
    expect(items.length).toBeGreaterThanOrEqual(8);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("fractions.compare.02");
  });

  it("exposes a fast id lookup via the Curriculum index", () => {
    const c = Curriculum.load();
    expect(c.has("fractions.compare.02")).toBe(true);
    expect(c.get("fractions.compare.02")?.title).toMatch(/common denominator/i);
    expect(c.has("fractions.does.not.exist")).toBe(false);
  });
});

describe("Misconception vocabulary", () => {
  it("includes the contract example and a `none` fallback", () => {
    expect(MISCONCEPTION_CODES).toContain("numerator_only_comparison");
    expect(MISCONCEPTION_CODES).toContain("none");
  });

  it("only references real curriculum IDs in relatedItems", () => {
    const validIds = new Set(Curriculum.load().ids);
    for (const code of MISCONCEPTION_CODES) {
      for (const ref of MISCONCEPTIONS[code].relatedItems) {
        expect(validIds.has(ref), `${code} -> ${ref}`).toBe(true);
      }
    }
  });
});
