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
};
