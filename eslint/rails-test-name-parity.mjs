/**
 * ESLint rule: rails-test-name-parity
 *
 * In a `*.test.ts` whose Rails counterpart exists in the test-compare
 * manifest, every non-skipped `it()` / `test()` must carry the name of a Rails
 * test in that counterpart, under the same normalization `pnpm parity:test`
 * applies (lowercase, whitespace-collapsed, `erb` → `tse`). A TS-only test in
 * a Rails-named file is what the comparer reports as "extra (TS only)"; its
 * home is the file's `.trails.test.ts` twin, which this rule exempts.
 *
 * Ships as an only-shrink PER-FILE ratchet: `eslint/rails-test-name-parity-mark.json`
 * records how many extras each enrolled file still carries, so the gate is
 * green on the day it lands and red on the next one added. Marks are written
 * DOWN by `pnpm parity:test:names:tighten` and never up — there is no reseed,
 * for the same reason the call baselines forbid one.
 *
 * Manifest: eslint/rails-test-names.json (gitignored, built by
 * `pnpm tsx scripts/build-rails-test-names-manifest.ts` after the Ruby test
 * extraction). Without it the rule would pass every file, so
 * `eslint.config.mjs` leaves the rule unregistered and says so — the same
 * contract as rails-file-structure-method-order.
 */
// fs/path bare per convention; sync fs acceptable — small manifest, lint hot path.
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH =
  process.env.RAILS_TEST_NAMES_PATH ?? path.resolve(__dirname, "rails-test-names.json");
export const MARK_PATH =
  process.env.RAILS_TEST_NAME_PARITY_MARK_PATH ??
  path.resolve(__dirname, "rails-test-name-parity-mark.json");

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  const mtime = fs.statSync(p).mtimeMs;
  const cache = loadJson._cache ?? (loadJson._cache = new Map());
  const hit = cache.get(p);
  if (hit && hit.mtime === mtime) return hit.value;
  const value = JSON.parse(fs.readFileSync(p, "utf8"));
  cache.set(p, { mtime, value });
  return value;
}

/** True when the manifest on disk carries real Rails test names. */
export function isManifestAvailable() {
  return Object.keys(loadJson(MANIFEST_PATH, {})).length > 0;
}

/** Repo-relative POSIX path of a package test file; null when out of scope. */
export function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/[^/]+\/src\/.+\.test\.ts)$/);
  return m ? m[1] : null;
}

/** Mirrors compare.ts `normalize` + `normalizeErb`. */
export function normalizeTestName(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim().replace(/erb/g, "tse");
}

/** `visitors/to-sql.test.ts` → `visitors/to-sql.trails.test.ts`. */
function trailsTwin(rel) {
  return rel.replace(/\.test\.ts$/, ".trails.test.ts");
}

function rootCalleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") return rootCalleeName(callee.object);
  if (callee?.type === "CallExpression") return rootCalleeName(callee.callee);
  return null;
}

// Modifiers that mark a test/describe as skipped — exempt, as in parity:test.
const SKIP_MODIFIERS = new Set(["skip", "skipIf", "todo", "fails"]);

function calleeModifierNames(callee, out = []) {
  if (callee?.type === "MemberExpression") {
    if (callee.property?.type === "Identifier") out.push(callee.property.name);
    calleeModifierNames(callee.object, out);
  } else if (callee?.type === "CallExpression") {
    calleeModifierNames(callee.callee, out);
  }
  return out;
}

function hasSkipModifier(callee) {
  return calleeModifierNames(callee).some((m) => SKIP_MODIFIERS.has(m));
}

/** True when `node` is lexically inside a skipped `describe` at any depth. */
function isInSkippedDescribe(node) {
  let cur = node.parent;
  while (cur) {
    if (
      cur.type === "CallExpression" &&
      rootCalleeName(cur.callee) === "describe" &&
      hasSkipModifier(cur.callee)
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/** The literal description of an `it()` / `test()` call, or null. */
function descriptionOf(node) {
  const first = node.arguments[0];
  if (first?.type === "Literal" && typeof first.value === "string") return first.value;
  if (first?.type === "TemplateLiteral" && first.expressions.length === 0) {
    return first.quasis.map((q) => q.value.cooked).join("");
  }
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every non-skipped test in a Rails-named test file must carry the name of a Rails test in its counterpart; TS-only tests belong in the file's .trails.test.ts twin.",
    },
    schema: [
      {
        type: "object",
        properties: { reportAll: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      extra: 'TS-only test "{{desc}}" has no Rails counterpart in this file. Move it to {{twin}}.',
      overMark:
        "{{count}} TS-only tests in this file, over its mark of {{mark}} ({{names}}). Move the new one(s) to {{twin}}; the mark only shrinks.",
    },
  },
  create(context) {
    const rel = repoRel(context.filename ?? context.getFilename?.() ?? "");
    if (!rel || rel.endsWith(".trails.test.ts")) return {};

    const railsNames = loadJson(MANIFEST_PATH, {})[rel];
    if (!railsNames) return {};
    const known = new Set(railsNames);

    const reportAll = context.options[0]?.reportAll === true;
    const mark = loadJson(MARK_PATH, {})[rel] ?? 0;
    const twin = trailsTwin(rel);
    const extras = [];

    return {
      CallExpression(node) {
        const name = rootCalleeName(node.callee);
        if (name !== "it" && name !== "test") return;
        if (hasSkipModifier(node.callee) || isInSkippedDescribe(node)) return;
        const desc = descriptionOf(node);
        if (desc === null) return;
        if (known.has(normalizeTestName(desc))) return;
        extras.push({ node, desc });
      },
      "Program:exit"() {
        if (reportAll) {
          for (const { node, desc } of extras) {
            context.report({ node, messageId: "extra", data: { desc, twin } });
          }
          return;
        }
        if (extras.length <= mark) return;
        context.report({
          loc: { line: 1, column: 0 },
          messageId: "overMark",
          data: {
            count: extras.length,
            mark,
            twin,
            names: extras.map((e) => `"${e.desc}"`).join(", "),
          },
        });
      },
    };
  },
};

export default rule;
