/**
 * Controlled vocabulary of misconception codes.
 *
 * These slugs are a curated, stable mapping derived from the
 * `common_misconceptions` free text in the curriculum JSON. The model must
 * choose exactly one of these keys (enforced by the Zod enum) rather than
 * emitting free text — so `misconception` is always groundable and testable.
 *
 * `relatedItems` links each code back to the curriculum item IDs it stems from,
 * for traceability. Keep `numerator_only_comparison` — it appears in the brief's
 * response-contract example.
 */
export const MISCONCEPTIONS = {
  none: {
    description: "No specific misconception detected.",
    relatedItems: [],
  },
  larger_denominator_is_larger: {
    description:
      "Believing the fraction with the larger denominator is always the larger fraction.",
    relatedItems: ["fractions.foundations.01", "fractions.compare.02"],
  },
  numerator_only_comparison: {
    description:
      "Comparing numerators (or numerator and denominator) independently, ignoring that part size depends on the denominator.",
    relatedItems: ["fractions.foundations.01", "fractions.compare.02"],
  },
  larger_numerator_is_larger: {
    description:
      "Believing the fraction with the larger numerator is always larger, regardless of denominator.",
    relatedItems: ["fractions.compare.02"],
  },
  only_multiply_numerator: {
    description:
      "When forming equivalent fractions, scaling only the numerator instead of both numerator and denominator.",
    relatedItems: ["fractions.equivalent.01"],
  },
  different_looking_not_equal: {
    description: "Believing fractions that look different cannot be equal.",
    relatedItems: ["fractions.equivalent.01"],
  },
  add_across: {
    description:
      "Adding both numerators and denominators when adding fractions.",
    relatedItems: ["fractions.add.01", "fractions.add.02"],
  },
  add_denominators_directly: {
    description:
      "Adding denominators directly instead of first finding a common denominator.",
    relatedItems: ["fractions.add.02"],
  },
  benchmark_misuse: {
    description:
      "Misapplying benchmark reasoning, e.g. assuming any fraction with numerator 2 is less than 1/2.",
    relatedItems: ["fractions.compare.03"],
  },
  unequal_parts: {
    description:
      "Treating unequal pieces as valid equal parts, or comparing wholes of different sizes directly.",
    relatedItems: ["fractions.visual.01"],
  },
} as const;

export type MisconceptionCode = keyof typeof MISCONCEPTIONS;

export const MISCONCEPTION_CODES = Object.keys(
  MISCONCEPTIONS,
) as [MisconceptionCode, ...MisconceptionCode[]];

/** `code: description` lines fed to the model so it tags the right misconception
 * instead of guessing what each slug means. */
export const MISCONCEPTION_GUIDE = (
  Object.entries(MISCONCEPTIONS) as [MisconceptionCode, { description: string }][]
)
  .map(([code, { description }]) => `- ${code}: ${description}`)
  .join("\n");
