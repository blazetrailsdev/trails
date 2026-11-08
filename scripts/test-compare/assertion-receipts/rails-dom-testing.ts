import type { AssertionReceipt } from "../assertion-receipts.js";

const HTML4_REASON =
  'selector_assertions_test.rb:323-351 asserts the HTML4 parser\'s output under `with_default_html_version(:html4)` and `html_version: :html4`; trails parses HTML5 only (CLAUDE.md, "DOM testing is HTML5 only")';

const HTML4_ARM: AssertionReceipt = {
  kind: "assert_select_encoded",
  value: null,
  as: null,
  reason: HTML4_REASON,
};

const HTML4_EQUAL: AssertionReceipt = {
  kind: "assert_equal",
  value: null,
  as: null,
  reason: HTML4_REASON,
};

export const railsDomTesting: Record<string, AssertionReceipt[]> = {
  "rails-dom-testing:selector_assertions_test.rb › AssertSelectTest › feed item encoded with html version":
    [
      { kind: "assert_select", value: "s:root contents", as: null, reason: HTML4_REASON },
      HTML4_ARM,
      HTML4_EQUAL,
      HTML4_ARM,
      HTML4_EQUAL,
      HTML4_ARM,
      HTML4_EQUAL,
      HTML4_ARM,
      HTML4_EQUAL,
    ],
};
