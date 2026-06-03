#!/usr/bin/env npx tsx
/**
 * Generate (or verify) the agent-facing Ruby→TypeScript conventions doc from
 * the live tables in conventions.ts — so the doc can never drift from the
 * rules api:compare actually applies.
 *
 * Usage:
 *   pnpm api:conventions            # write the doc
 *   pnpm api:conventions --check    # exit 1 if the doc is out of date (CI)
 *
 * The rendered Markdown is run through Prettier (with the repo config) before
 * writing and before comparing, so the committed file is byte-identical to a
 * `prettier --write` and the repo-wide `prettier --check .` stays green.
 */

import * as fs from "fs";
import * as path from "path";
import * as prettier from "prettier";
import { ROOT_DIR } from "./config.js";
import { explainConventions } from "./conventions.js";

const DOC_PATH = path.join(ROOT_DIR, "docs", "ruby-ts-conventions.md");

async function render(): Promise<string> {
  const config = await prettier.resolveConfig(DOC_PATH);
  return prettier.format(explainConventions(), { ...config, parser: "markdown" });
}

async function main(): Promise<void> {
  const check = process.argv.slice(2).includes("--check");
  const expected = await render();
  const rel = path.relative(ROOT_DIR, DOC_PATH);

  if (check) {
    const actual = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, "utf-8") : "";
    if (actual !== expected) {
      console.error(`${rel} is out of date.\nRun \`pnpm api:conventions\` and commit the result.`);
      process.exit(1);
    }
    console.log(`${rel} is up to date.`);
    return;
  }

  fs.writeFileSync(DOC_PATH, expected);
  console.log(`Wrote ${rel}`);
}

main();
