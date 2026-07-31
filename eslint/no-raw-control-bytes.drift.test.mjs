import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

/**
 * `blazetrails/no-raw-control-bytes` and `scripts/ci/check-control-bytes.sh`
 * enforce the same byte set over disjoint halves of the tree, but express it
 * in two alphabets: the rule matches decoded codepoints, the script matches
 * raw bytes under `LC_ALL=C`, so C1 has to be re-encoded as UTF-8. Widening
 * one alone leaves the other narrower — a silent hole in exactly the guard
 * that exists to prevent silently wrong answers. Both sides are derived from
 * their real sources here rather than restated.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** Pull a `const CONTROL_RE = ...` definition out of a source file. */
async function readControlRe(file, pattern) {
  const source = await fs.readFile(path.join(here, "..", file), "utf8");
  const match = source.match(pattern);
  expect(match, `no CONTROL_RE found in ${file}`).not.toBeNull();
  return match[1];
}

/** Codepoints the ESLint rule's regex flags. */
function eslintFlagged(literal) {
  const [, body, flags] = literal.match(/^\/(.*)\/([a-z]*)$/u);
  const re = new RegExp(body, flags.replace("g", ""));
  return codePoints().filter((cp) => re.test(String.fromCodePoint(cp)));
}

/**
 * Codepoints the shell regex flags. PCRE `\xNN` under `LC_ALL=C` is
 * a byte, so encoding each codepoint as UTF-8 and mapping those bytes 1:1 to
 * latin-1 characters lets the shell pattern run unmodified as a JS regex.
 */
function shellFlagged(pattern) {
  const re = new RegExp(pattern, "u");
  const encoder = new TextEncoder();
  return codePoints().filter((cp) => {
    const bytes = encoder.encode(String.fromCodePoint(cp));
    return re.test(String.fromCharCode(...bytes));
  });
}

/**
 * The whole of Unicode, not just latin-1: a plausible widening reaches for
 * U+FEFF or the U+2028/U+2029 line separators, and those are precisely the
 * ones whose UTF-8 re-encoding on the shell side is easy to get wrong.
 */
function codePoints() {
  return Array.from({ length: 0x110000 }, (_unused, cp) => cp);
}

describe("no-raw-control-bytes", () => {
  it("forbids the same bytes as scripts/ci/check-control-bytes.sh", async () => {
    const eslintLiteral = await readControlRe(
      "eslint/no-raw-control-bytes.mjs",
      /^const CONTROL_RE = (\/.*\/[a-z]*);$/mu,
    );
    const shellPattern = await readControlRe(
      "scripts/ci/check-control-bytes.sh",
      /^CONTROL_RE='(.*)'$/mu,
    );

    const flagged = eslintFlagged(eslintLiteral);
    expect(flagged).toEqual(shellFlagged(shellPattern));
    // Anchor the shared set so a matching pair of edits still has to be
    // deliberate: C0 except tab/LF/CR, plus DEL and C1.
    expect(flagged).toHaveLength(62);
    expect(flagged).not.toContain(0x09);
    expect(flagged).toContain(0x00);
    expect(flagged).toContain(0x7f);
    expect(flagged).toContain(0x9f);
  });
});
