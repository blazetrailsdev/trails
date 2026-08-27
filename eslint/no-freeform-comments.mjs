/**
 * ESLint rule: no-freeform-comments
 *
 * trails is a line-by-line port of Rails. A comment that restates what the TS
 * says, or that narrates a decision the Rails source already settles, is drift:
 * it competes with the Ruby for authority and it rots independently of both
 * sides. The comments worth having are the ones that point at Rails, the ones
 * the port's own conventions live in (JSDoc), and the ones a tool reads.
 *
 * So this rule deletes free-form comments and KEEPS three kinds:
 *
 *   1. JSDoc block comments (`/** ... *\/`). Every port convention lives here —
 *      `Mirrors:`, `@internal`, `@noRailsEquivalent`, `@missingRailsCall` — and
 *      `parity:api` / the ESLint manifests read them.
 *   2. Rails references — a `.rb` path or citation, a `Mirrors:` line, a Rails
 *      constant path. This is the fidelity anchor CLAUDE.md asks for.
 *   3. Tool directives — `eslint-*`, `@ts-*`, `prettier-ignore`, coverage
 *      pragmas, and this repo's own `boundary:` / `@boundary-file:` (read by
 *      `no-native-date`) and `@nie disposition=` (read by
 *      `nie-requires-annotation`). Deleting these changes what the toolchain
 *      does.
 *
 * There is no opt-out marker. The rule shipped with a `keep:` escape hatch and
 * the sweep across arel and activemodel used it zero times, so it was removed:
 * a comment earns one of the three forms above or it goes.
 *
 * Rails' OWN comments are NOT kept, and that is deliberate. The Ruby is
 * vendored at `vendor/rails/` and every ported file carries a `Mirrors:` line
 * pointing at it, so a reader who wants Rails' annotation on a line reads it
 * at the source. Copying it into trails duplicates it into a second place that
 * rots on its own the moment Rails edits it — the same failure this rule
 * exists to prevent. Reference the Ruby; do not restate it.
 *
 * Keep-rule 1 is NOT unconditional. A JSDoc block is kept when it documents
 * something — when it is the leading comment of a declaration, of a class /
 * interface / object member, of a parameter, or of a definition-shaped
 * statement (a `describe(...)` file header, an `it(...)` header, an assignment
 * that names what it assigns). That is where every port convention lives, and
 * it is where ordinary API documentation lives too; neither is touched.
 *
 * A JSDoc block that is NOT in a documenting position documents no
 * declaration — floating between statements inside a function body, before an
 * `if` or a `return`, at the end of a block. It is narration, and `/** *\/` is
 * exactly the two-character reformatting that used to buy narration a pass, so
 * it is deleted like any other free-form comment, unless it carries a JSDoc
 * tag, a Rails reference, or a tool directive on its own merits.
 *
 * The blanket alternative — "every JSDoc block must carry a tag or a Rails
 * reference" — was measured and rejected: it flags 94 pre-existing blocks in
 * arel and activemodel that are ordinary API documentation ("Set the FROM
 * table.", "Add GROUP BY."), which is JSDoc doing its job. Position
 * discriminates where content cannot: those 94 all sit on a declaration.
 *
 * The fix is destructive by design: the point is to run it, then read the diff
 * and rescue whatever turns out to be load-bearing. Run it with
 * `--rule '{"blazetrails/no-freeform-comments":["warn",{"report":true}]}'` to
 * audit without deleting.
 */

/**
 * Directives the toolchain reads. Deleting one silently changes behaviour.
 *
 * `boundary:` / `@boundary-file:` are this repo's own directives, read by
 * `eslint/no-native-date.mjs` — they are the documented exemption for an
 * intentional JS `Date`, so deleting one reds that rule rather than merely
 * losing a note. They are matched anywhere in the comment, not just at the
 * start, because `no-native-date` accepts them mid-line
 * (`} /* boundary: *\/ else if (x instanceof Date)`).
 *
 * `@nie disposition=` is likewise read by `eslint/nie-requires-annotation.mjs`,
 * which REQUIRES it on every `throw new NotImplementedError(...)` — deleting
 * one reds that rule.
 */
