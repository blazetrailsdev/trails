/**
 * Entries scoped to `package: "actionview"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 *
 * These are view-layer buckets with no trails counterpart at all — every one is
 * outside the ActiveRecord/ActiveModel require closure, which is what this
 * register exists to declare. They read as partly ported until PR #6414 stopped
 * crediting `matched` to Ruby files with no TS file; scoping them keeps the
 * `percent` metric measuring porting debt rather than a scope decision.
 */

import type { UnportedFile } from "./types.js";

const FORM_HELPER_REASON =
  "Form-builder HTML generation (tag/label/input rendering, `FormBuilder` object binding). " +
  "Pre-1.0 scope: trails ports no view layer and the AR/AM closure never reaches it.";

export const ACTIONVIEW_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "/helpers.rb",
    package: "actionview",
    reason:
      "The `ActionView::Helpers` umbrella that includes every helper module; " +
      "nothing under it is ported, so the barrel has no trails counterpart.",
  },
  {
    pattern: "/test_case.rb",
    package: "actionview",
    reason:
      "Minitest harness for rendering views (`ActionView::TestCase`) — a Rails test-suite " +
      "support class for a layer trails does not port.",
  },
  { pattern: "helpers/form_helper.rb", package: "actionview", reason: FORM_HELPER_REASON },
  { pattern: "helpers/form_tag_helper.rb", package: "actionview", reason: FORM_HELPER_REASON },
  { pattern: "helpers/form_options_helper.rb", package: "actionview", reason: FORM_HELPER_REASON },
  { pattern: "helpers/tags/base.rb", package: "actionview", reason: FORM_HELPER_REASON },
  {
    pattern: "helpers/tags/collection_check_boxes.rb",
    package: "actionview",
    reason: FORM_HELPER_REASON,
  },
  {
    pattern: "helpers/tags/collection_radio_buttons.rb",
    package: "actionview",
    reason: FORM_HELPER_REASON,
  },
  {
    pattern: "helpers/tags/collection_select.rb",
    package: "actionview",
    reason: FORM_HELPER_REASON,
  },
  {
    pattern: "helpers/tags/grouped_collection_select.rb",
    package: "actionview",
    reason: FORM_HELPER_REASON,
  },
  { pattern: "helpers/tags/select.rb", package: "actionview", reason: FORM_HELPER_REASON },
  {
    pattern: "helpers/tags/time_zone_select.rb",
    package: "actionview",
    reason: FORM_HELPER_REASON,
  },
  { pattern: "helpers/tags/weekday_select.rb", package: "actionview", reason: FORM_HELPER_REASON },
  {
    pattern: "helpers/asset_tag_helper.rb",
    package: "actionview",
    reason: "Emits asset `<script>`/`<img>` tags off the asset pipeline; no trails view layer.",
  },
  {
    pattern: "helpers/translation_helper.rb",
    package: "actionview",
    reason:
      "View-side `translate`/`localize` wrappers that add HTML-safety and lazy `.key` lookup " +
      "on top of I18n; trails ports the I18n gem itself, not the view wrappers.",
  },
  {
    pattern: "helpers/url_helper.rb",
    package: "actionview",
    reason: "`link_to`/`button_to` HTML generation over the routing layer; no trails view layer.",
  },
  {
    pattern: "/layouts.rb",
    package: "actionview",
    reason: "Layout resolution for rendered templates; no trails template renderer.",
  },
  {
    pattern: "renderer/collection_renderer.rb",
    package: "actionview",
    reason: "Renders a partial per collection element; no trails template renderer.",
  },
];
