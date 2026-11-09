import type { AssertionReceipt } from "../assertion-receipts.js";

const checkOutputEval: AssertionReceipt = {
  kind: "must_equal",
  value: null,
  as: null,
  reason:
    "test.rb:42 `eval(tsrc, block.binding).must_equal result` (check_output) — the engine's src is Ruby source, and a JS runtime has no Ruby `eval` to run it; the port asserts the src comparison only",
};

export const erubi: Record<string, AssertionReceipt[]> = {
  "erubi:test.rb › Erubi › Erubi::CaptureBlockEngine › should allow <%= and <% for escaped capturing with :escape => ":
    [checkOutputEval],
  "erubi:test.rb › Erubi › Erubi::CaptureBlockEngine › should allow <%= and <% for unescaped capturing when with :escape => ":
    [checkOutputEval],
  "erubi:test.rb › Erubi › Erubi::CaptureBlockEngine › should handle empty tags by concatening empty string":
    [checkOutputEval],
  "erubi:test.rb › Erubi › Erubi::CaptureBlockEngine › should work as specified in documentation": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should allow <%|= and <%| for capturing when with :escape => ": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should allow <%|= and <%| for capturing with :escape_capture =>  and :escape => ":
    [checkOutputEval],
  "erubi:test.rb › Erubi › should allow <%|= and <%| for nested capturing when with :escape => ": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should escape all backslashes and apostrophes in text": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should handle :bufvar and :freeze options": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle :escape and :escapefunc options": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle :escape option without :escapefunc option": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should handle :escape_html and :escapefunc options": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle :freeze_template_literals => false option": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should handle :freeze_template_literals => true option": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should handle :outvar and :freeze options": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle :preamble and :postamble options": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle :trim => false option": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle <%% and <%# syntax": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle <%% with a different literal prefix/postfix": [
    checkOutputEval,
  ],
  "erubi:test.rb › Erubi › should handle chain_appends option": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle ensure option": [
    checkOutputEval,
    {
      kind: "must_equal",
      value: "s:bar",
      as: null,
      reason:
        "test.rb:316 `@a.must_equal 'bar'` reads the binding the eval at test.rb:42 restored; with no Ruby `eval` there is no binding to read",
    },
  ],
  "erubi:test.rb › Erubi › should handle ensure option with no bufvar": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle loops in <%|= and <%| for capturing when with :escape => ":
    [checkOutputEval],
  "erubi:test.rb › Erubi › should handle no options": [checkOutputEval],
  "erubi:test.rb › Erubi › should handle no tags with frozen source": [checkOutputEval],
  "erubi:test.rb › Erubi › should respect the :yield_returns_buffer option for making templates return the (potentially modified) buffer":
    [checkOutputEval, checkOutputEval],
  "erubi:test.rb › Erubi › should respect the :yield_returns_buffer option for making templates return the (potentially modified) buffer as the result of the block":
    [checkOutputEval, checkOutputEval],
  "erubi:test.rb › Erubi › should strip only whitespace for <%, <%- and <%# tags": [
    checkOutputEval,
  ],
};
