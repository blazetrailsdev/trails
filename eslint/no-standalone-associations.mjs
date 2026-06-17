/**
 * ESLint rule: no-standalone-associations
 *
 * We want association macros declared *inside the model's class* via the
 * `this.<macro>(...)` form (in a `static { ... }` block), not bolted on after
 * the fact with the standalone `Associations.<macro>.call(Model, ...)` form:
 *
 *   ✗  Associations.hasMany.call(ELParent, "elChildren", { className: "ELChild" });
 *
 *   ✓  class ELParent extends Base {
 *        static {
 *          this._tableName = "el_parents";
 *          this.hasMany("elChildren", { className: "ELChild" });
 *        }
 *      }
 *
 * The in-class form lets the declare-accessor generator
 * (`packages/activerecord/scripts/materialize-model-declares.ts`) materialize
 * the `declare elChildren: …` accessors so `parent.elChildren` reads naturally.
 * This rule only converts the *call* form — it does NOT add `declare`
 * accessors. After converting, run the declare generator to materialize them.
 *
 * Covered macros (the standalone forms that have a clean `this.<x>(...)`
 * in-class equivalent): hasMany, belongsTo, hasOne, hasAndBelongsToMany.
 * The runtime loaders (`loadHasMany`, `loadBelongsTo`, `loadHasOne`, …) are
 * NOT declaration macros — they read an association at runtime and have no
 * in-class declaration form — so they are intentionally out of scope.
 *
 * Fixer — "move into static{} when safe, else warn":
 *   - Auto-fix ONLY when provably safe: the receiver (first `.call` arg) is a
 *     simple identifier naming a class declared in the SAME file, that class
 *     has a `static { … }` block, the class is declared textually before the
 *     standalone call, and the class name is unambiguous in the file. The fix
 *     deletes the standalone statement and appends `this.<macro>(<rest…>);` to
 *     the end of that class's static block.
 *   - Otherwise: report with NO fix (move it manually). Conservative by design:
 *     anything that could reorder behavior or that we can't resolve statically
 *     is reported only.
 *
 * Existing violators are grandfathered via a site-granular baseline,
 * `eslint/no-standalone-associations-exclude.json`. Each entry is
 * `"<repo-rel-path>::<receiver>::<macro>::<assocName>"`, so it survives line
 * moves (unlike a line:col key) and lets a single converted site drop out of
 * the baseline without disturbing its file's other sites. Regenerate with
 * `pnpm tsx scripts/generate-standalone-associations-exclude.ts`.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Env override lets the rule's own unit test point at a tmp baseline rather
// than mutating the committed list. Resolved lazily so a test that sets the
// env var after importing the rule still wins.
function excludePath() {
  return (
    process.env.NO_STANDALONE_ASSOCIATIONS_EXCLUDE_PATH ??
    path.join(__dirname, "no-standalone-associations-exclude.json")
  );
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

/** Repo-relative path under packages/; null if outside the repo tree. */
export function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/.+)$/);
  return m ? m[1] : null;
}

export const MACROS = new Set(["hasMany", "belongsTo", "hasOne", "hasAndBelongsToMany"]);

/** Match `Associations.<macro>.call`; returns the macro name or null. */
export function macroOfCall(callee) {
  // callee is `Associations.<macro>.call`
  if (callee.type !== "MemberExpression") return null;
  if (callee.computed || callee.property.type !== "Identifier") return null;
  if (callee.property.name !== "call") return null;
  const inner = callee.object; // Associations.<macro>
  if (inner.type !== "MemberExpression" || inner.computed) return null;
  if (inner.object.type !== "Identifier" || inner.object.name !== "Associations") return null;
  if (inner.property.type !== "Identifier") return null;
  return MACROS.has(inner.property.name) ? inner.property.name : null;
}

/** Static name of a string-literal first-arg, else "<dynamic>". */
export function assocName(arg) {
  if (arg && arg.type === "Literal" && typeof arg.value === "string") return arg.value;
  if (arg && arg.type === "TemplateLiteral" && arg.expressions.length === 0) {
    return arg.quasis[0]?.value?.cooked ?? "<dynamic>";
  }
  return "<dynamic>";
}

/**
 * Site-granular baseline key for a standalone `.call` node:
 * `<repo-rel-path>::<receiver>::<macro>::<assocName>`. Line-independent so a
 * converted site drops out without disturbing its file's other sites. Shared
 * verbatim with scripts/generate-standalone-associations-exclude.ts.
 */
export function siteKey(rel, node, macro) {
  const receiverArg = node.arguments[0];
  const receiver = receiverArg && receiverArg.type === "Identifier" ? receiverArg.name : "<dynamic>";
  return `${rel}::${receiver}::${macro}::${assocName(node.arguments[1])}`;
}

/** The `static { … }` block of a class, or null. */
function staticBlockOf(classNode) {
  return classNode.body.body.find((m) => m.type === "StaticBlock") ?? null;
}

