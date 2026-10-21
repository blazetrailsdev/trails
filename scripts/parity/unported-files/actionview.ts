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
    pattern: "template/handlers/erb/erubi.rb",
    package: "actionview",
    reason:
      "`Handlers::ERB::Erubi` (erubi.rb:9-83) is the Erubi step, and root CLAUDE.md " +
      '§ "Templates are precompiled" rules that `compileJs` in `@blazetrails/tse-compiler` ' +
      "is that step. Its members answer them in `tse-compiler/src/emit-js.ts`: `initialize`'s " +
      "`bufvar` / `preamble` / `postamble` / `escapefunc` are `EmitJsOptions` read by `emit`; " +
      "`add_text` is `emitNode`'s `text` arm (`safeAppend`); `add_expression` is its `expr` / " +
      "`rawExpr` arms and `emit`'s `blockExpr` arm (`BLOCK_EXPR`); `add_code` is the `code` " +
      "arm; `add_postamble` is `emit`'s `options.postamble`. `flush_newline_if_pending` has no " +
      "member: `emit`'s `push` pads to each node's source line, which is what Rails' pending " +
      "newlines keep, so the backtrace line matches the template's.",
  },
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
    pattern: "helpers/atom_feed_helper.rb",
    testFile: "template/atom_feed_helper_test.rb",
    package: "actionview",
    reason:
      "`AtomFeedHelper#atom_feed` (atom_feed_helper.rb:96-125) reads `xml` from the block's " +
      "binding, where only a `.builder` template's compiled code sets it, and every " +
      "`AtomBuilder` / `AtomFeedBuilder` method forwards to `::Builder::XmlMarkup`. The " +
      "`:builder` handler is unported above for want of XmlMarkup, and every test in " +
      "atom_feed_helper_test.rb renders a `.builder` template, so neither half has a caller.",
  },
];
