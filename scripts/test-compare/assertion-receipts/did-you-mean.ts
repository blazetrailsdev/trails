import type { AssertionReceipt } from "../assertion-receipts.js";

const preDetailedMessageArm: AssertionReceipt = {
  kind: "assert_match",
  value: null,
  as: null,
  reason:
    "test_name_error_extension.rb:28-29 — the `else` arm of `if Exception.method_defined?(:detailed_message)` (`:25`) runs only on a Ruby without `Exception#detailed_message`; ruby-compat's `Exception` always defines `detailedMessage` (packages/ruby-compat/lib/exc-detailed-message.ts), so the arm has no runtime to assert against",
};

export const didYouMean: Record<string, AssertionReceipt[]> = {
  "did-you-mean:core_ext/test_name_error_extension.rb › NameErrorExtensionTest › message": [
    preDetailedMessageArm,
    preDetailedMessageArm,
  ],
};
