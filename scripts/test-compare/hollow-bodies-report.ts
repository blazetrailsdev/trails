/**
 * Sweep every trails test file for hollow bodies, print the report, and FAIL if
 * anything is found. The tree is clean as of this script landing, so this is a
 * zero-tolerance gate, not a ratchet with a baseline: a new hollow body is a new
 * false-negative in the parity signal, and the fix is always to write the body.
 * See scripts/test-compare/hollow-bodies.ts for the classification rules.
 *
 *   pnpm test:hollow
 */
import * as path from "path";
import * as fs from "fs/promises";
import { globSync } from "tinyglobby";
import { extractTestsFromSource } from "./extract-ts-core.js";
import type { TestCaseInfo } from "./types.js";
import { findHollowTests, formatReport } from "./hollow-bodies.js";

const ROOT_DIR = path.resolve(__dirname, "../..");

async function main(): Promise<void> {
  const files = globSync("packages/*/src/**/*.test.ts", { cwd: ROOT_DIR }).sort();
  const testCases: TestCaseInfo[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(ROOT_DIR, file), "utf-8");
    testCases.push(...extractTestsFromSource(content, file).testCases);
  }
  const findings = findHollowTests(testCases);
  console.log(formatReport(findings, testCases.length));
  if (findings.length > 0) {
    console.error(
      "\n::error::Hollow test bodies found — the test name promises a behaviour the body " +
        "never exercises, so it passes against a broken implementation. Write the body " +
        "against the vendored Rails original; NEVER rename the test to match the body.",
    );
    throw new Error(`${findings.length} hollow test bodies`);
  }
}

void main();
