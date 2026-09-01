import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Linter } from "eslint";
import ts from "typescript";
import { parser } from "typescript-eslint";
import rule from "../../eslint/ruby-compat-needs-mri-citation.mjs";
import { keptLineLeadingTag } from "../../eslint/no-freeform-comments.mjs";
import { hasReceipt } from "../../eslint/unbacked-internal-needs-receipt.mjs";
import { noRailsEquivalentReason } from "./extract-ts-api.js";

/** A stand-in for `vendor/ruby/` at the pinned SHA, as the rule's own test
 *  builds one: reading the fetched tree would make the outcome depend on
 *  whether the runner ran `pnpm vendor:fetch`. */
const vendorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jsdoc-tag-line-"));
fs.writeFileSync(path.join(vendorRoot, "rational.c"), "x\n".repeat(20));

const linter = new Linter();

/** True when `blazetrails/ruby-compat-needs-mri-citation` credits a receipt. */
function lintCredits(source: string): boolean {
  const messages = linter.verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: { blazetrails: { rules: { "ruby-compat-needs-mri-citation": rule } } },
      languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
      settings: { rubyCompatVendorRoot: vendorRoot },
      rules: { "blazetrails/ruby-compat-needs-mri-citation": "error" },
    },
    "t.ts",
  );
  return !messages.some((m) => m.message.includes("@noRailsEquivalent PERMANENT` receipt"));
}

/** True when the extractor credits the same receipt. */
function extractorCredits(source: string): boolean {
  const sf = ts.createSourceFile("t.ts", source, ts.ScriptTarget.Latest, true);
  return noRailsEquivalentReason(sf.statements[0]) !== undefined;
}

/** True when `blazetrails/no-freeform-comments` keeps the receipt as a tag
 *  rather than reducing it away as prose. Its one-line branch is deliberately
 *  looser — a one-line block has no leading position to occupy — so only the
 *  multi-line forms are compared. */
function noFreeformCommentsCredits(source: string): boolean {
  const lines = source.slice(source.indexOf("/**"), source.indexOf("*/")).split("\n");
  return lines.some((line) => keptLineLeadingTag(line)?.name === "noRailsEquivalent");
}

/** True when `blazetrails/unbacked-internal-needs-receipt` credits a receipt. */
function unbackedInternalCredits(source: string): boolean {
  return hasReceipt(source.slice(source.indexOf("/**") + 2, source.indexOf("*/")));
}

const body = `export function add(a: number, b: number): number { return a + b; }`;

const forms: Record<string, string> = {
  "own line": `/**
 * Ruby \`Rational#+\` (\`vendor/ruby/rational.c:12\`).
 * @noRailsEquivalent PERMANENT — Ruby core.
 */
${body}`,
  "closing line": `/**
 * Ruby \`Rational#+\` (\`vendor/ruby/rational.c:12\`).
 * @noRailsEquivalent PERMANENT — Ruby core. */
${body}`,
  "two-space continuation": `/**
 * Ruby \`Rational#+\` (\`vendor/ruby/rational.c:12\`).
 *  @noRailsEquivalent PERMANENT — Ruby core.
 */
${body}`,
  "two-space continuation on the closing line": `/**
 * Ruby \`Rational#+\` (\`vendor/ruby/rational.c:12\`).
 *  @noRailsEquivalent PERMANENT — Ruby core. */
${body}`,
  "one-line comment": `/** Ruby \`Rational#+\` (\`vendor/ruby/rational.c:12\`). @noRailsEquivalent PERMANENT — Ruby core. */
${body}`,
};

describe("@noRailsEquivalent tag parse", () => {
  for (const [name, source] of Object.entries(forms)) {
    it(`reaches the same verdict in the lint rule and the extractor: ${name}`, () => {
      expect(lintCredits(source)).toBe(extractorCredits(source));
    });

    it(`reaches the same verdict in unbacked-internal-needs-receipt: ${name}`, () => {
      expect(unbackedInternalCredits(source)).toBe(extractorCredits(source));
    });

    if (name !== "one-line comment") {
      it(`reaches the same verdict in no-freeform-comments: ${name}`, () => {
        expect(noFreeformCommentsCredits(source)).toBe(extractorCredits(source));
      });
    }
  }

  it("credits a tag that opens its line, closing the block or not", () => {
    expect(extractorCredits(forms["own line"])).toBe(true);
    expect(extractorCredits(forms["closing line"])).toBe(true);
  });

  it("credits no tag on a hang-indented continuation line", () => {
    expect(extractorCredits(forms["two-space continuation"])).toBe(false);
    expect(extractorCredits(forms["two-space continuation on the closing line"])).toBe(false);
  });
});