const DIRECTIVE_RE =
  /^\s*(?:eslint-(?:disable|enable)(?:-next-line|-line)?\b|eslint\s|globals?\s|exported\b|@ts-(?:expect-error|ignore|nocheck)\b|prettier-ignore\b|(?:v8|c8|istanbul|node:coverage)\s+ignore\b|@vitest-environment\b|#!)|\bboundary:|@boundary-file:|@nie\s+disposition=/iu;

/**
 * A reference to the Rails source. Deliberately generous: a false KEEP costs
 * one line of audit, a false DELETE costs a fidelity anchor.
 *
 * - `query_methods.rb`, `relation/query_methods.rb:1604`
 * - `Mirrors:` / `Mirrors Rails:` — the repo's citation convention
 * - `ActiveRecord::Relation`, `Arel::Nodes::Grouping` — Ruby constant paths
 * - a bare `rails/` path
 *
 * This keeps pointers TO the Ruby, which is the whole substitute for copying
 * the Ruby's own comments across.
 */
const RAILS_REF_RE =
  /(?:\b[\w/]+\.rb\b|\bMirrors\b|\b(?:Active(?:Record|Model|Support|Storage|Job)|Arel|Abstract\w*)::|(?:^|\s)rails\/|\bRails\b|\bRuby\b|\bMRI\b)/u;

/**
 * A contiguous run of `//` comments is one human comment that happens to wrap.
 * Judging each physical line separately splits a Rails citation from the
 * sentence it anchors and deletes half of it, so line comments are grouped
 * into blocks first and kept or deleted whole.
 */
function groupLineComments(comments, sourceCode) {
  const groups = [];
  let current = null;
  for (const comment of comments) {
    if (comment.type !== "Line") {
      if (current) {
        groups.push(current);
        current = null;
      }
      groups.push([comment]);
      continue;
    }
    const contiguous =
      current &&
      comment.loc.start.line === current[current.length - 1].loc.end.line + 1 &&
      onlyCommentOnItsLine(comment, sourceCode) &&
      onlyCommentOnItsLine(current[current.length - 1], sourceCode);
    if (contiguous) current.push(comment);
    else {
      if (current) groups.push(current);
      current = [comment];
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** True when nothing but whitespace precedes the comment on its own line. */
function onlyCommentOnItsLine(comment, sourceCode) {
  const line = sourceCode.lines[comment.loc.start.line - 1] ?? "";
  return line.slice(0, comment.loc.start.column).trim() === "";
}

/** JSDoc: a block comment opening `/**`, which is where the port conventions live. */
function isJsDoc(comment) {
  return comment.type === "Block" && comment.value.startsWith("*");
}

/**
 * A JSDoc tag (`@internal`, `@param`, `@noRailsEquivalent`, ...). A tagged
 * block is kept wherever it sits: the tags are the port's own conventions and
 * several of them are read by tooling.
 */
const JSDOC_TAG_RE = /^[\s*]*@\w/mu;

/**
 * Node types that a JSDoc block can document: declarations, class / interface
 * / object members, and enum members. A statement is NOT one of them, at any
 * scope — a bare `registerFoo();` at module scope documents no more than one
 * inside a body does, and exempting it would reopen this rule's bypass one
 * scope up. The statements that DO document something are definition-shaped,
 * and `isDefinitionStatement` recognises those wherever they sit.
 */
const DOCUMENTABLE_TYPES = new Set([
  "VariableDeclaration",
  "FunctionDeclaration",
  "ClassDeclaration",
  "ClassExpression",
  "TSDeclareFunction",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSEnumMember",
  "TSModuleDeclaration",
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration",
  "MethodDefinition",
  "PropertyDefinition",
  "AccessorProperty",
  "StaticBlock",
  "TSAbstractMethodDefinition",
  "TSAbstractPropertyDefinition",
  "TSPropertySignature",
  "TSMethodSignature",
  "TSIndexSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "Property",
]);

/**
 * A statement that DEFINES something, which a JSDoc block above it documents
 * the same way one above a `function` documents the function:
 *
 *   - a call taking a function, which is Ruby-block-shaped — `describe(...)`,
 *     `it(...)`, `beforeEach(...)`. Recognised at any depth: at module scope
 *     for a `describe(...)` file header, nested for the `it(...)` headers
 *     inside it.
 *   - an assignment, which names the thing it assigns —
 *     `taggedLogging.logger = function (...)`, and the repo's own mixin idiom
 *     `Model.aliasAttribute = aliasAttribute`.
 *
 * Narration sits above an `if`, a `return` or a bare call — none of which
 * define anything, at any scope. The packages' `include(Model, Mixin)`
 * mixin-wiring notes take no function and are kept by rule 2 instead: every
 * one of them cites the Ruby `include` it mirrors, which is what tells it
 * apart from a bare call.
 */
function isDefinitionStatement(node) {
  if (node.type !== "ExpressionStatement") return false;
  const expression = node.expression;
  if (expression?.type === "AssignmentExpression") return true;
  if (expression?.type !== "CallExpression") return false;
  return expression.arguments.some(
    (arg) => arg.type === "FunctionExpression" || arg.type === "ArrowFunctionExpression",
  );
}

/** A function parameter, which JSDoc documents in place as often as by `@param`. */
function isParameter(node) {
  return Array.isArray(node.parent?.params) && node.parent.params.includes(node);
}

function isDocumentable(node) {
  if (DOCUMENTABLE_TYPES.has(node.type)) return true;
  if (isParameter(node)) return true;
  return isDefinitionStatement(node);
}

function isKept(group, attachedJsDoc) {
  return group.some((comment) => {
    const text = comment.value;
    if (isJsDoc(comment)) {
      if (JSDOC_TAG_RE.test(text)) return true;
      if (attachedJsDoc.has(comment)) return true;
    }
    if (DIRECTIVE_RE.test(text)) return true;
    return RAILS_REF_RE.test(text);
  });
}

/**
 * The range to remove: the comment span, plus the whitespace back to the start
 * of its line and the trailing newline, so deleting a standalone comment does
 * not leave a blank line behind. A trailing comment (code on the same line)
 * keeps its line and loses only the comment and the space before it.
 */
function removalRange(group, sourceCode) {
  const first = group[0];
  const last = group[group.length - 1];
  const text = sourceCode.getText();
  let start = first.range[0];
  let end = last.range[1];
  const standalone = onlyCommentOnItsLine(first, sourceCode);
  while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) start--;
  if (standalone) {
    if (text[end] === "\r") end++;
    if (text[end] === "\n") end++;
  }
  return [start, end];
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Delete free-form comments; keep only JSDoc, references to the Rails source, and tool directives.",
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          // Report without offering a fix — the audit mode.
          report: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      floatingJsDoc:
        "JSDoc block in a non-documenting position. It documents no declaration, so it is narration: attach it to what it documents, cite the Rails file, or delete it.",
      freeform:
        "Free-form comment. trails is a line-by-line Rails port: cite the Rails file, promote it to JSDoc, or delete it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const reportOnly = context.options[0]?.report === true;
    const attachedJsDoc = new Set();
    return {
      "*"(node) {
        if (!isDocumentable(node)) return;
        for (const comment of sourceCode.getCommentsBefore(node)) {
          if (isJsDoc(comment)) attachedJsDoc.add(comment);
        }
      },
      "Program:exit"(program) {
        // A file with no statements has no documenting position to attach to,
        // so its comments are the whole file and are kept rather than erased.
        if (program.body.length === 0) return;
        for (const group of groupLineComments(sourceCode.getAllComments(), sourceCode)) {
          if (isKept(group, attachedJsDoc)) continue;
          const range = removalRange(group, sourceCode);
          context.report({
            loc: { start: group[0].loc.start, end: group[group.length - 1].loc.end },
            messageId: group.some(isJsDoc) ? "floatingJsDoc" : "freeform",
            fix: reportOnly ? undefined : (fixer) => fixer.removeRange(range),
          });
        }
      },
    };
  },
};

export default rule;
export { RAILS_REF_RE, DIRECTIVE_RE };
