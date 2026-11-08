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

const PARSER_HTML4_REASON =
  'parser_selection_test.rb:9-73 `assert_equal(Nokogiri::HTML4::Document, Rails::Dom::Testing.html_document(html_version: :html4))` and its fragment twin; trails has no HTML4 parser and the `:html4` arm raises `NotImplementedError` (CLAUDE.md, "DOM testing is HTML5 only")';

const PARSER_HTML4_EQUAL: AssertionReceipt = {
  kind: "assert_equal",
  value: null,
  as: null,
  reason: PARSER_HTML4_REASON,
};

const NIE_HTML4_REASON =
  'dom_assertions_test.rb:207 `assert_nothing_raised { assert_dom_equal(@html4_result, @input, html_version: :html4) }`; trails has no HTML4 parser and the `:html4` arm raises `NotImplementedError` (CLAUDE.md, "DOM testing is HTML5 only")';

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
  "rails-dom-testing:dom_assertions_test.rb › DomAssertionsHtmlParserSelectionTest › raise NotImplementedError html5 when not supported":
    [
      { kind: "assert_nothing_raised", value: null, as: null, reason: NIE_HTML4_REASON },
      { kind: "assert_dom_equal", value: null, as: null, reason: NIE_HTML4_REASON },
    ],
  "rails-dom-testing:parser_selection_test.rb › DomTestingParserSelectionTest › with default html4":
    [PARSER_HTML4_EQUAL, PARSER_HTML4_EQUAL, PARSER_HTML4_EQUAL, PARSER_HTML4_EQUAL],
  "rails-dom-testing:parser_selection_test.rb › DomTestingParserSelectionTest › with default html5":
    [PARSER_HTML4_EQUAL, PARSER_HTML4_EQUAL],
  "rails-dom-testing:parser_selection_test.rb › DomTestingParserSelectionTest › with invalid default":
    [PARSER_HTML4_EQUAL, PARSER_HTML4_EQUAL],
};
