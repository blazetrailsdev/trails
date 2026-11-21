import type { AssertionReceipt } from "../assertion-receipts.js";

const reason = (line: string): string =>
  `${line} \`refute(identifier.frozen?)\` — a JS string is a primitive and \`Object.isFrozen\` is true of every one, so no unfrozen identifier exists to refute (CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)")`;

const STRINGS = 'CLAUDE.md, "Ruby Strings are JS string primitives (no mutable String carrier)"';

const dedupeTestsReceipts: AssertionReceipt[] = [
  {
    kind: "refute_same",
    value: null,
    as: null,
    reason: `tc_string_deduper.rb:50 \`refute_same(s1, s2)\` — \`s1.dup\` has no identity of its own on a JS string (${STRINGS})`,
  },
  {
    kind: "refute_same",
    value: null,
    as: null,
    reason: `tc_string_deduper.rb:51 \`refute_same(s1, s3)\` — the same \`dup\` identity (${STRINGS})`,
  },
  {
    kind: "assert_equal",
    value: "b:false",
    as: null,
    reason: `tc_string_deduper.rb:52 \`assert_equal(false, s1.frozen?)\` — every JS string is frozen (${STRINGS})`,
  },
  {
    kind: "assert_equal",
    value: "b:false",
    as: null,
    reason: `tc_string_deduper.rb:53 \`assert_equal(false, s2.frozen?)\` — every JS string is frozen (${STRINGS})`,
  },
  {
    kind: "refute_same",
    value: null,
    as: null,
    reason: `tc_string_deduper.rb:59 \`refute_same(s1, r1)\` — equal JS strings are the same value (${STRINGS})`,
  },
  {
    kind: "assert_equal",
    value: "b:false",
    as: null,
    reason: `tc_string_deduper.rb:60 \`assert_equal(false, s1.frozen?)\` — every JS string is frozen (${STRINGS})`,
  },
  {
    kind: "assert_equal",
    value: "b:false",
    as: null,
    reason: `tc_string_deduper.rb:65 \`assert_equal(false, s2.frozen?)\` — every JS string is frozen (${STRINGS})`,
  },
];

export const tzinfo: Record<string, AssertionReceipt[]> = {
  "tzinfo:data_sources/tc_constant_offset_data_timezone_info.rb › TCConstantOffsetDataTimezoneInfo › initialize":
    [
      {
        kind: "refute",
        value: null,
        as: null,
        reason: reason("data_sources/tc_constant_offset_data_timezone_info.rb:14"),
      },
    ],
  "tzinfo:data_sources/tc_transitions_data_timezone_info.rb › TCTransitionsDataTimezoneInfo › initialize transitions":
    [
      {
        kind: "refute",
        value: null,
        as: null,
        reason: reason("data_sources/tc_transitions_data_timezone_info.rb:22"),
      },
    ],
  "tzinfo:tc_string_deduper.rb › TCStringDeduper › concurrent string deduper dedupe":
    dedupeTestsReceipts,
  "tzinfo:tc_string_deduper.rb › TCStringDeduper › global dedupe": dedupeTestsReceipts,
  "tzinfo:tc_string_deduper.rb › TCStringDeduper › string deduper dedupe": dedupeTestsReceipts,
  "tzinfo:tc_string_deduper.rb › TCStringDeduper › unary minus global string deduper":
    dedupeTestsReceipts,
};
