import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RuleTester } from "eslint";
import rule from "./ruby-compat-needs-mri-citation.mjs";
import { versionDir } from "../vendor/sources.ts";

// A stand-in for `vendor/ruby/<version>/` at the pinned SHA: one file, 20 lines. Reading
// the real (fetched, uncommitted) tree would make the outcome depend on whether
// the runner ran `pnpm vendor:fetch`.
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

const lockfile = new URL("../vendor/sources.lock.json", import.meta.url);
const version = versionDir(JSON.parse(fs.readFileSync(lockfile, "utf8")).sources.ruby.ref);

const cite = (line) => `vendor/ruby/${version}/rational.c:${line}`;

tester.run("ruby-compat-needs-mri-citation", rule, {
  valid: [
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
    `/**
 * Mirrors ${cite(3)}.
 *
 * @noRailsEquivalent PERMANENT
 */
import { x } from "./x.js";

export function add(a: number, b: number): number { return a + b + x; }`,
    `/**
 * ${cite(4)}
 *
 * @noRailsEquivalent PERMANENT
 */
export default class Rational {}`,
    // Unversioned still resolves against the active version until the RFC 0159
    // recite sweeps land.
    `/**
 * Mirrors vendor/ruby/rational.c:12.
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
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
 * Mirrors vendor/ruby/${version}/nosuch.c:3.
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "unknownFile" }],
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
    {
      code: `/**
 * Mirrors vendor/ruby/v0.0.1/rational.c:12.
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [
        {
          messageId: "staleVersion",
          data: { name: "add", cited: "v0.0.1", rel: "rational.c", version },
        },
      ],
    },
    {
      // A versioned citation's `rel` is relative to the version directory, so
      // the segment is not read as part of the cited path.
      code: `/**
 * Mirrors ${cite(12)} and vendor/ruby/v0.0.1/rational.c:12.
 *
 * @noRailsEquivalent PERMANENT
 */
export function add(a: number, b: number): number { return a + b; }`,
      errors: [{ messageId: "staleVersion" }],
    },
    {
      code: `export default class Rational {}`,
      errors: [{ messageId: "missingReceipt" }],
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
    `/**
 * Mirrors vendor/ruby/v0.0.1/rational.c:3.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Rational {}`,
  ],
  invalid: [],
});
