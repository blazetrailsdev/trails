/**
 * ESLint rule: require-table-teardown
 *
 * Every `createTable("foo", …)` in an activerecord test must be balanced by a
 * `dropTable("foo")` somewhere in the same file. Tests that create a table but
 * never drop it leak that table into the shared per-worker database, where a
 * sibling file's differently-shaped `foo` collides under parallel forks — the
 * exact class of flake catalogued in the project's shared-DB memory notes.
 *
 *   ✗  beforeAll(async () => { await ctx.createTable("widgets", t => …); });
 *      // …no dropTable("widgets") anywhere in the file
 *
 *   ✓  beforeAll(async () => { await ctx.createTable("widgets", t => …); });
 *      afterAll(async () => { await ctx.dropTable("widgets"); });
 *
 *   ✓  it("…", async () => {
 *        await adapter.createTable("widgets", t => …);
 *        await adapter.dropTable("widgets");
 *      });
 *
 * Matching is **per table name**, and **receiver-agnostic**: the create and the
 * drop may sit on different receivers (`ctx.createTable` paired with
 * `this.dropTable`) and in different hooks (`beforeEach`/`beforeAll`/in-test
 * create paired with `afterEach`/`afterAll`/in-test drop). The rule only checks
 * that for each created table name a matching drop exists in the file — not that
 * the lifecycle is symmetric, since legitimate patterns mix hooks freely.
 *
 * Only `createTable`/`dropTable` calls whose **first argument is a string
 * literal** participate. A `createTable(tableName, …)` with a computed name
 * can't be matched statically and is skipped (neither flagged nor counted as
 * cleanup for a literal-named create). The receiver is ignored, so this catches
 * `defineSchema`-free raw DDL regardless of whether it runs on `ctx`, `adapter`,
 * `this`, `conn`, a SchemaMigration, etc.
 *
 * Escape hatch — a file that calls `dropAllTables(…)` (the canonical
 * rebuild/teardown pattern used by locking.test.ts / dirty.test.ts) is treated
 * as cleaning up *every* table, so its literal-named creates are all satisfied.
 *
 * Existing files that pre-date the rule are grandfathered via
 * `eslint/require-table-teardown-exclude.json` (repo-relative paths) — a ratchet
 * baseline mirroring require-canonical-schema / expected-fixtures. New files are
 * enforced; the list shrinks as tests gain their missing teardown.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Env override lets the rule's own unit test point at a tmp baseline rather
// than mutating the committed list.
const EXCLUDE_PATH =
  process.env.REQUIRE_TABLE_TEARDOWN_EXCLUDE_PATH ??
  path.join(__dirname, "require-table-teardown-exclude.json");

// Cache by mtime so a single eslint invocation reads the file at most once
// while tests can swap baselines on disk between runs.
let excludeCache = null;
function loadExclude() {
  if (!fs.existsSync(EXCLUDE_PATH)) return new Set();
  const mtime = fs.statSync(EXCLUDE_PATH).mtimeMs;
  if (excludeCache && excludeCache.mtime === mtime) return excludeCache.value;
  const value = new Set(JSON.parse(fs.readFileSync(EXCLUDE_PATH, "utf8")));
  excludeCache = { mtime, value };
  return value;
}

/** Repo-relative path for exclude-list lookup; accepts absolute or relative. */
function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/activerecord\/src\/.+\.test\.ts)$/);
  return m ? m[1] : null;
}

/** Static method name of `recv.foo(...)`; null for dynamic/computed callees. */
function calleeMethodName(callee) {
  if (callee.type !== "MemberExpression") return null;
  if (callee.computed || callee.property.type !== "Identifier") return null;
  return callee.property.name;
}

/** First-arg string-literal table name, or null when it isn't a plain string. */
function literalTableArg(call) {
  const arg = call.arguments[0];
  if (arg && arg.type === "Literal" && typeof arg.value === "string") {
    return arg.value;
  }
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require each createTable(\"name\") in an activerecord test to be balanced by a dropTable(\"name\") (or a dropAllTables) in the same file.",
    },
    schema: [],
    messages: {
      missingTeardown:
        "Table `{{table}}` is created with createTable() but never torn down. Add a matching `dropTable(\"{{table}}\")` (in afterEach/afterAll or the test body), or `dropAllTables(adapter)` in teardown. Leaked tables collide with sibling files under parallel forks. If this is intentional, add `// eslint-disable-next-line blazetrails/require-table-teardown`.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = repoRel(filename);
    // Grandfathered file → no-op (ratchet baseline).
    if (rel && loadExclude().has(rel)) return {};

    // table name → first create node seen (for the report location).
    const created = new Map();
    const dropped = new Set();
    let dropsAll = false;

    return {
      CallExpression(node) {
        // dropAllTables(...) — receiver-agnostic, satisfies every table.
        const direct =
          node.callee.type === "Identifier" ? node.callee.name : calleeMethodName(node.callee);
        if (direct === "dropAllTables") {
          dropsAll = true;
          return;
        }

        const method = calleeMethodName(node.callee);
        if (method === "createTable") {
          const name = literalTableArg(node);
          if (name !== null && !created.has(name)) created.set(name, node);
        } else if (method === "dropTable") {
          const name = literalTableArg(node);
          if (name !== null) dropped.add(name);
        }
      },

      // Deferred so creates and drops in any order across the file are matched.
      "Program:exit"() {
        if (dropsAll) return;
        for (const [name, node] of created) {
          if (dropped.has(name)) continue;
          context.report({
            node,
            messageId: "missingTeardown",
            data: { table: name },
          });
        }
      },
    };
  },
};

export default rule;
