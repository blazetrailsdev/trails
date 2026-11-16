import type { AssertionReceipt } from "../assertion-receipts.js";

const RAILS_6_SASS =
  "branches on `Rails::VERSION::MAJOR >= 7`; the else arm expects Rails 6's `.scss.css` extname and never runs under Rails 8, the only Rails trails targets, so the port has nothing to assert there.";

export const viteTrails: Record<string, AssertionReceipt[]> = {
  "vite-trails:helper_test.rb › HelperTest › vite stylesheet tag": [
    {
      kind: "assert_similar",
      value: null,
      as: null,
      reason: `helper_test.rb:109 ${RAILS_6_SASS}`,
    },
  ],
  "vite-trails:helper_test.rb › HelperTest › vite stylesheet tag with skip proxy": [
    {
      kind: "assert_similar",
      value: null,
      as: null,
      reason: `helper_test.rb:244 ${RAILS_6_SASS}`,
    },
  ],
  "vite-trails:helper_test.rb › HelperTest › vite picture tag": [
    {
      kind: "assert_raises",
      value: null,
      as: null,
      reason:
        "helper_test.rb:290 branches on `Rails.gem_version >= 7.1.0`; the else arm expects `vite_picture_tag`'s pre-7.1 `NotImplementedError` and never runs under Rails 8, the only Rails trails targets, so the port has nothing to assert there.",
    },
  ],
};
