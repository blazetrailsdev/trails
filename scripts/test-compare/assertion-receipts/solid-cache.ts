import type { AssertionReceipt } from "../assertion-receipts.js";

export const solidCache: Record<string, AssertionReceipt[]> = {
  "solid-cache:unit/behaviors_rails_8_0/cache_store_format_version_behavior.rb › format version  uses correct signature for compressed entries":
    [
      {
        kind: "assert_operator",
        value: null,
        as: "assert",
        reason:
          'solid_cache/v1.0.9/test/unit/behaviors_rails_8_0/cache_store_format_version_behavior.rb:57 `assert_operator serialized, :start_with?, compressed_signature` — an ASCII-8BIT String is a `Uint8Array`, which has no `start_with?` member for `assert_operator` to send (CLAUDE.md, "A String has no encoding tag either"); the port asserts `rbStrStartWith(serialized, signature)`',
      },
    ],
  "solid-cache:unit/behaviors_rails_8_0/cache_store_format_version_behavior.rb › format version  uses correct signature for uncompressed entries":
    [
      {
        kind: "assert_operator",
        value: null,
        as: "assert",
        reason:
          'solid_cache/v1.0.9/test/unit/behaviors_rails_8_0/cache_store_format_version_behavior.rb:47 `assert_operator serialized, :start_with?, uncompressed_signature` — an ASCII-8BIT String is a `Uint8Array`, which has no `start_with?` member for `assert_operator` to send (CLAUDE.md, "A String has no encoding tag either"); the port asserts `rbStrStartWith(serialized, signature)`',
      },
    ],
};
