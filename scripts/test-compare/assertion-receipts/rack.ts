import type { AssertionReceipt } from "../assertion-receipts.js";

export const rack: Record<string, AssertionReceipt[]> = {
  "rack:spec_multipart.rb › falls back to content-type for the name": [
    {
      kind: "must_equal",
      value: "n:26473",
      as: null,
      reason:
        'spec_multipart.rb:1030 `f.length` is the byte size of an image/png part that tag_multipart_encoding re-tags UTF-8 (parser.rb:483); with no tag to set, forceEncoding must decode, and invalid UTF-8 cannot survive as a JS string (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
  "rack:spec_multipart.rb › parses multipart/mixed": [
    {
      kind: "must_be_instance_of",
      value: null,
      as: "must_equal",
      reason:
        'spec_multipart.rb:517 `must_be_instance_of String` — a Ruby String is a JS string primitive, which is not `instanceof String`, so its `typeof` is asserted (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "rack:spec_request.rb › RackRequestTest › TestProxyRequest › return values for the keys in the order given from values_at":
    [
      {
        kind: "assert_output",
        value: "x:nil",
        as: "assert_match",
        reason:
          "spec_request.rb:802 `assert_output(nil, /deprecated/)` swaps `$stderr` for a StringIO; Node's stderr is a stream with no reassignable global, so the port captures the `Kernel#warn` call that writes it and matches its message",
      },
    ],
  "rack:spec_request.rb › RackRequestTest › return values for the keys in the order given from values_at":
    [
      {
        kind: "assert_output",
        value: "x:nil",
        as: "assert_match",
        reason:
          "spec_request.rb:802 `assert_output(nil, /deprecated/)` swaps `$stderr` for a StringIO; Node's stderr is a stream with no reassignable global, so the port captures the `Kernel#warn` call that writes it and matches its message",
      },
    ],
};
