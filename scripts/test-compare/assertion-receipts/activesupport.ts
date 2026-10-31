import type { AssertionReceipt } from "../assertion-receipts.js";

export const activesupport: Record<string, AssertionReceipt[]> = {
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
  "activesupport:core_ext/module_test.rb › ModuleTest › delegation arity to self class": [
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:662 `assert_equal(-1, d.instance_method(:opt).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:663 `assert_equal(-1, d.instance_method(:kwargs).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:664 `assert_equal(-1, d.instance_method(:kwargs_with_block).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:665 `assert_equal(-1, d.instance_method(:opt_kwargs).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:666 `assert_equal(-1, d.instance_method(:opt_kwargs_with_block).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
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
