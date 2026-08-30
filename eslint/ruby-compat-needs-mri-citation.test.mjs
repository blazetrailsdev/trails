import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RuleTester } from "eslint";
import rule from "./ruby-compat-needs-mri-citation.mjs";

// A stand-in for `vendor/ruby/` at the pinned SHA: one file, 20 lines. Reading
// the real (fetched, uncommitted) tree would make the outcome depend on whether
// the runner had run `pnpm vendor:fetch`.
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

// With the vendor tree absent the rule reports nothing at all, so a contributor
// who has not fetched it is not blocked by a citation they wrote correctly.
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
    `/**
 * Mirrors ${cite(1)}.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Rational {}`,
    // A file-level block covers the declarations below it.
    `/**
 * Mirrors ${cite(3)}.
 *
 * @noRailsEquivalent PERMANENT
 */
import { x } from "./x.js";

export function add(a: number, b: number): number { return a + b + x; }`,
    // Not exported, and an interface: neither is measured surface.
    `function add(a: number, b: number): number { return a + b; }`,
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
      // CONVERGEABLE is a category error here: nothing to converge onto.
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
