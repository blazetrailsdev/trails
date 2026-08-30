import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RuleTester } from "eslint";
import rule from "./ruby-compat-needs-mri-citation.mjs";

// A stand-in for `vendor/ruby/` at the pinned SHA: one file, 20 lines. The real
// tree is fetched rather than committed, so reading it would make the outcome
// depend on whether the runner had run `pnpm vendor:fetch`.
const vendorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-compat-citation-"));
fs.writeFileSync(path.join(vendorRoot, "rational.c"), "x\n".repeat(20));

const languageOptions = {
  parser: (await import("typescript-eslint")).parser,
  ecmaVersion: 2022,
  sourceType: "module",
};

const tester = new RuleTester({
  languageOptions,
  settings: { rubyCompatVendorRoot: vendorRoot },
});

// The vendor tree is fetched, not committed: with it absent the rule reports
// nothing at all, so a contributor who has not fetched it is not blocked by a
// citation they wrote correctly.
const withoutVendorTree = new RuleTester({
  languageOptions,
  settings: { rubyCompatVendorRoot: null },
});

const cite = (line) => `vendor/ruby/rational.c:${line}`;

tester.run("ruby-compat-needs-mri-citation", rule, {
  valid: [
    // Both halves, and the cited line is within the pinned file.
    `/**
 * Mirrors ${cite(12)} (nurat_add).
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
    // A class export, cited the same way.
    `/**
 * Mirrors ${cite(1)}.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Rational {}`,
    // A file-level receipt-and-citation block covers the declarations below it,
    // the way the extractor reads a file-level `@noRailsEquivalent`.
    `/**
 * Mirrors ${cite(3)}.
 *
 * @noRailsEquivalent PERMANENT
 */
import { x } from "./x.js";

export function add(a: number, b: number): number { return a + b + x; }`,
    // Not exported: not part of the package's surface.
    `function add(a: number, b: number): number { return a + b; }`,
    // An interface is exempt by kind in `parity:api:extra`.
    `export interface Rational { numerator: number; }`,
  ],
  invalid: [
    {
      code: `/**
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "missingCitation" }],
    },
    {
      code: `/**
 * Mirrors ${cite(12)}.
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "missingReceipt" }],
    },
    {
      // CONVERGEABLE is a category error here: there is no Rails method for a
      // Ruby primitive to converge onto.
      code: `/**
 * Mirrors ${cite(12)}.
 *
 * @noRailsEquivalent CONVERGEABLE ruby-compat-move-rational
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "missingReceipt" }],
    },
    {
      code: `/**
 * Mirrors ${cite(21)}.
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "lineOutOfRange" }],
    },
    {
      code: `/**
 * Mirrors vendor/ruby/nosuch.c:3.
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "unknownFile" }],
    },
  ],
});

withoutVendorTree.run("ruby-compat-needs-mri-citation (vendor/ruby absent)", rule, {
  valid: [
    `export function add(a: number, b: number): number { return a + b; }`,
    `/**
 * Mirrors vendor/ruby/nosuch.c:3.
 */
export class Rational {}`,
  ],
  invalid: [],
});
