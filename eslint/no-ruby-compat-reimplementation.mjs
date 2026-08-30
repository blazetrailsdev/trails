/**
 * ESLint rule: no-ruby-compat-reimplementation
 *
 * `@blazetrails/ruby-compat` only pays for itself if the tree CALLS it.
 * Without a gate the package relocates today's duplicates and grows fresh ones
 * — the history that produced them: `activesupport/src/core-ext/regexp.ts:18`
 * has been the canonical `regexpEscape` for a long time and three
 * byte-identical private copies exist anyway (`quote-regex.ts:27`,
 * `run-token.ts:23`, `trails-actions.ts:191`).
 *
 * So a function or class declared OUTSIDE `packages/ruby-compat/` whose name is
 * a ruby-compat export, or a registered alias of one, is an error. The register
 * is in the scope module beside this file, each entry carrying the CONTEXT that
 * keeps a Rails-anchored homonym (`Cache::Store#fetch`, `Session#dig`,
 * `Core#<=>` as `compare`) from being flagged.
 *
 * WHAT IT CANNOT CATCH: a copy under a name nobody has seen — it detects a
 * re-spelling only once someone has written that spelling down. The complete
 * answer is structural detection, filed separately as REPORT-ONLY
 * (`structural-duplicate-detector-report`, RFC 0129) because its false-positive
 * rate is unknown until it runs against the real tree.
 *
 * `no-ruby-compat-reimplementation-exclude.json` holds today's copies, one row
 * per declaration, and is ONLY-SHRINK: a row is deleted by the move story that
 * converges it, NEVER added to cover new code — the remedy for a new flag is to
 * call the primitive. Precedent for the shape: `no-raw-sql-scope.mjs`.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { inScope, rubyCompatAliases } from "./no-ruby-compat-reimplementation-scope.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCLUDE_PATH = path.resolve(__dirname, "no-ruby-compat-reimplementation-exclude.json");

let excludeCache = null;

function excluded() {
  if (excludeCache) return excludeCache;
  excludeCache = new Set(
    fs.existsSync(EXCLUDE_PATH) ? JSON.parse(fs.readFileSync(EXCLUDE_PATH, "utf8")) : [],
  );
  return excludeCache;
}

function repoRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, "..");
}

function relFromRepoRoot(filename) {
  const rel = path.isAbsolute(filename)
    ? path.relative(repoRoot(), filename)
    : path.normalize(filename);
  return rel.split(path.sep).join("/");
}

/** The registered alias this declaration is, or `undefined`. */
function aliasFor(name, kind, params, sourceCode) {
  return rubyCompatAliases.find((alias) => {
    if (alias.name !== name || alias.kind !== kind) return false;
    if (!alias.firstParamType) return true;
    const first = params?.[0];
    if (!first?.typeAnnotation) return false;
    return sourceCode.getText(first.typeAnnotation).includes(alias.firstParamType);
  });
}

function check(context, node, name, kind, params) {
  if (!name) return;
  const filename = context.filename ?? context.getFilename?.();
  if (!filename) return;
  const rel = relFromRepoRoot(filename);
  if (!inScope(rel)) return;

  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const alias = aliasFor(name, kind, params, sourceCode);
  if (!alias) return;
  if (excluded().has(`${rel}::${name}`)) return;

  context.report({
    node,
    messageId: "reimplementation",
    data: { name, primitive: alias.primitive },
  });
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid re-implementing a `@blazetrails/ruby-compat` primitive outside that package.",
    },
    schema: [],
    messages: {
      reimplementation:
        "`{{name}}` re-implements {{primitive}}, which belongs to `@blazetrails/ruby-compat`. Call the primitive instead of declaring another copy of it.",
    },
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        check(context, node, node.id?.name, "function", node.params);
      },
      ClassDeclaration(node) {
        check(context, node, node.id?.name, "class", []);
      },
      VariableDeclarator(node) {
        if (node.id?.type !== "Identifier") return;
        const init = node.init;
        if (init?.type === "ClassExpression") {
          check(context, node, node.id.name, "class", []);
          return;
        }
        if (init?.type !== "ArrowFunctionExpression" && init?.type !== "FunctionExpression") return;
        check(context, node, node.id.name, "function", init.params);
      },
      // Deliberately NOT matching a class METHOD: a Ruby method ported onto the
      // class that defines it in Rails is the port, not a copy of a primitive
      // (`Cache::Store#fetch`, `Session#dig`, `Journey::Nodes::Node#symbol?`).
    };
  },
};

export default rule;
