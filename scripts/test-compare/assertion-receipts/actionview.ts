import type { AssertionReceipt } from "../assertion-receipts.js";

export const actionview: Record<string, AssertionReceipt[]> = {
  "actionview:template/date_helper_test.rb › DateHelperTest › object select html safety": [
    {
      kind: "assert_predicate",
      value: null,
      as: null,
      reason:
        'template/date_helper_test.rb:3670 `time_select` over a Date reaches `Date#min` through `send`, a private method (`date_core.c:9774`); a JS method entry carries no visibility, so porting it would make every Date `respond_to?(:min)` (CLAUDE.md, "Method visibility is compile-time only")',
    },
  ],
  "actionview:template/form_collections_helper_test.rb › FormCollectionsHelperTest › collection check boxes correctly builds unique DOM IDs for float values":
    [
      {
        kind: "assert_select",
        value: "s:label[for=user_name_1_0]",
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:326)',
      },
      {
        kind: "assert_select",
        value: 's:input#user_name_1_0[type=checkbox][value="1.0"]',
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:328)',
      },
    ],
  "actionview:template/form_collections_helper_test.rb › FormCollectionsHelperTest › collection radio correctly builds unique DOM IDs for float values":
    [
      {
        kind: "assert_select",
        value: "s:label[for=user_name_1_0]",
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:57)',
      },
      {
        kind: "assert_select",
        value: 's:input#user_name_1_0[type=radio][value="1.0"]',
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:59)',
      },
    ],
  "actionview:template/form_helper_test.rb › FormHelperTest › explicit id": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1440)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1444)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1448)",
    },
  ],
  "actionview:template/form_helper_test.rb › FormHelperTest › explicit name": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1413)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1417)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1421)",
    },
  ],
  "actionview:template/form_helper_test.rb › FormHelperTest › index with nil id": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1533)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1537)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1541)",
    },
  ],
  "actionview:template/form_helper_test.rb › FormHelperTest › nil id": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1475)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1479)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1483)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1487)",
    },
  ],
  "actionview:template/output_safety_helper_test.rb › OutputSafetyHelperTest › safe_join should return the safe string separated by $, when second argument is not passed":
    [
      {
        kind: "assert_equal",
        value: "s:a|b",
        as: null,
        reason:
          "Ruby's `$,` output field separator is a process global that `safe_join` reads as its default `sep` (`output_safety_helper.rb:33`); JS has no output field separator to set, so there is no `|` default to join with (template/output_safety_helper_test.rb:50)",
      },
    ],
  "actionview:template/render_test.rb › render location conditional append 2": [
    {
      kind: "assert_instance_of",
      value: null,
      as: "assert_equal",
      reason:
        "template/render_test.rb:254 `assert_instance_of Integer` — a Ruby Integer is a JS number primitive, which is not `instanceof` any class, so the port asserts `rbObjClass` answers `rbCInteger`",
    },
  ],
  "actionview:template/tag_helper_test.rb › TagHelperTest › content tag": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (CLAUDE.md § "A Ruby Symbol is a JS string, never a JS `Symbol`"; template/tag_helper_test.rb:220)',
    },
  ],
  "actionview:template/tag_helper_test.rb › TagHelperTest › tag builder with content": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (CLAUDE.md § "A Ruby Symbol is a JS string, never a JS `Symbol`"; template/tag_helper_test.rb:233)',
    },
  ],
  "actionview:template/template_test.rb › TestERBTemplate › no magic comment word with utf 8": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'template/template_test.rb:150 `render.encoding` is Encoding::UTF_8 — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
};
