/**
 * ESLint rule: rails-arel-tosql. Enforces Arel fidelity for SQL generation —
 * a class may define a `toSql` / `toSqlAndBinds` method ONLY if its Rails
 * counterpart class actually defines `to_sql` / `to_sql_and_binds`.
 *
 * Intent: SQL must be built through real Arel AST nodes + visitors, not by
 * hand-mashing strings. A bespoke `toSql` on a TS class whose Rails
 * counterpart has no `to_sql` is a strong signal of string-concatenation SQL
 * that should instead route through Arel — this rule catches that drift.
 *
 * Scoped (via eslint.config.mjs) to
 * `packages/{activerecord,activemodel,arel}/src/**\/*.ts` excluding
 * `*.test.ts`. The allow-set is DRIVEN BY THE RAILS API MANIFEST
 * (api-compare output), not a hand-maintained list — Arel itself legitimately
 * defines `toSql`, so it must come from the manifest. Getter / regular method
 * / static all count.
 *
 * Pre-existing violators are grandfathered via the ratchet baseline
 * `eslint/rails-arel-tosql-exclude.json` (it only shrinks). Snapshot:
 *   pnpm tsx scripts/build-rails-tosql-manifest.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The TS method names this rule gates on.
const TOSQL_METHODS = new Set(["toSql", "toSqlAndBinds"]);

// Resolved lazily so the rule's own unit test can point at tmp fixtures via
// env vars without import-time ordering games.
const manifestPath = () =>
  process.env.RAILS_TOSQL_CLASSES_PATH ?? path.join(__dirname, "rails-tosql-classes.json");
const excludePath = () =>
  process.env.RAILS_AREL_TOSQL_EXCLUDE_PATH ??
  path.join(__dirname, "rails-arel-tosql-exclude.json");

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

/**
 * Allow-map keyed by package: pkg → (TS class name → Set of method names that
 * class's Rails counterpart actually defines). Scoping by package keeps the
 * lookup faithful — a bespoke `Node.toSql` in `activerecord` must NOT be
 * waved through by `Arel::Nodes::Node` living in the `arel` package. The
 * per-method granularity keeps `toSqlAndBinds` gated to the one Rails class
 * that defines it. Matching is by class name (not file) so a subclass that
 * overrides an allowed method in a sibling file still passes.
 */
function loadAllow() {
  const manifest = loadJson(manifestPath(), { packages: {} });
  const cacheKey = manifest;
  const cache = loadAllow._cache ?? (loadAllow._cache = new WeakMap());
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const allow = new Map();
  for (const [pkg, entries] of Object.entries(manifest.packages ?? {})) {
    const byName = new Map();
    for (const entry of entries) {
      const set = byName.get(entry.name) ?? new Set();
      for (const m of entry.methods ?? []) set.add(m);
      byName.set(entry.name, set);
    }
    allow.set(pkg, byName);
  }
  cache.set(cacheKey, allow);
  return allow;
}

function loadExclude() {
  return new Set(loadJson(excludePath(), []));
}

/** Repo-relative path (POSIX) for the in-scope packages; null if out of scope. */
function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/(activerecord|activemodel|arel)\/src\/.+\.ts)$/);
  return m ? { rel: m[1], pkg: m[2] } : null;
}

/** Name of the class enclosing `node`, or null (anonymous / not in a class). */
function enclosingClassName(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (cur.type === "ClassDeclaration" || cur.type === "ClassExpression") {
      return cur.id?.type === "Identifier" ? cur.id.name : null;
    }
  }
  return null;
}

/** Method name from a class member node, if it defines toSql/toSqlAndBinds. */
function tosqlMemberName(node) {
  // MethodDefinition covers method/get/set/static. PropertyDefinition covers
  // both inline functions (`toSql = () => …`) and this repo's mixin idiom
  // (`static toSql = toSqlImpl`, an imported `this`-typed function assigned to
  // the class). A bare `declare toSql: …` is a type-only declaration with no
  // implementation, so it's not a definition and is skipped.
  if (node.type !== "MethodDefinition" && node.type !== "PropertyDefinition") return null;
  if (node.computed) return null;
  const key = node.key;
  const name = key?.type === "Identifier" ? key.name : null;
  if (!name || !TOSQL_METHODS.has(name)) return null;
  if (node.type === "PropertyDefinition" && (node.declare || node.value == null)) return null;
  return name;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A class may define `toSql`/`toSqlAndBinds` only if its Rails counterpart defines `to_sql`/`to_sql_and_binds` — build SQL through Arel AST nodes + visitors, not hand-mashed strings.",
    },
    schema: [],
    messages: {
      bespokeToSql:
        "Class `{{cls}}` defines `{{method}}` but its Rails counterpart has no `to_sql`/`to_sql_and_binds`. Build SQL through real Arel AST nodes + visitors instead of hand-mashing strings; do not add a bespoke `{{method}}`.",
      anonToSql:
        "Anonymous class defines `{{method}}`. SQL must be built through real Arel AST nodes + visitors, not a bespoke `{{method}}`.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const scope = repoRel(filename);
    if (!scope) return {};
    if (loadExclude().has(scope.rel)) return {};

    const pkgAllow = loadAllow().get(scope.pkg);

    const check = (node) => {
      const method = tosqlMemberName(node);
      if (!method) return;
      const cls = enclosingClassName(node);
      if (cls === null) {
        context.report({ node: node.key, messageId: "anonToSql", data: { method } });
        return;
      }
      if (pkgAllow?.get(cls)?.has(method)) return;
      context.report({ node: node.key, messageId: "bespokeToSql", data: { cls, method } });
    };

    return {
      MethodDefinition: check,
      PropertyDefinition: check,
    };
  },
};

export default rule;
