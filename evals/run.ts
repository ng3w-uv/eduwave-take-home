import { judge, loadCases, runCase } from "./runner.js";

/** Human-readable eval report: `npm run eval`. Prints a pass/fail table and
 * exits non-zero if any case fails (also runnable in CI if desired). */
async function main() {
  const cases = loadCases();
  let passed = 0;

  console.log(`\nWavy Tutor — evaluation report (${cases.length} cases)\n`);
  for (const c of cases) {
    const { outcome, providerCalls } = await runCase(c);
    const failures = judge(c, outcome, providerCalls);
    const ok = failures.length === 0;
    if (ok) passed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.id}`);
    if (!ok) for (const f of failures) console.log(`        - ${f}`);
  }

  console.log(`\n${passed}/${cases.length} passed\n`);
  if (passed !== cases.length) process.exitCode = 1;
}

void main();
