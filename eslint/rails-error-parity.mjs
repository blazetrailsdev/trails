/**
 * ESLint rule: rails-error-parity. Error classes are observable API, so our
 * hierarchy must mirror Rails and Rails-mirroring source must throw ported
 * error classes. Scoped (via eslint.config.mjs) to
 * `packages/{activerecord,activemodel,activesupport}/src/**\/*.ts` excluding
 * `*.test.ts`:
 *
 *   1. On `errors.ts`: every manifest error class whose Rails source maps to
 *      this TS file must have an exported class of the same name whose
 *      `extends` names the manifest parent (root classes must extend a global
 *      Error type). Missing/wrong-parent reports on line 1.
 *   2. Everywhere in scope: `throw new Error(` (and TypeError/globalThis.Error/
 *      …) is flagged — keyed on the constructor only, so ported subclasses pass.
 *
 * Pre-existing violators are grandfathered via the ratchet baseline
 * `eslint/rails-error-parity-exclude.json` (it only shrinks). Manifest:
 *   pnpm tsx scripts/build-rails-error-manifest.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolved lazily so the rule's own unit test can point at tmp fixtures via
// env vars without import-time ordering games.
const manifestPath = () =>
  process.env.RAILS_ERROR_CLASSES_PATH ?? path.join(__dirname, "rails-error-classes.json");
const excludePath = () =>
  process.env.RAILS_ERROR_PARITY_EXCLUDE_PATH ??
  path.join(__dirname, "rails-error-parity-exclude.json");

// Global error constructors. `throw new <one of these>(…)` is the bare-throw
// the rule bans; ported subclasses (RecordNotFound, …) are not in this set.
const NATIVE_ERRORS = new Set(
  "Error EvalError RangeError ReferenceError SyntaxError TypeError URIError AggregateError".split(
    " ",
  ),
);

// Ruby built-in exception bases. When a manifest parent is one of these, the
// TS class is a hierarchy root and any Error-equivalent `extends` passes.
const ROOT_BASES = new Set(
  (
    "StandardError RuntimeError Exception ScriptError ArgumentError NameError NoMethodError " +
    "NotImplementedError TypeError RangeError IndexError KeyError IOError StopIteration " +
    "FrozenError NoMatchingPatternError"
  ).split(" "),
);

// Maps the in-scope packages to their Ruby lib namespace directory. Only
// manifest entries whose rubyFile lives under this namespace map onto the
// package's TS source tree — e.g. `arel/errors.rb` (Arel is vendored under
// activerecord/lib) belongs to the arel package, not activerecord/errors.ts.
const PKG_NS = {
  activerecord: "active_record/",
  activemodel: "active_model/",
  activesupport: "active_support/",
};

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
  return loadJson(manifestPath(), { packages: {} });
}

function loadExclude() {
  return new Set(loadJson(excludePath(), []));
}

/** Repo-relative path (POSIX) for the in-scope packages; null if out of scope. */
function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(
    /(?:^|\/)(packages\/(activerecord|activemodel|activesupport)\/src\/.+\.ts)$/,
  );
  return m ? { rel: m[1], pkg: m[2] } : null;
}

/** `active_record/errors.rb` → `errors.ts` (drop namespace segment, .rb→.ts). */
function rubyToSrcRel(rubyFile) {
  const parts = rubyFile.split("/");
  const tail = parts.slice(1).join("/");
  return tail.replace(/\.rb$/, ".ts");
}

/** Last identifier of a class's superClass node (`globalThis.Error` → `Error`). */
function superClassName(node) {
  const sc = node.superClass;
  if (!sc) return null;
  if (sc.type === "Identifier") return sc.name;
  if (sc.type === "MemberExpression" && sc.property?.type === "Identifier") {
    return sc.property.name;
  }
  return null;
}

/** Constructor name of `new X` / `new globalThis.X` (else null). */
function newCalleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (
    callee?.type === "MemberExpression" &&
    callee.object?.type === "Identifier" &&
    (callee.object.name === "globalThis" || callee.object.name === "window") &&
    callee.property?.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
}

function checkParity(context, exportedClasses) {
  const scope = repoRel(context.filename ?? context.getFilename?.() ?? "");
  if (!scope) return;
  const pkg = scope.pkg;
  const ns = PKG_NS[pkg];
  if (!ns) return;

  const srcRel = scope.rel.replace(/^packages\/[^/]+\/src\//, ""); // e.g. `errors.ts`
  const manifest = loadManifest();
  const classes = manifest.packages?.[pkg] ?? [];

  for (const entry of classes) {
    if (!entry.rubyFile.startsWith(ns)) continue;
    if (rubyToSrcRel(entry.rubyFile) !== srcRel) continue;
    const found = exportedClasses.get(entry.name);
    if (!found) {
      context.report({
        loc: { line: 1, column: 0 },
        messageId: "missingClass",
        data: { name: entry.name, parent: entry.parent },
      });
      continue;
    }
    if (ROOT_BASES.has(entry.parent)) {
      // Root class must still extend a global Error type (`class Foo {}` isn't).
      if (!found.parent || !NATIVE_ERRORS.has(found.parent)) {
        context.report({
          loc: { line: 1, column: 0 },
          messageId: "rootExtends",
          data: { name: entry.name, actual: found.parent ?? "(none)" },
        });
      }
      continue;
    }
    if (found.parent !== entry.parent) {
      context.report({
        loc: { line: 1, column: 0 },
        messageId: "wrongParent",
        data: { name: entry.name, expected: entry.parent, actual: found.parent ?? "(none)" },
      });
    }
  }
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Mirror Rails' error-class hierarchy in errors.ts and ban bare `throw new Error` in Rails-mirroring source.",
    },
    schema: [],
    messages: {
      missingClass:
        "Rails error class `{{name}}` (extends `{{parent}}`) has no matching exported class in this file.",
      wrongParent:
        "Rails error class `{{name}}` should extend `{{expected}}` but extends `{{actual}}`.",
      rootExtends:
        "Rails root error class `{{name}}` must extend a global Error type but extends `{{actual}}`.",
      bareThrow: "throw a ported Rails error class instead of `new {{name}}`.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const scope = repoRel(filename);
    if (!scope) return {};
    if (loadExclude().has(scope.rel)) return {};

    const isErrorsFile = path.basename(filename) === "errors.ts";
    const exportedClasses = new Map();

    return {
      ThrowStatement(node) {
        const arg = node.argument;
        if (arg?.type !== "NewExpression") return;
        const name = newCalleeName(arg.callee);
        if (!name || !NATIVE_ERRORS.has(name)) return;
        context.report({ node: arg, messageId: "bareThrow", data: { name } });
      },
      // Collect exported classes for the errors.ts parity check.
      "ExportNamedDeclaration > ClassDeclaration"(node) {
        if (!isErrorsFile || node.id?.type !== "Identifier") return;
        exportedClasses.set(node.id.name, { parent: superClassName(node) });
      },
      "Program:exit"() {
        if (isErrorsFile) checkParity(context, exportedClasses);
      },
    };
  },
};

export default rule;
