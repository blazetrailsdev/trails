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
  const receiver =
    receiverArg && receiverArg.type === "Identifier" ? receiverArg.name : "<dynamic>";
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

    // name -> textual start offsets of every local binding with that name.
    // Used to reject a fix whose argument expressions reference a binding
    // declared *after* the target class: hoisting the call into the class's
    // `static {}` block (which runs at class-evaluation time) would then read
    // that binding inside its TDZ — a runtime ReferenceError, not just a type
    // error. Such sites are reported as standaloneNoFix and left in place.
    const bindingStarts = new Map(); // name -> number[] (all decl start offsets)
    function recordBinding(name, start) {
      if (typeof name !== "string") return;
      const arr = bindingStarts.get(name);
      if (arr) arr.push(start);
      else bindingStarts.set(name, [start]);
    }

    function recordClass(node) {
      if (!node.id || node.id.type !== "Identifier") return;
      const name = node.id.name;
      classesByName.set(name, classesByName.has(name) ? "AMBIGUOUS" : node);
      recordBinding(name, node.range[0]);
    }

    // Collect the identifier names a binding *pattern* introduces, recursing
    // through destructuring (`const { scope } = …`, `const [a, ...rest] = …`,
    // defaults) so every name is recorded — not just the simple-identifier case.
    function bindingNamesOf(pattern, out = new Set()) {
      if (!pattern || typeof pattern.type !== "string") return out;
      switch (pattern.type) {
        case "Identifier":
          out.add(pattern.name);
          break;
        case "AssignmentPattern":
          bindingNamesOf(pattern.left, out);
          break;
        case "RestElement":
          bindingNamesOf(pattern.argument, out);
          break;
        case "ArrayPattern":
          for (const el of pattern.elements) if (el) bindingNamesOf(el, out);
          break;
        case "ObjectPattern":
          for (const p of pattern.properties) {
            bindingNamesOf(p.type === "RestElement" ? p.argument : p.value, out);
          }
          break;
      }
      return out;
    }

    const FUNCTION_TYPES = new Set([
      "ArrowFunctionExpression",
      "FunctionExpression",
      "FunctionDeclaration",
    ]);

    // Collect identifier *references* inside an argument subtree, skipping
    // non-computed property keys (`{ className: x }` → only `x`) and member
    // property names (`a.b` → only `a`), which are not variable reads. Function
    // parameters are local bindings, so references that resolve to them (e.g.
    // `owner` in `scope: (owner) => owner`) are excluded — otherwise a same-named
    // variable declared between the class and the call would wrongly suppress an
    // actually-safe fix. `bound` carries the param names in scope.
    function referencedNames(node, out, bound = new Set()) {
      if (!node || typeof node.type !== "string") return out;
      if (node.type === "Identifier") {
        if (!bound.has(node.name)) out.add(node.name);
        return out;
      }
      let childBound = bound;
      if (FUNCTION_TYPES.has(node.type)) {
        childBound = new Set(bound);
        for (const p of node.params) bindingNamesOf(p, childBound);
      }
      for (const key of Object.keys(node)) {
        if (key === "parent" || key === "range" || key === "loc") continue;
        if (node.type === "Property" && !node.computed && key === "key") continue;
        if (node.type === "MemberExpression" && !node.computed && key === "property") continue;
        const child = node[key];
        if (Array.isArray(child)) {
          for (const c of child)
            if (c && typeof c.type === "string") referencedNames(c, out, childBound);
        } else if (child && typeof child.type === "string") {
          referencedNames(child, out, childBound);
        }
      }
      return out;
    }

    // Root identifier of an assignment target, unwrapping member chains and
    // TS/paren wrappers: `(X as any)._associations` and `X.foo.bar` → "X".
    function assignmentRootName(target) {
      let n = target;
      while (n) {
        if (n.type === "MemberExpression") n = n.object;
        else if (n.type === "TSAsExpression" || n.type === "TSNonNullExpression") n = n.expression;
        else break;
      }
      return n && n.type === "Identifier" ? n.name : null;
    }

    // Property name of a non-computed member, or a string-literal computed
    // member; null otherwise.
    function memberPropName(member) {
      if (!member.computed && member.property.type === "Identifier") return member.property.name;
      if (
        member.computed &&
        member.property.type === "Literal" &&
        typeof member.property.value === "string"
      ) {
        return member.property.value;
      }
      return null;
    }

    // Does a statement subtree reset/mutate the receiver's association state?
    // Catches the `(X as any)._associations = []` reset idiom (the standalone
    // call originally ran *after* that reset, but hoisting it into the static
    // {} block runs it at class-evaluation time — before the reset wipes it),
    // including the aliased form `[X, Y].forEach((m) => { m._associations = [] })`
    // where the assignment target's root is the loop variable, not the receiver.
    // So we flag both: an assignment whose member root is the receiver, and any
    // assignment to a member named `_associations` (the registry being reset).
    function mutatesReceiverMember(subtree, receiver) {
      let found = false;
      (function walk(n) {
        if (found || !n || typeof n.type !== "string") return;
        if (
          n.type === "AssignmentExpression" &&
          n.left.type === "MemberExpression" &&
          (assignmentRootName(n.left) === receiver || memberPropName(n.left) === "_associations")
        ) {
          found = true;
          return;
        }
        for (const key of Object.keys(n)) {
          if (key === "parent" || key === "range" || key === "loc") continue;
          const child = n[key];
          if (Array.isArray(child)) {
            for (const c of child) if (c && typeof c.type === "string") walk(c);
          } else if (child && typeof child.type === "string") {
            walk(child);
          }
        }
      })(subtree);
      return found;
    }

    return {
      ClassDeclaration: recordClass,
      ClassExpression: recordClass,

      VariableDeclarator(node) {
        for (const name of bindingNamesOf(node.id)) recordBinding(name, node.range[0]);
      },
      FunctionDeclaration(node) {
        if (node.id && node.id.type === "Identifier") recordBinding(node.id.name, node.range[0]);
      },

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
            } else if (stmt.parent !== resolved.parent) {
              // The call must be a sibling statement in the same scope as the
              // class. A call nested in a deeper scope (e.g. inside an `it()`
              // callback while the class is declared at `describe` scope) runs
              // per-invocation; hoisting it into the static {} block — which
              // runs once at class-evaluation time — drops those repeat
              // declarations and changes behavior.
              reason = `${receiver} is declared in a different scope than this call`;
            } else {
              // Reject if any argument references a binding declared after the
              // target class — hoisting into its static {} block would read it
              // in its TDZ at class-evaluation time (runtime ReferenceError).
              const refs = referencedNames(
                { type: "ArrayExpression", elements: node.arguments.slice(1) },
                new Set(),
              );
              let offender = null;
              for (const name of refs) {
                const starts = bindingStarts.get(name);
                // A binding of this name declared textually between the target
                // class and the call (block-scoped decls shadow, so check the
                // interval, not a global min) would land in its TDZ once hoisted.
                if (starts && starts.some((s) => s > resolved.range[0] && s < node.range[1])) {
                  offender = name;
                  break;
                }
              }
              if (offender) {
                reason = `an argument references ${offender}, declared after ${receiver}`;
              } else {
                // Refuse if a sibling statement *between* the class and the call
                // mutates a member of the receiver (e.g. `X._associations = []`):
                // the call originally ran after that mutation, but hoisting it
                // into the static {} block runs it before — so the mutation
                // would then wipe the just-declared association.
                const siblings = resolved.parent.body;
                const mutated =
                  Array.isArray(siblings) &&
                  siblings.some(
                    (s) =>
                      s.range[0] > resolved.range[1] &&
                      s.range[1] < node.range[0] &&
                      mutatesReceiverMember(s, receiver),
                  );
                if (mutated) {
                  reason = `a statement between ${receiver} and this call mutates ${receiver}`;
                } else {
                  classNode = resolved;
                }
              }
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

              const indentWidth = last ? last.loc.start.column : block.loc.start.column + 2;
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
              const stmtText = `this.${macro}(${restText});`;

              const fixes = [];
              if (last) {
                // Append after the last existing statement; its closing brace
                // already sits on its own line.
                fixes.push(fixer.insertTextAfter(last, `\n${indent}${stmtText}`));
              } else {
                // Empty `static {}`: insert after the `{` and add a newline +
                // brace indentation so the closing `}` lands on its own line.
                // Note getFirstToken(block) is the `static` keyword, so filter
                // to the `{` token explicitly.
                const brace = sourceCode.getFirstToken(block, { filter: (t) => t.value === "{" });
                const closeIndent = " ".repeat(block.loc.start.column);
                fixes.push(fixer.insertTextAfter(brace, `\n${indent}${stmtText}\n${closeIndent}`));
              }

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
