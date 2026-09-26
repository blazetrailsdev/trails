// Reviewed receipts for Rails assertions a TS port genuinely cannot make, applied
// to the Rails side of a matched pair before parity:test compares assertion
// counts, kinds and values.
//
// A receipt is for a TypeScript LANGUAGE shortcoming only — a Ruby fact with no
// JS value to assert against (a JS string has no encoding tag; `2.0` and `2` are
// one JS number, so no `Float` exists to be a kind of). It is never a way to
// excuse a port bug: a converged assertion that fails is parked and filed under
// RFC 0155, not receipted here. Every row names the Rails `file:line` it covers.

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

/** Keyed by `<package>:<rails file> › <ancestors joined by " › "> › <test>`. */
export const ASSERTION_RECEIPTS: Record<string, AssertionReceipt[]> = {
  "activerecord:attributes_test.rb › CustomPropertiesTest › overloaded properties save": [
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert_equal",
      reason:
        "attributes_test.rb:43 `assert_kind_of Integer` — a JS number has no Integer class; the port asserts `Number.isInteger(...)` equals true",
    },
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert_equal",
      reason:
        'attributes_test.rb:45 `assert_kind_of Float` — a JS number has no Float class; the port asserts `rbObjClass(...)` equals "Float", the boxed Float seat FloatType#castValue produces',
    },
  ],
  "activesupport:core_ext/duration_test.rb › DurationTest › is a": [
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert",
      reason:
        "core_ext/duration_test.rb:17 `assert_kind_of Numeric` — a Duration is an object and cannot be `instanceof` the JS `Number` builtin; the port asserts `d.isKindOf(Number)`, which is Rails' `value.is_a?(klass)` (duration.rb:330-332)",
    },
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert",
      reason:
        "core_ext/duration_test.rb:18 `assert_kind_of Integer` — a JS number has no Integer class; the port asserts `Number.isInteger(d.toI())`",
    },
  ],
  "activesupport:json/encoding_test.rb › TestJSONEncoding › utf8 string encoded properly": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        "json/encoding_test.rb:77 `result.encoding` — a JS string carries no encoding tag (ruby-compat/src/string/force-encoding.ts)",
    },
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        "json/encoding_test.rb:81 `result.encoding` — a JS string carries no encoding tag (ruby-compat/src/string/force-encoding.ts)",
    },
  ],
  "activesupport:core_ext/string_ext_test.rb › CoreExtStringMultibyteTest › string should recognize utf8 strings":
    [
      {
        kind: "assert_not_predicate",
        value: null,
        as: null,
        reason:
          'core_ext/string_ext_test.rb:799 `EUC_JP_STRING` — a JS string carries no encoding tag, so `"さよなら".encode("EUC-JP")` has no JS value distinct from the UTF-8 string (ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "activesupport:safe_buffer_test.rb › SafeBufferTest › Should not fail if the returned object is not a string":
    [
      {
        kind: "assert_kind_of",
        value: null,
        as: "assert_nil",
        reason:
          "safe_buffer_test.rb:195 `assert_kind_of NilClass` — JS `null` is not an instance of any class, and nil is NilClass's only instance, so the check is `assert_nil`",
      },
    ],
};

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
