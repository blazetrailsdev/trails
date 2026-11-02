import type { AssertionReceipt } from "../assertion-receipts.js";

const reason =
  "test_unload.rb:101,109 read `__inceptions`; `Registry::Inceptions` has no port (RFC 0213).";

export const zeitwerk: Record<string, AssertionReceipt[]> = {
  "zeitwerk:lib/zeitwerk/test_unload.rb › TestUnload › unload clears internal caches": [
    { kind: "assert", value: null, as: null, reason },
    { kind: "assert", value: null, as: null, reason },
  ],
};