const rule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Forbid standalone `Associations.<macro>.call(Model, …)`; declare associations in-class via `this.<macro>(…)` in a static block.",
    },
    schema: [],
    messages: {
      standalone:
        "Standalone `Associations.{{macro}}.call(...)` — declare it in {{receiver}}'s `static {}` block as `this.{{macro}}(...)`. (Then run the declare generator, materialize-model-declares.ts, to materialize accessors.)",
      standaloneNoFix:
        "Standalone `Associations.{{macro}}.call(...)` — move it into the target class's `static {}` block as `this.{{macro}}(...)` manually ({{reason}}). (Then run materialize-model-declares.ts to materialize accessors.)",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = repoRel(filename);
    if (!rel) return {};
    const exclude = loadExclude();
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    // Collect class declarations + expressions by name so we can resolve a
    // receiver to its class anywhere in the file (classes are commonly defined
    // inside an it() callback alongside the standalone call). A name that maps
    // to more than one class is ambiguous → no fix.
    const classesByName = new Map(); // name -> node | "AMBIGUOUS"
    const candidates = [];

    function recordClass(node) {
      if (!node.id || node.id.type !== "Identifier") return;
      const name = node.id.name;
      classesByName.set(name, classesByName.has(name) ? "AMBIGUOUS" : node);
    }

    return {
      ClassDeclaration: recordClass,
      ClassExpression: recordClass,

      CallExpression(node) {
        const macro = macroOfCall(node.callee);
        if (macro === null) return;
        candidates.push(node);
      },

      "Program:exit"() {
        for (const node of candidates) {
          const macro = macroOfCall(node.callee);
          const receiverArg = node.arguments[0];
          const receiver =
            receiverArg && receiverArg.type === "Identifier" ? receiverArg.name : null;

          if (exclude.has(siteKey(rel, node, macro))) continue;

          // Decide fixability.
          let reason = null;
          let classNode = null;
          const stmt = node.parent;
          if (!receiver) {
            reason = "the receiver is not a simple identifier";
          } else if (stmt.type !== "ExpressionStatement") {
            reason = "the call is not a standalone statement";
          } else {
            const resolved = classesByName.get(receiver);
            if (!resolved) {
              reason = `${receiver} is not declared in this file`;
            } else if (resolved === "AMBIGUOUS") {
              reason = `${receiver} is declared more than once in this file`;
            } else if (!staticBlockOf(resolved)) {
              reason = `${receiver} has no static {} block`;
            } else if (resolved.range[1] >= node.range[0]) {
              reason = `${receiver} is not declared before this call`;
            } else {
              classNode = resolved;
            }
          }

          if (!classNode) {
            context.report({
              node,
              messageId: "standaloneNoFix",
              data: { macro, reason },
            });
            continue;
          }

          context.report({
            node,
            messageId: "standalone",
            data: { macro, receiver },
            fix(fixer) {
              const block = staticBlockOf(classNode);
              const stmts = block.body;
              const last = stmts[stmts.length - 1];

              const indentWidth = last
                ? last.loc.start.column
                : block.loc.start.column + 2;
              const indent = " ".repeat(indentWidth);

              // Build `this.<macro>(<args after receiver>);` from the original
              // argument source text. Continuation lines of a multi-line
              // argument keep their indentation *relative to the old statement*,
              // so shift them by (new indent − old statement column) to land
              // correctly inside the static block — the fix output is then
              // already formatted, not reliant on a follow-up prettier pass.
              const shift = indentWidth - stmt.loc.start.column;
              const reindent = (txt) =>
                txt
                  .split("\n")
                  .map((line, i) => {
                    if (i === 0) return line;
                    if (shift >= 0) return " ".repeat(shift) + line;
                    // Dedent: drop up to -shift leading spaces.
                    const drop = Math.min(-shift, line.length - line.trimStart().length);
                    return line.slice(drop);
                  })
                  .join("\n");
              const restText = node.arguments
                .slice(1)
                .map((a) => reindent(sourceCode.getText(a)))
                .join(", ");
              const inserted = `\n${indent}this.${macro}(${restText});`;
              const anchor = last ?? sourceCode.getFirstToken(block, { skip: 0 }); // '{'

              const fixes = [
                last
                  ? fixer.insertTextAfter(last, inserted)
                  : fixer.insertTextAfter(anchor, inserted),
              ];

              // Remove the whole standalone statement, including the leading
              // indentation and the trailing newline, to avoid a blank line.
              const text = sourceCode.getText();
              let start = stmt.range[0];
              while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) start--;
              let end = stmt.range[1];
              if (text[end] === "\n") end++;
              else if (text[end] === "\r" && text[end + 1] === "\n") end += 2;
              fixes.push(fixer.removeRange([start, end]));

              return fixes;
            },
          });
        }
      },
    };
  },
};

export default rule;
