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

function benchmark(f: Frac): string {
  const v = f.n / f.d;
  if (v < 0.5) return "less than 1/2";
  if (v > 0.5) return "greater than 1/2";
  return "equal to 1/2";
}

function hasFrac(list: Frac[], f: Frac): boolean {
  return list.some((x) => key(x) === key(f));
}

/**
 * Selects the fractions the current turn is actually about: those in the latest
 * student message, topped up (if fewer than two) from the most-recent prior
 * turns. This keeps the notes focused on the active comparison instead of
 * dragging in stale fractions from earlier in the conversation.
 */
export function buildFractionFactsForTurn(
  currentMessage: string,
  priorTextsRecentFirst: string[],
): string | null {
  const picks: Frac[] = [];
  for (const f of parseFractions(currentMessage)) {
    if (!hasFrac(picks, f)) picks.push(f);
  }
  if (picks.length < 2) {
    for (const text of priorTextsRecentFirst) {
      for (const f of parseFractions(text)) {
        if (!hasFrac(picks, f)) picks.push(f);
        if (picks.length >= 2) break;
      }
      if (picks.length >= 2) break;
    }
  }
  return factsFor(picks.slice(0, 3));
}

function factsFor(fracs: Frac[], pairCap = 3): string | null {
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
      const af = `${a.n}/${a.d}`;
      const bf = `${b.n}/${b.d}`;

      // State the winner in plain language so the model never has to derive it.
      const verdict =
        ae === be
          ? `${af} and ${bf} are equal`
          : `the greater fraction is ${ae > be ? af : bf}`;
      const cmp =
        ae > be
          ? `${af} > ${bf} (equivalently ${bf} < ${af})`
          : ae < be
            ? `${bf} > ${af} (equivalently ${af} < ${bf})`
            : `${af} = ${bf}`;

      lines.push(
        `For ${af} and ${bf}: ${verdict}. Smallest common denominator is ${L}; ` +
          `rewritten, ${af} = ${ae}/${L} and ${bf} = ${be}/${L}; so ${cmp}.`,
      );
      pairs++;
    }
  }

  return lines.join("\n");
}
