import type { AssertionReceipt } from "../assertion-receipts.js";

export const erubi: Record<string, AssertionReceipt[]> = {
  "erubi:test.rb › Erubi › should escape all backslashes and apostrophes in text": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :bufvar and :freeze options": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :escape and :escapefunc options": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :escape option without :escapefunc option": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :escape_html and :escapefunc options": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :freeze_template_literals => true option": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :outvar and :freeze options": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :preamble and :postamble options": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle :trim => false option": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle <%% and <%# syntax": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle <%% with a different literal prefix/postfix": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle chain_appends option": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle ensure option": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
    {
      kind: "must_equal",
      value: "s:bar",
      as: null,
      reason:
        "test.rb:316 `@a.must_equal 'bar'` reads the binding the eval at test.rb:42 restored; with no Ruby `eval` there is no binding to read",
    },
  ],
  "erubi:test.rb › Erubi › should handle no options": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should handle no tags with frozen source": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
  "erubi:test.rb › Erubi › should strip only whitespace for <%, <%- and <%# tags": [
    {
      kind: "must_equal",
      value: null,
      as: null,
      reason:
        "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
    },
  ],
};
