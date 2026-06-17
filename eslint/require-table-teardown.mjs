/**
 * ESLint rule: require-table-teardown
 *
 * Every `createTable("foo", …)` in an activerecord test must be balanced by an
 * explicit `dropTable("foo")` somewhere in the same file. Tests that create a
 * table but never drop it leak that table into the shared per-worker database,
 * where a sibling file's differently-shaped `foo` collides under parallel forks
 * — the exact class of flake catalogued in the project's shared-DB memory notes.
 *
 * `dropAllTables()` is NOT accepted as that teardown — it is itself flagged
 * (`noDropAllTables`). The carpet bomb wipes every table, including ones other
 * code seeded, and obscures which tables a given file actually owns. A file
 * should drop exactly the tables it created, by name.
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
 * Only **statically-known** table names participate: a plain string literal
 * (`"foo"`) or a template literal with no substitutions (`` `foo` ``). A name
 * built with an interpolation (`` `${schema}.foo` ``) or held in a variable
 * can't be matched statically and is skipped — neither flagged as a create nor
 * counted as cleanup for a literal-named create. `dropTable` accepts several
 * names at once (`dropTable("a", "b")`); every static name it lists counts as
 * dropped. The call is matched by name whether it's bare (`createTable(...)`,
 * e.g. an imported test helper) or invoked on a receiver (`ctx.createTable(...)`,
 * `adapter.`, `this.`, `conn.`, a SchemaMigration, …) — only a dynamic/computed
 * callee (`recv[fn](...)`) is invisible.
 *
 * Teardown that iterates a statically-known list of table names also counts.
 * `for (const t of TABLES) await conn.dropTable(t)` and
 * `TABLES.forEach(t => conn.dropTable(t))` / `.map(...)` / `.flatMap(...)` are
 * recognized when the iterated value resolves statically — either an inline
 * array of literal names (`["a", "b"].forEach(...)`, optionally `as const`) or a
 * `const TABLES = [...]` of literal names in the same file. Every static name
 * in that list counts as dropped. A loop whose iterable can't be resolved
 * statically (an imported
 * const, a name built at runtime) still drops nothing, exactly as before.
 *
 * `createTable("foo", { force: true })` is NOT exempt: `force` drops-then-recreates
 * on the *next* run, but the table still sits in the shared DB after this test
 * finishes, where a concurrent sibling fork can collide with it. The leak the
 * rule guards against is the table outliving the test, which `force` doesn't fix.
 *
 * The `test-helpers/**` infra tests are exempt (configured in eslint.config.mjs)
 * — they exercise createTable/dropTable/dropAllTables as the subject under test.
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

/**
 * The called function's name, whether it's a bare call (`createTable(...)`) or
 * a method call (`recv.createTable(...)`). Receiver-agnostic by design — the
 * rule cares about the operation, not what it's invoked on. Returns null for
 * dynamic/computed callees (`recv[fn](...)`).
 */
function calledName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type !== "MemberExpression") return null;
  if (callee.computed || callee.property.type !== "Identifier") return null;
  return callee.property.name;
}

/**
 * The static string value of a node, or null when it isn't statically known.
 * Plain string literals (`"foo"`) and template literals with no substitutions
 * (`` `foo` ``) both qualify; a template with an interpolation (`` `${s}.foo` ``)
 * does not — its table name can't be matched statically, so it's skipped.
 */
function staticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** The created table name (createTable's first arg), or null if not static. */
function createdTableName(call) {
  return staticString(call.arguments[0]);
}

/**
 * Every statically-known table name a dropTable() call removes. dropTable
 * accepts multiple table names (`dropTable("a", "b")`); the trailing options
 * object is an ObjectExpression and yields no string, so it's skipped naturally.
 */
function droppedTableNames(call) {
  return call.arguments.map(staticString).filter((n) => n !== null);
}

/**
 * Strips TypeScript-only wrappers that don't change the runtime value —
 * `[…] as const`, `[…] satisfies T`, `[…]!`, `(…)` — so the array beneath a
 * type assertion is still resolvable.
 */
function unwrap(node) {
  let n = node;
  while (
    n &&
    (n.type === "TSAsExpression" ||
      n.type === "TSSatisfiesExpression" ||
      n.type === "TSNonNullExpression" ||
      n.type === "TSTypeAssertion")
  ) {
    n = n.expression;
  }
  return n;
}

/**
 * Every statically-known string in an array-valued node, or null when the node
 * isn't a resolvable array. An inline `["a", "b"]` (optionally `as const`)
 * resolves directly; a bare `TABLES` identifier resolves through `arrayConsts`
 * (file-local `const TABLES = [...]`). Non-static elements are dropped silently
 * — a partial list still credits the literal names it does contain.
 */
function arrayStrings(node, arrayConsts) {
  const n = unwrap(node);
  if (!n) return null;
  if (n.type === "ArrayExpression") {
    return n.elements.map(staticString).filter((s) => s !== null);
  }
  if (n.type === "Identifier") return arrayConsts.get(n.name) ?? null;
  return null;
}

/** The single declared loop variable name of a `for…of`, or null. */
function forOfVarName(node) {
  const left = node.left;
  if (left.type !== "VariableDeclaration" || left.declarations.length !== 1) return null;
  const id = left.declarations[0].id;
  return id.type === "Identifier" ? id.name : null;
}

/**
 * Walking up from a `dropTable(arg)` call whose argument is the identifier
 * `argName`, the statically-known table names of the enclosing iteration that
 * binds `argName` — a `for…of` over a resolvable array, or a
 * `forEach`/`map`/`flatMap` callback whose first param is `argName`. Returns
 * null when no such iteration is found or its iterable isn't static.
 */
function iterationStrings(callNode, argName, arrayConsts) {
  for (let n = callNode.parent; n; n = n.parent) {
    if (n.type === "ForOfStatement" && forOfVarName(n) === argName) {
      return arrayStrings(n.right, arrayConsts);
    }
    if (
      (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") &&
      n.params.length >= 1 &&
      n.params[0].type === "Identifier" &&
      n.params[0].name === argName &&
      n.parent?.type === "CallExpression" &&
      n.parent.callee.type === "MemberExpression" &&
      !n.parent.callee.computed &&
      n.parent.callee.property.type === "Identifier" &&
      ["forEach", "map", "flatMap"].includes(n.parent.callee.property.name)
    ) {
      return arrayStrings(n.parent.callee.object, arrayConsts);
    }
  }
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Require each createTable("name") in an activerecord test to be torn down by an explicit dropTable("name") in the same file, and forbid the carpet-bomb dropAllTables().',
    },
    schema: [],
    messages: {
      missingTeardown:
        'Table `{{table}}` is created with createTable() but never torn down. Add a matching `dropTable("{{table}}")` (in afterEach/afterAll or the test body). Leaked tables collide with sibling files under parallel forks. If this is intentional, add `// eslint-disable-next-line blazetrails/require-table-teardown`.',
      noDropAllTables:
        'Avoid `dropAllTables()` — drop the specific tables this file created with `dropTable("…")` instead. The carpet-bomb teardown also wipes tables other code seeded, and hides which tables a test actually owns. If this is genuinely necessary, add `// eslint-disable-next-line blazetrails/require-table-teardown`.',
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
    // File-local `const X = [...]` arrays of literal names, for loop teardown.
    const arrayConsts = new Map();
    // dropTable(arg) calls whose argument is an identifier (a loop variable):
    // resolved against arrayConsts at Program:exit, once all consts are known.
    const dynamicDrops = [];

    return {
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && unwrap(node.init)?.type === "ArrayExpression") {
          arrayConsts.set(node.id.name, arrayStrings(node.init, arrayConsts));
        }
      },

      CallExpression(node) {
        // All three operations are matched identically whether invoked bare
        // (`createTable(...)`) or on a receiver (`ctx.createTable(...)`).
        const name = calledName(node.callee);
        if (name === "dropAllTables") {
          // The carpet bomb is itself a violation — require explicit drops.
          context.report({ node, messageId: "noDropAllTables" });
        } else if (name === "createTable") {
          const table = createdTableName(node);
          if (table !== null && !created.has(table)) created.set(table, node);
        } else if (name === "dropTable") {
          for (const table of droppedTableNames(node)) dropped.add(table);
          // Identifier args may be loop variables iterating a name array;
          // defer resolution until every const declaration has been seen.
          for (const arg of node.arguments) {
            if (arg.type === "Identifier") dynamicDrops.push({ node, argName: arg.name });
          }
        }
      },

      // Deferred so creates and drops in any order across the file are matched.
      "Program:exit"() {
        for (const { node, argName } of dynamicDrops) {
          const names = iterationStrings(node, argName, arrayConsts);
          if (names) for (const table of names) dropped.add(table);
        }

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
