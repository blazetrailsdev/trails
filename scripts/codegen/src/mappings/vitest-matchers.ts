/**
 * The matchers `@blazetrails/vitest-matchers` adds to vitest's `expect`, read
 * from its `RubyMatchers` interface (packages/vitest-matchers/src/index.ts) so
 * the list cannot drift: a generated test that calls one imports the
 * package's types.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../gem.js";

const src = readFileSync(path.join(ROOT, "packages/vitest-matchers/src/index.ts"), "utf8");
const body = /export interface RubyMatchers<[^>]*> \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";

export const VITEST_MATCHERS: readonly string[] = [...body.matchAll(/^\s+(to\w+)\(/gm)].map(
  (m) => m[1],
);
