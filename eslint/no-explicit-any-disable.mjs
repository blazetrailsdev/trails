/**
 * ESLint rule: no-explicit-any-disable
 *
 * `@typescript-eslint/no-explicit-any` is `error` in activerecord (RFC 0037).
 * Flipping it to error shifts the workaround from `as any` (visible, greppable)
 * to an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.
 * The requirement is: no workarounds — disabling `no-explicit-any` inline must
 * itself be a lint error. Fix the `any`; don't silence it.
 *
 * Flags every disable directive that suppresses `no-explicit-any`:
 *   - `eslint-disable` / `eslint-disable-next-line` / `eslint-disable-line`
 *     that names `@typescript-eslint/no-explicit-any` in its rule list, and
 *   - a bare `eslint-disable*` with no rule list (which disables everything,
 *     including this very rule).
 *
 * A bare block (`/* eslint-disable *\/`) or `eslint-disable-line` covers its
 * own location, so ESLint's directive processing would swallow this rule's
 * report on that comment. To stay visible we report those at the very top of
 * the file (line 0), which sorts before any directive and escapes suppression.
 */

const TARGET_RULE = "@typescript-eslint/no-explicit-any";
const DIRECTIVE_RE = /^eslint-disable(-next-line|-line)?(?:\s+([\s\S]*))?$/;

/**
 * Classify a comment's directive, or return null if it doesn't disable the
 * target rule. `type` is "block" | "line" | "next-line"; `bare` means the
 * directive carries no rule list (disables everything).
 */
function classifyDirective(commentValue) {
  const match = commentValue.trim().match(DIRECTIVE_RE);
  if (!match) return null;
  const type = match[1] === "-line" ? "line" : match[1] === "-next-line" ? "next-line" : "block";
  // Strip the optional ` -- description` trailer ESLint allows on directives.
  const ruleText = (match[2] ?? "").split(/\s--\s/)[0].trim();
  if (ruleText === "") return { type, bare: true };
  const names = ruleText.split(",").map((r) => r.trim());
  return names.includes(TARGET_RULE) ? { type, bare: false } : null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid inline `eslint-disable` directives that suppress `@typescript-eslint/no-explicit-any`.",
    },
    schema: [],
    messages: {
      forbidden:
        "Do not disable `@typescript-eslint/no-explicit-any` inline. Fix the `any` instead of silencing the rule (RFC 0037).",
      // Reported at line 0 (see below); name the real line so it's findable.
      forbiddenBare:
        "Bare `eslint-disable` on line {{line}} disables every rule (including this one). Remove it; fix the `any` instead of silencing it (RFC 0037).",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const directive = classifyDirective(comment.value);
          if (!directive) continue;
          const selfSuppressing =
            directive.bare && (directive.type === "block" || directive.type === "line");
          if (selfSuppressing) {
            context.report({
              loc: { line: 0, column: 0 },
              messageId: "forbiddenBare",
              data: { line: String(comment.loc.start.line) },
            });
          } else {
            context.report({ loc: comment.loc, messageId: "forbidden" });
          }
        }
      },
    };
  },
};

export default rule;
