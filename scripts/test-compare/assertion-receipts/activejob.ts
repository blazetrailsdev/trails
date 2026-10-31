import type { AssertionReceipt } from "../assertion-receipts.js";

export const activejob: Record<string, AssertionReceipt[]> = {
  "activejob:cases/argument_serialization_test.rb › ArgumentSerializationTest › should maintain a functional duration":
    [
      {
        kind: "assert_kind_of",
        value: null,
        as: "assert_equal",
        reason:
          'argument_serialization_test.rb:215 `assert_kind_of Hash, duration.parts` — a Ruby Hash is a plain JS object (CLAUDE.md, "A Ruby Hash is a plain object unless it needs a `Hash` feature"), which no JS `instanceof` can test; the port asserts `rbObjIsKindOf(duration.parts, Hash)` equals true',
      },
    ],
};
