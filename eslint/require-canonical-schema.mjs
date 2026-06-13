/**
 * ESLint rule: require-canonical-schema
 *
 * Every table passed to `defineSchema(...)` in a test must reference the
 * canonical `TEST_SCHEMA` (imported from `test-helpers/test-schema.js`) rather
 * than re-declaring the table inline. Sharing one canonical declaration keeps
 * per-worker tables structurally identical, which avoids the shared-DB shape
 * collisions that plague parallel SQLite/MySQL forks (a sibling file's inline
 * `posts: { body }` vs another's `posts: {}` reflects the wrong shape).
 *
 *   ✗  await defineSchema({ posts: { title: "string" } })
 *   ✗  const SCHEMA = { comments: { post_id: "integer" } };
 *      await defineSchema(SCHEMA);
 *   ✓  await defineSchema(TEST_SCHEMA)
 *   ✓  await defineSchema({ posts: TEST_SCHEMA.posts })
 *   ✓  await defineSchema({ ...TEST_SCHEMA, extra: TEST_SCHEMA.extra })
 *
 * The rule reports per *table*, not per call: only the inline table entries are
 * flagged, so a schema that mixes canonical and inline tables (like
 * `relation/where.test.ts`) reports only the inline ones.
 *
 * A "canonical" table value is one of:
 *   - member access into the canonical schema *for that same table key*:
 *     `posts: TEST_SCHEMA.posts` / `posts: TEST_SCHEMA["posts"]` (or its
 *     aliased local name). A bare `posts: TEST_SCHEMA` or a mismatched
 *     `posts: TEST_SCHEMA.comments` is rejected — both back the key with the
 *     wrong canonical shape, which is exactly the divergence this rule prevents;
 *   - a spread of the whole canonical schema: `...TEST_SCHEMA`;
 *   - the bare canonical identifier passed as the whole argument:
 *     `defineSchema(TEST_SCHEMA)`.
 *
 * Only the import from `test-helpers/test-schema` counts as canonical. A file
 * that declares its own `const TEST_SCHEMA = { ...inline... }` is NOT canonical
 * — those inline tables are exactly the exceptions this rule targets.
 *
 * The schema argument is discriminated against `defineSchema`'s two overloads:
 *   defineSchema(schema, opts?)            → schema is arg 0
 *   defineSchema(adapter, schema, opts?)   → schema is arg 1
 * A trailing `{ dropExisting }` opts object is stripped first.
 *
 * Existing files that pre-date the rule are grandfathered via
 * `eslint/require-canonical-schema-exclude.json` (repo-relative paths) — a
 * ratchet baseline mirroring expected-fixtures / test-fixture-parity. New files
 * are enforced; the list shrinks as porters migrate tests onto the canonical
 * schema.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Env override lets the rule's own unit test point at a tmp baseline rather
// than mutating the committed list.
const EXCLUDE_PATH =
  process.env.REQUIRE_CANONICAL_SCHEMA_EXCLUDE_PATH ??
  path.join(__dirname, "require-canonical-schema-exclude.json");

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

const CANONICAL_SOURCE = /(^|\/)test-helpers\/test-schema(\.js)?$/;

/** `DefineSchemaOpts` currently only has `dropExisting`. */
function isOptsObject(node) {
  return (
    node.type === "ObjectExpression" &&
    node.properties.every(
      (p) =>
        p.type === "Property" &&
        !p.computed &&
        ((p.key.type === "Identifier" && p.key.name === "dropExisting") ||
          (p.key.type === "Literal" && p.key.value === "dropExisting")),
    )
  );
}

