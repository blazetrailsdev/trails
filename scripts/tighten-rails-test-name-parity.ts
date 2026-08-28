/**
 * Only-shrink tightener for the `blazetrails/rails-test-name-parity` ratchet.
 *
 * Lints every enrolled test file with the rule in `reportAll` mode, counts the
 * TS-only tests per file, and writes each file's mark DOWN to that count.
 * A mark is never raised: a file that gained an extra keeps its old mark and
 * stays red, which is the whole point of the gate.
 *
 *   pnpm parity:test:names:tighten
 *
 * There is no reseed. Seeding a brand-new enrollment is this same command run
 * against marks that do not exist yet (an absent mark reads as 0, so the first
 * run has to be `--seed`, which is the one mode allowed to write a mark up).
 */
import { ESLint } from "eslint";
import * as path from "path";
import { fileURLToPath } from "url";
import { writeJsonManifest } from "@blazetrails/parity/write-json-manifest";
import rule, {
  MARK_PATH,
  isManifestAvailable,
  repoRel,
} from "../eslint/rails-test-name-parity.mjs";
import { readFile } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Kept in sync with the rule's enrollment block in eslint.config.mjs.
const ENROLLED = ["packages/arel/src/**/*.test.ts", "packages/date/src/**/*.test.ts"];

async function currentMarks(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(MARK_PATH, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

async function main(args: string[]) {
  const seed = args.includes("--seed");
  if (!isManifestAvailable()) {
    console.error(
      "eslint/rails-test-names.json has no data — run scripts/test-compare/extract-ruby-tests.rb " +
        "then `pnpm tsx scripts/build-rails-test-names-manifest.ts` first.",
    );
    throw new Error("rails-test-names manifest unavailable");
  }

  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    overrideConfig: {
      files: ENROLLED,
      languageOptions: { parser: (await import("typescript-eslint")).parser },
      plugins: {
        blazetrails: {
          rules: { "rails-test-name-parity": rule as NonNullable<ESLint.Plugin["rules"]>[string] },
        },
      },
      rules: {
        "blazetrails/rails-test-name-parity": ["error", { reportAll: true }],
      },
    },
  });

  const counts: Record<string, number> = {};
  for (const result of await eslint.lintFiles(ENROLLED)) {
    const rel = repoRel(result.filePath);
    if (!rel) continue;
    counts[rel] = result.messages.length;
  }

  const marks = await currentMarks();
  const next: Record<string, number> = {};
  for (const rel of [...new Set([...Object.keys(marks), ...Object.keys(counts)])].sort()) {
    const measured = counts[rel] ?? 0;
    const existing = marks[rel];
    const value = existing === undefined ? (seed ? measured : 0) : Math.min(existing, measured);
    if (value > 0) next[rel] = value;
  }

  writeJsonManifest(MARK_PATH, next);
  const total = Object.values(next).reduce((a, b) => a + b, 0);
  console.log(`Wrote ${MARK_PATH} — ${Object.keys(next).length} files, ${total} TS-only tests`);
}

void main(process.argv.slice(2));
