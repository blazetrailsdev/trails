import type { AssertionReceipt } from "../assertion-receipts.js";

export const activemodel: Record<string, AssertionReceipt[]> = {
  "activemodel:attribute_methods_test.rb › AttributeMethodsTest › should not interfere with respond_to? if the attribute has a private/protected method":
    [
      {
        kind: "assert_not_respond_to",
        value: null,
        as: null,
        reason:
          'attribute_methods_test.rb:319 `assert_not_respond_to m, :private_method` — a JS method entry carries no visibility, so a defined method answers `respond_to?` at both arities (CLAUDE.md, "Method visibility is compile-time only")',
      },
    ],
  "activemodel:attribute_set_test.rb › AttributeSetTest › deep_duping creates a new hash and dups each attribute":
    [
      {
        kind: "assert_equal",
        value: "s:foobar",
        as: null,
        reason:
          'attribute_set_test.rb:68 `assert_equal "foobar", duped[:bar].value` — reads the `duped[:bar].value << "bar"` of :63; a JS string has no in-place append (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
    ],
  "activemodel:attribute_set_test.rb › AttributeSetTest › duping creates a new hash, but does not dup the attributes":
    [
      {
        kind: "assert_equal",
        value: "s:foobar",
        as: null,
        reason:
          'attribute_set_test.rb:49 `assert_equal "foobar", attributes[:bar].value` — reads the `duped[:bar].value << "bar"` of :45 through the shared Attribute; a JS string has no in-place append (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
      {
        kind: "assert_equal",
        value: "s:foobar",
        as: null,
        reason:
          'attribute_set_test.rb:50 `assert_equal "foobar", duped[:bar].value` — the same in-place append (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
    ],
  "activemodel:attributes_dirty_test.rb › AttributesDirtyTest › attribute mutation": [
    {
      kind: "assert_predicate",
      value: null,
      as: null,
      reason:
        'attributes_dirty_test.rb:72 `assert_predicate @model, :name_changed?` — true only after `@model.name.replace("Hadad")` at :71 mutates the receiver; a JS string cannot be mutated (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "activemodel:type/string_test.rb › StringTest › values are duped coming out": [
    {
      kind: "assert_not_same",
      value: null,
      as: null,
      reason:
        'type/string_test.rb:39 `assert_not_same s, type.cast(s)` — two equal JS string primitives are one value, with no identity to differ (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "assert_not_same",
      value: null,
      as: null,
      reason:
        'type/string_test.rb:41 `assert_not_same s, type.deserialize(s)` — the same missing identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
};
