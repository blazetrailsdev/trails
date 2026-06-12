/**
 * ESLint rule: no-raw-sql
 *
 * CONTRIBUTING.md mandates that queries are built with `@blazetrails/arel`,
 * never assembled as raw SQL strings. RFC 0022 exists because string-built SQL
 * crept in anyway. This rule turns that prose into an enforced check.
 *
 * Two report patterns, both high-precision (anchored keyword + a restricted set
 * of execution sinks / receivers) so incidental SQL-looking text doesn't drown
 * the report:
 *   - noRawSql: a string/template literal starting with a SQL verb, passed to a
 *     call whose callee property is an execution sink (execute, query, …).
 *       ✗ connection.execute("SELECT …")   ✓ throw new Error("SELECT failed")
 *   - noSqlSurgery: `.replace(`/`.concat(` on a variable named `sql` (RFC-0022).
 *
 * Scope (also set in eslint.config.mjs; re-checked here so the rule is testable
 * by filename): activerecord src .ts, excluding test files, connection-adapters,
 * adapters, tasks, and schema-*.ts — those legitimately render SQL.
 *
 * Existing violators are grandfathered via `eslint/no-raw-sql-exclude.json`
 * (repo-relative paths) — a ratchet baseline; the list is the RFC-0022 burndown
 * worklist and shrinks as call sites migrate to arel.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Env override lets the rule's own unit test point at a tmp baseline rather
// than mutating the committed list. Resolved lazily (per call, not at module
// load) so a test that sets the env var after importing the rule still wins.
function excludePath() {
  return process.env.NO_RAW_SQL_EXCLUDE_PATH ?? path.join(__dirname, "no-raw-sql-exclude.json");
}

// Cache by path+mtime so a single eslint run reads the baseline at most once.
let excludeCache = null;
function loadExclude() {
  const p = excludePath();
  if (!fs.existsSync(p)) return new Set();
  const mtime = fs.statSync(p).mtimeMs;
  if (excludeCache && excludeCache.path === p && excludeCache.mtime === mtime) {
    return excludeCache.value;
  }
  const value = new Set(JSON.parse(fs.readFileSync(p, "utf8")));
  excludeCache = { path: p, mtime, value };
  return value;
}

/** Repo-relative path under packages/activerecord/src; null if outside it. */
function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/activerecord\/src\/.+\.ts)$/);
  return m ? m[1] : null;
}

/** Directories / file patterns that legitimately render SQL → out of scope. */
function isExcludedPath(rel) {
  if (rel.endsWith(".test.ts")) return true;
  if (/(^|\/)connection-adapters\//.test(rel)) return true;
  if (/(^|\/)adapters\//.test(rel)) return true;
  if (/(^|\/)tasks\//.test(rel)) return true;
  if (/(^|\/)schema-[^/]*\.ts$/.test(rel)) return true;
  return false;
}

const SQL_RE = /^\s*(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i;

const SINKS = new Set([
  "execute",
  "query",
  "execQuery",
  "execUpdate",
  "execDelete",
  "selectAll",
  "selectOne",
  "selectValue",
  "selectValues",
  "exec",
]);

/** Static property name of `obj.foo` / `obj["foo"]`; null for dynamic access. */
function calleePropName(callee) {
  if (callee.type !== "MemberExpression") return null;
  if (!callee.computed && callee.property.type === "Identifier") return callee.property.name;
  if (callee.computed && callee.property.type === "Literal") return String(callee.property.value);
  return null;
}

/** The leading text of a string or template literal argument; null otherwise. */
function leadingText(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") {
    // Match against the first quasi only — that's where a SQL verb anchors,
    // regardless of any later interpolation.
    return node.quasis[0]?.value?.cooked ?? "";
  }
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw SQL strings in activerecord src outside the adapter/DDL layer; build queries with @blazetrails/arel.",
    },
    schema: [],
    messages: {
      noRawSql:
        "Raw SQL string passed to `{{sink}}()`. Build the query with @blazetrails/arel instead of assembling SQL text. If this call site genuinely must take raw SQL, add `// eslint-disable-next-line blazetrails/no-raw-sql`.",
      noSqlSurgery:
        "String surgery on a `sql` variable (`.{{method}}(`) — the RFC-0022 anti-pattern. Construct the query with @blazetrails/arel rather than rewriting SQL text. If unavoidable, add `// eslint-disable-next-line blazetrails/no-raw-sql`.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = repoRel(filename);
    // Outside activerecord src, out-of-scope dir, or grandfathered → no-op.
    if (!rel || isExcludedPath(rel) || loadExclude().has(rel)) return {};

    return {
      CallExpression(node) {
        const prop = calleePropName(node.callee);
        if (prop === null) return;

        // noSqlSurgery: sql.replace(...) / sql.concat(...)
        if (
          (prop === "replace" || prop === "concat") &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "sql"
        ) {
          context.report({ node, messageId: "noSqlSurgery", data: { method: prop } });
          return;
        }

        // noRawSql: sink(...) with a SQL-looking string/template argument.
        if (!SINKS.has(prop)) return;
        for (const arg of node.arguments) {
          const text = leadingText(arg);
          if (text !== null && SQL_RE.test(text)) {
            context.report({ node: arg, messageId: "noRawSql", data: { sink: prop } });
          }
        }
      },
    };
  },
};

export default rule;
