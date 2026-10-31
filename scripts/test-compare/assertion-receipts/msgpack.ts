import type { AssertionReceipt } from "../assertion-receipts.js";

export const msgpack: Record<string, AssertionReceipt[]> = {
  "msgpack:cruby/buffer_spec.rb › doesn't allow #dup or #clone": [
    {
      kind: "expect_not_to_respond_to",
      value: "s:dup",
      as: "assert_equal",
      reason:
        "cruby/buffer_spec.rb:594 `expect(subject).to_not respond_to :dup` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
    {
      kind: "expect_not_to_respond_to",
      value: "s:clone",
      as: "assert_equal",
      reason:
        "cruby/buffer_spec.rb:595 `expect(subject).to_not respond_to :clone` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
  ],
};
