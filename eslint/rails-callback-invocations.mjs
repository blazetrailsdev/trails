/**
 * ESLint rule: rails-callback-invocations. Firing lifecycle callbacks is
 * observable behavior, so a ported ActiveRecord method whose Rails counterpart
 * runs callbacks (`_run_<event>_callbacks` / `run_callbacks(:event)`) must keep
 * firing them. Scoped (via eslint.config.mjs) to `packages/activerecord/src/**`
 * excluding `*.test.ts`.
 *
 * For every function/method whose name matches a manifest entry, the rule
 * collects the string-literal event arguments of every `runCallbacks(...)` /
 * `runAllCallbacks(...)` call in its body (the TS equivalents of Rails'
 * `run_callbacks` family). If a required event is not among them, the method is
 * flagged — unless the pair `<repo-rel-path>#<method>` is grandfathered in the
 * ratchet baseline `eslint/rails-callback-invocations-exclude.json` (it only
 * shrinks).
 *
 * Manifest: eslint/rails-callback-invocations.json, built by
 *   pnpm tsx scripts/build-rails-privates-manifest.ts
 * (refreshed on every `pnpm api:compare`).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolved lazily so the unit test can point at tmp fixtures via env vars
// without import-time ordering games.
const manifestPath = () =>
  process.env.RAILS_CALLBACK_INVOCATIONS_PATH ??
  path.join(__dirname, "rails-callback-invocations.json");
const excludePath = () =>
  process.env.RAILS_CALLBACK_INVOCATIONS_EXCLUDE_PATH ??
  path.join(__dirname, "rails-callback-invocations-exclude.json");

// Callee names that fire callbacks in the TS port. `runCallbacks("event")` is
// the direct equivalent of Rails' `run_callbacks(:event)`; `runAllCallbacks`
// is the trails helper the persistence path uses to fire before/around/after
// in one shot.
const RUN_CALLBACK_CALLEES = new Set(["runCallbacks", "runAllCallbacks"]);

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

function loadManifest() {
  return loadJson(manifestPath(), { methods: {} }).methods ?? {};
}

function loadExclude() {
  return new Set(loadJson(excludePath(), []));
}

/** Repo-relative POSIX path when in scope (packages/activerecord/src/**.ts); else null. */
function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/activerecord\/src\/.+\.ts)$/);
  return m ? m[1] : null;
}

/** Trailing identifier of a call's callee (`this.runCallbacks` → `runCallbacks`). */
function calleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression" && callee.property?.type === "Identifier") {
    return callee.property.name;
  }
  return null;
}

/** String-literal value of a node, or null (handles `"x"` and `` `x` ``). */
function stringValue(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/**
 * Every callback event fired within `fnNode`'s body — the set of string-literal
 * arguments to any runCallbacks/runAllCallbacks call. Nested functions are
 * intentionally included: the port sometimes fires callbacks from an inner
 * closure passed to a persistence helper.
 */
function eventsFired(fnNode, sourceCode) {
  const fired = new Set();
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "CallExpression" && RUN_CALLBACK_CALLEES.has(calleeName(node.callee))) {
      for (const arg of node.arguments) {
        const s = stringValue(arg);
        if (s !== null) fired.add(s);
      }
    }
    for (const key of sourceCode.visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) for (const c of child) visit(c);
      else if (child && typeof child.type === "string") visit(child);
    }
  };
  visit(fnNode.body);
  return fired;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ported ActiveRecord methods must fire the lifecycle callbacks their Rails counterparts run.",
    },
    schema: [],
    messages: {
      missingCallback:
        '`{{name}}` mirrors a Rails method that runs the `{{event}}` callback but its body never calls `runCallbacks("{{event}}")`.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const rel = repoRel(filename);
    if (!rel) return {};
    const manifest = loadManifest();
    const exclude = loadExclude();
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    const check = (fnNode, name, reportNode) => {
      if (!name) return;
      const required = manifest[name];
      if (!required || required.length === 0) return;
      if (exclude.has(`${rel}#${name}`)) return;
      const fired = eventsFired(fnNode, sourceCode);
      for (const event of required) {
        if (!fired.has(event)) {
          context.report({ node: reportNode, messageId: "missingCallback", data: { name, event } });
        }
      }
    };

    return {
      FunctionDeclaration(node) {
        if (node.id) check(node, node.id.name, node.id);
      },
      "MethodDefinition[kind='method']"(node) {
        if (node.key?.type === "Identifier") check(node.value, node.key.name, node.key);
      },
      // `export const foo = function/arrow` and object-property functions.
      "VariableDeclarator[init.type=/FunctionExpression|ArrowFunctionExpression/]"(node) {
        if (node.id?.type === "Identifier") check(node.init, node.id.name, node.id);
      },
    };
  },
};

export default rule;