/** The argument that holds the schema, accounting for the adapter overload + trailing opts. */
function schemaArgOf(call) {
  let args = call.arguments;
  if (args.length === 0) return null;
  // Strip a trailing opts object, but only when there is something before it
  // (a lone `defineSchema({})` is an empty *schema*, not opts).
  if (args.length >= 2 && isOptsObject(args[args.length - 1])) {
    args = args.slice(0, -1);
  }
  if (args.length === 1) return args[0];
  // (adapter, schema)
  return args[1];
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require tables passed to `defineSchema()` to reference the canonical TEST_SCHEMA rather than re-declaring them inline.",
    },
    schema: [],
    messages: {
      inlineTable:
        "Table `{{table}}` is declared inline in defineSchema(). Reference the canonical schema instead: `{{table}}: TEST_SCHEMA.{{table}}` (import TEST_SCHEMA from test-helpers/test-schema). If this table genuinely cannot be canonical, add `// eslint-disable-next-line blazetrails/require-canonical-schema`.",
      inlineSpread:
        "Spread of a non-canonical schema in defineSchema(). Spread the canonical `...TEST_SCHEMA` instead, or add `// eslint-disable-next-line blazetrails/require-canonical-schema`.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = repoRel(filename);
    // Grandfathered file → no-op (ratchet baseline).
    if (rel && loadExclude().has(rel)) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();
    /** Local names bound to the canonical TEST_SCHEMA import (handles `as` aliases). */
    const canonicalNames = new Set();
    const calls = [];

    function isCanonicalIdentifier(node) {
      return node?.type === "Identifier" && canonicalNames.has(node.name);
    }

    /**
     * Resolve an identifier to the `ObjectExpression` it was `const`-initialised
     * with, via scope analysis (so it works for module-scope, describe-scoped,
     * and `export const` declarations alike, and never crosses scopes by name).
     * Returns null for imports, reassigned vars, and non-object inits.
     */
    function resolveObject(node) {
      let scope = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.variables.find((v) => v.name === node.name);
        if (variable) {
          if (variable.defs.length !== 1) return null;
          const def = variable.defs[0];
          if (def.type === "Variable" && def.node.init?.type === "ObjectExpression") {
            return def.node.init;
          }
          return null;
        }
        scope = scope.upper;
      }
      return null;
    }

    /** Static property name of `obj.foo` / `obj["foo"]`; null for dynamic access. */
    function memberPropName(node) {
      if (node.type !== "MemberExpression") return null;
      if (!node.computed && node.property.type === "Identifier") return node.property.name;
      if (node.computed && node.property.type === "Literal") return String(node.property.value);
      return null;
    }

    /** Literal table key (`posts:` / `"1_need_quoting":`); null for computed/dynamic keys. */
    function tableKey(prop) {
      if (prop.key.type === "Identifier" && !prop.computed) return prop.key.name;
      if (prop.key.type === "Literal") return String(prop.key.value);
      return null;
    }

    /**
     * A per-table value is canonical only when it is member access into the
     * canonical schema for *that same table*: `posts: TEST_SCHEMA.posts` or
     * `posts: TEST_SCHEMA["posts"]`. The bare identifier (`posts: TEST_SCHEMA`)
     * and a mismatched member (`posts: TEST_SCHEMA.comments`) are rejected —
     * both would back the key with the wrong canonical shape.
     */
    function isCanonicalTableValue(value, key) {
      if (value?.type !== "MemberExpression") return false;
      if (!isCanonicalIdentifier(value.object)) return false;
      return key !== null && memberPropName(value) === key;
    }

    function analyzeObject(obj) {
      for (const prop of obj.properties) {
        if (prop.type === "SpreadElement" || prop.type === "ExperimentalSpreadProperty") {
          // Spreading the whole canonical schema (`...TEST_SCHEMA`) is the only
          // canonical spread.
          if (!isCanonicalIdentifier(prop.argument)) {
            context.report({ node: prop, messageId: "inlineSpread" });
          }
          continue;
        }
        if (prop.type !== "Property") continue;
        const key = tableKey(prop);
        if (isCanonicalTableValue(prop.value, key)) continue;
        context.report({
          node: prop,
          messageId: "inlineTable",
          data: { table: key ?? "<table>" },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return;
        if (!CANONICAL_SOURCE.test(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && spec.imported?.name === "TEST_SCHEMA") {
            canonicalNames.add(spec.local.name);
          }
        }
      },

      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "defineSchema") return;
        const arg = schemaArgOf(node);
        if (arg) calls.push(arg);
      },

      // Deferred so every ImportDeclaration is seen before resolving canonical names.
      "Program:exit"() {
        for (const arg of calls) {
          let obj = null;
          if (arg.type === "ObjectExpression") {
            obj = arg;
          } else if (arg.type === "Identifier") {
            // Whole canonical schema passed by name → fully canonical.
            if (canonicalNames.has(arg.name)) continue;
            obj = resolveObject(arg);
          }
          // Unresolvable identifiers (e.g. an imported `*_SCHEMA` const) and
          // non-object args (adapters, member expressions) are left alone.
          if (obj) analyzeObject(obj);
        }
      },
    };
  },
};

export default rule;
