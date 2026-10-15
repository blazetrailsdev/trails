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

export const ACTIONVIEW_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "template/handlers/builder.rb",
    package: "actionview",
    reason:
      "`Template::Handlers::Builder#call` (builder.rb:8-14) compiles a `.builder` template " +
      "into Ruby that drives `::Builder::XmlMarkup` from the `builder` gem, which is neither " +
      "vendored nor available as a trails package, and trails takes no third-party runtime " +
      "deps. A port would have no XmlMarkup to emit code against, so `Handlers.extended` " +
      "(handlers.rb:12-18) registers the other four handlers and not `:builder`.",
  },
  {
    pattern: "/test_case.rb",
    package: "actionview",
    reason:
      "Minitest harness for rendering views (`ActionView::TestCase`) — a Rails test-suite " +
      "support class for a layer trails does not port.",
  },
];
