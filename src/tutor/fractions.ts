/**
 * Deterministic fraction facts. The local model is weak at arithmetic, so we do
 * the math in code and hand the model a verified "answer key" to phrase
 * Socratically — it never has to compute, only teach. This is grounding applied
 * to arithmetic: the model must not contradict these facts.
 */

interface Frac {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);

function simplify({ n, d }: Frac): Frac {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

const key = (f: Frac): string => {
  const s = simplify(f);
  return `${s.n}/${s.d}`;
};

/** Extracts `a/b` fractions from text (positive integers, non-zero denominator). */
export function parseFractions(text: string): Frac[] {
  const out: Frac[] = [];
  for (const m of text.matchAll(/(\d{1,4})\s*\/\s*(\d{1,4})/g)) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    if (Number.isFinite(n) && Number.isFinite(d) && d > 0) out.push({ n, d });
  }
  return out;
}

/** Gathers distinct fractions across the conversation (dedup by simplified value,
 * keeping earliest display form), capped to keep the note short. */
function gather(texts: string[], cap = 3): Frac[] {
  const seen = new Set<string>();
  const result: Frac[] = [];
  for (const text of texts) {
    for (const f of parseFractions(text)) {
      const k = key(f);
      if (!seen.has(k)) {
        seen.add(k);
        result.push(f);
        if (result.length >= cap) return result;
      }
    }
  }
  return result;
}

function benchmark(f: Frac): string {
  const v = f.n / f.d;
  if (v < 0.5) return "less than 1/2";
  if (v > 0.5) return "greater than 1/2";
  return "equal to 1/2";
}

/**
 * Builds the verified teacher note for whatever fractions appear in `texts`
 * (earliest first). Returns null when there's nothing numeric to ground.
 */
export function buildFractionFacts(texts: string[], pairCap = 3): string | null {
  const fracs = gather(texts);
  if (fracs.length === 0) return null;

  const lines: string[] = [];
  lines.push(`Fractions in play: ${fracs.map((f) => `${f.n}/${f.d}`).join(", ")}`);

  for (const f of fracs) {
    const s = simplify(f);
    const simplified =
      s.n !== f.n || s.d !== f.d ? ` (simplifies to ${s.n}/${s.d})` : "";
    lines.push(
      `${f.n}/${f.d} = ${(f.n / f.d).toFixed(3)}${simplified}; ${benchmark(f)}`,
    );
  }

  let pairs = 0;
  for (let i = 0; i < fracs.length && pairs < pairCap; i++) {
    for (let j = i + 1; j < fracs.length && pairs < pairCap; j++) {
      const a = fracs[i]!;
      const b = fracs[j]!;
      const L = lcm(a.d, b.d);
      const ae = a.n * (L / a.d);
      const be = b.n * (L / b.d);
      const rel = ae > be ? ">" : ae < be ? "<" : "=";
      lines.push(
        `For ${a.n}/${a.d} and ${b.n}/${b.d}: smallest common denominator is ${L} ` +
          `(also ${2 * L}, ${3 * L}); rewritten as ${ae}/${L} and ${be}/${L}; ` +
          `so ${a.n}/${a.d} ${rel} ${b.n}/${b.d}.`,
      );
      pairs++;
    }
  }

  return lines.join("\n");
}
