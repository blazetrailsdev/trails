// Reviewed receipts for Rails assertions a TS port genuinely cannot make, applied
// to the Rails side of a matched pair before parity:test compares assertion
// counts, kinds and values.
//
// A receipt is for a TypeScript LANGUAGE shortcoming only — a Ruby fact with no
// JS value to assert against (a JS string has no encoding tag; `2.0` and `2` are
// one JS number, so no `Float` exists to be a kind of). It is never a way to
// excuse a port bug: a converged assertion that fails is parked and filed under
// RFC 0155, not receipted here. Every row names the Rails `file:line` it covers.

import { actioncontroller } from "./assertion-receipts/actioncontroller.js";
import { actiondispatch } from "./assertion-receipts/actiondispatch.js";
import { actionview } from "./assertion-receipts/actionview.js";
import { activejob } from "./assertion-receipts/activejob.js";
import { activemodel } from "./assertion-receipts/activemodel.js";
import { activerecord } from "./assertion-receipts/activerecord.js";
import { activesupport } from "./assertion-receipts/activesupport.js";
import { mail } from "./assertion-receipts/mail.js";
import { msgpack } from "./assertion-receipts/msgpack.js";
import { rack } from "./assertion-receipts/rack.js";
import { rake } from "./assertion-receipts/rake.js";
import { rubyCompat } from "./assertion-receipts/ruby-compat.js";
import { trailties } from "./assertion-receipts/trailties.js";

/** One Rails assertion the port cannot make. */
export interface AssertionReceipt {
  /** Raw Rails assertion name the receipt consumes (`assert_kind_of`). */
  kind: string;
  /**
   * The Rails expected-value token the consumed assertion carries (`null` for a
   * non-literal argument such as a constant). Picks WHICH occurrence of `kind`
   * the receipt consumes, so the lockstep values stay aligned.
   */
  value: string | null;
  /**
   * `null` drops the assertion: there is nothing the port can assert. A kind
   * name re-scores it as that Rails assertion, for a Ruby check whose only JS
   * spelling is a different assertion (`kind_of?(Integer)` is
   * `Number.isInteger`, an equality).
   */
  as: string | null;
  /** Why this is a language shortcoming, with the Rails `file:line`. */
  reason: string;
}

/** One record per file in `assertion-receipts/`, keyed by the file's package. */
export const ASSERTION_RECEIPTS_BY_PACKAGE: Record<string, Record<string, AssertionReceipt[]>> = {
  actioncontroller,
  actiondispatch,
  actionview,
  activejob,
  activemodel,
  activerecord,
  activesupport,
  mail,
  msgpack,
  rack,
  rake,
  "ruby-compat": rubyCompat,
  trailties,
};

/**
 * Keyed by `<package>:<rails file> › <ancestors joined by " › "> › <test>`. Rows
 * live in `assertion-receipts/<package>.ts`, sorted by key.
 */
export const ASSERTION_RECEIPTS: Record<string, AssertionReceipt[]> = Object.assign(
  {},
  ...Object.values(ASSERTION_RECEIPTS_BY_PACKAGE),
);

interface ReceiptableTestCase {
  description: string;
  ancestors: string[];
  assertionCount?: number;
  assertionKinds?: string[];
  assertionValues?: (string | null)[];
}

/**
 * The receipt key for a Rails test case: package, Rails file, ancestor chain
 * and description.
 */
export function assertionReceiptKey(pkg: string, file: string, tc: ReceiptableTestCase): string {
  return [`${pkg}:${file}`, ...tc.ancestors, tc.description].join(" › ");
}

/**
 * Apply the receipts filed for `tc` to its Rails-side assertion data, returning
 * a new test case. Each receipt consumes the first remaining assertion matching
 * its `kind` and `value`; a receipt that matches nothing is left unconsumed and
 * reported by `unconsumedAssertionReceipts`, so a stale row cannot linger.
 */
export function applyAssertionReceipts<T extends ReceiptableTestCase>(
  pkg: string,
  file: string,
  tc: T,
  receipts: Record<string, AssertionReceipt[]> = ASSERTION_RECEIPTS,
  consumed?: Set<string>,
): T {
  const key = assertionReceiptKey(pkg, file, tc);
  const rows = receipts[key];
  if (!rows || !tc.assertionKinds) return tc;
  const kinds = [...tc.assertionKinds];
  const values = [...(tc.assertionValues ?? kinds.map(() => null))];
  let count = tc.assertionCount ?? kinds.length;
  rows.forEach((row, i) => {
    const at = kinds.findIndex((k, j) => k === row.kind && (values[j] ?? null) === row.value);
    if (at < 0) return;
    consumed?.add(`${key}#${i}`);
    if (row.as === null) {
      kinds.splice(at, 1);
      values.splice(at, 1);
      count--;
    } else {
      kinds[at] = row.as;
      values[at] = null;
    }
  });
  return { ...tc, assertionCount: count, assertionKinds: kinds, assertionValues: values };
}

/** Receipt rows (`<key>#<index>`) that consumed no Rails assertion. */
export function unconsumedAssertionReceipts(
  consumed: Set<string>,
  receipts: Record<string, AssertionReceipt[]> = ASSERTION_RECEIPTS,
): string[] {
  const stale: string[] = [];
  for (const [key, rows] of Object.entries(receipts)) {
    rows.forEach((_row, i) => {
      if (!consumed.has(`${key}#${i}`)) stale.push(`${key}#${i}`);
    });
  }
  return stale;
}
