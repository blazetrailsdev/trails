/**
 * ESLint rule: no-raw-control-bytes
 *
 * A raw control byte (NUL and friends) in a `.ts` source makes every
 * grep-based tool treat the file as binary: `grep -rn` returns nothing and
 * `rg -n` prints only "binary file matches". Audits, ratchets, and agents that
 * grep for a symbol then get a *wrong* answer about that file — silently,
 * because tooling reading via `readFile(..., "utf8")` is unaffected.
 * `packages/activerecord/src/support/canonical-table-rebuild.ts` carried a raw
 * NUL for exactly this reason and hid its own exports from every grep.
 *
 * Intended control characters must be written as escapes (`\0`, `\t` in a
 * string, `\x1b`) so the source stays plain text. Tab and the line
 * terminators are allowed as literal bytes — they are ordinary whitespace and
 * do not trip binary detection.
 */

// C0 controls (except \t \n \r) plus DEL and the C1 range. Matching control
// characters is the whole point here, so `no-control-regex` does not apply.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu;

/** Human-readable name for a control byte, for the report message. */
function describe(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid raw control bytes in source; write them as escapes so the file stays plain text.",
    },
    schema: [],
    messages: {
      forbidden:
        "Raw control byte {{name}} in source makes grep/ripgrep treat this file as binary and skip it. Write it as an escape (e.g. `\\0`) instead.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        const text = sourceCode.getText();
        CONTROL_RE.lastIndex = 0;
        let match;
        while ((match = CONTROL_RE.exec(text)) !== null) {
          context.report({
            loc: sourceCode.getLocFromIndex(match.index),
            messageId: "forbidden",
            data: { name: describe(match[0].codePointAt(0)) },
          });
        }
      },
    };
  },
};

export default rule;
