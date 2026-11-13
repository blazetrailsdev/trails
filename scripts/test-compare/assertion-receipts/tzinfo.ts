import type { AssertionReceipt } from "../assertion-receipts.js";

const reason = (line: string): string =>
  `${line} \`refute(identifier.frozen?)\` — a JS string is a primitive and \`Object.isFrozen\` is true of every one, so no unfrozen identifier exists to refute (CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)")`;

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
};
