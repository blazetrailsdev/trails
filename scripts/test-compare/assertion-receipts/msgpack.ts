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
  "msgpack:msgpack_spec.rb › in compatibility mode › does not use the bin types": [
    {
      kind: "should_start_with",
      value: null,
      as: "assert_equal",
      reason:
        "msgpack_spec.rb:153 `should start_with` on an ASCII-8BIT String — a Uint8Array has no prefix matcher, so the port asserts the leading bytes' `subarray` with toEqual",
    },
  ],
  "msgpack:msgpack_spec.rb › in compatibility mode › does not use the str8 type": [
    {
      kind: "should_start_with",
      value: null,
      as: "assert_equal",
      reason:
        "msgpack_spec.rb:158 `should start_with` on an ASCII-8BIT String — a Uint8Array has no prefix matcher, so the port asserts the leading bytes' `subarray` with toEqual",
    },
  ],
  "msgpack:packer_spec.rb › doesn't allow #dup or #clone": [
    {
      kind: "expect_not_to_respond_to",
      value: "s:dup",
      as: "assert_equal",
      reason:
        "packer_spec.rb:577 `expect(subject).to_not respond_to :dup` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
    {
      kind: "expect_not_to_respond_to",
      value: "s:clone",
      as: "assert_equal",
      reason:
        "packer_spec.rb:578 `expect(subject).to_not respond_to :clone` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
  ],
  "msgpack:packer_spec.rb › in compatibility mode › does not use the bin types": [
    {
      kind: "should_start_with",
      value: null,
      as: "assert_equal",
      reason:
        "packer_spec.rb:284 `should start_with` on an ASCII-8BIT String — a Uint8Array has no prefix matcher, so the port asserts the leading bytes' `subarray` with toEqual",
    },
    {
      kind: "should_start_with",
      value: null,
      as: "assert_equal",
      reason:
        "packer_spec.rb:288 `should start_with` on an ASCII-8BIT String — a Uint8Array has no prefix matcher, so the port asserts the leading bytes' `subarray` with toEqual",
    },
  ],
  "msgpack:packer_spec.rb › in compatibility mode › does not use the str8 type": [
    {
      kind: "should_start_with",
      value: null,
      as: "assert_equal",
      reason:
        "packer_spec.rb:294 `should start_with` on an ASCII-8BIT String — a Uint8Array has no prefix matcher, so the port asserts the leading bytes' `subarray` with toEqual",
    },
  ],
  "msgpack:unpacker_spec.rb › MessagePack.unpack symbolize_keys preserve encoding": [
    {
      kind: "should_==",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:321 `.encoding.should ==` — a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
    {
      kind: "should_==",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:323 `.encoding.should ==` — a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
    {
      kind: "should_==",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:325 `.encoding.should ==` — a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
    {
      kind: "should_==",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:327 `.encoding.should ==` — a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
  "msgpack:unpacker_spec.rb › doesn't allow #dup or #clone": [
    {
      kind: "expect_not_to_respond_to",
      value: "s:dup",
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:885 `expect(subject).to_not respond_to :dup` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
    {
      kind: "expect_not_to_respond_to",
      value: "s:clone",
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:886 `expect(subject).to_not respond_to :clone` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
  ],
  "msgpack:unpacker_spec.rb › doesn't leak when a recursive unpacker raises": [
    {
      kind: "expect_to_eq",
      value: null,
      as: null,
      reason:
        "unpacker_spec.rb:943 compares `ObjectSpace.memsize_of(unpacker)` — V8 exposes no per-object allocation size, as on JRuby (unpacker_spec.rb:905)",
    },
  ],
  "msgpack:unpacker_spec.rb › extensions › freeze › can freeze objects when using #each": [
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:765 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:765 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:765 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:765 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:765 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:765 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:765 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:765 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:765 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:765 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "msgpack:unpacker_spec.rb › extensions › freeze › can freeze objects when using #feed_each": [
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:790 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:790 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:790 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:790 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:790 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:790 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:790 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:790 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:790 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:790 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "msgpack:unpacker_spec.rb › extensions › freeze › can freeze objects when using .unpack": [
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:746 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:746 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:746 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:746 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_frozen",
      value: null,
      as: "assert_equal",
      reason:
        "unpacker_spec.rb:746 `should be_frozen` — vitest has no frozen matcher; the port asserts `Object.isFrozen(...)` equals true",
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:746 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:746 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:746 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:746 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "should_be_equal",
      value: null,
      as: null,
      reason:
        'unpacker_spec.rb:746 `should be_equal` on an interned String — a JS string primitive has no identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "msgpack:unpacker_spec.rb › extensions › string encoding › decodes binary as ascii-8bit when using #feed_each":
    [
      {
        kind: "should_==",
        value: null,
        as: null,
        reason:
          'unpacker_spec.rb:879 `.encoding.should ==` — a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
      },
    ],
  "msgpack:unpacker_spec.rb › extensions › string encoding › decodes string as utf-8 when using #feed":
    [
      {
        kind: "should_==",
        value: null,
        as: null,
        reason:
          'unpacker_spec.rb:868 `.encoding.should ==` — a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
      },
    ],
};
