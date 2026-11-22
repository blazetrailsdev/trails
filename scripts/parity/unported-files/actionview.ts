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
      "is that step. Its members answer them in `tse-compiler/lib/emit-js.ts`: `initialize`'s " +
      "`bufvar` / `preamble` / `postamble` / `escapefunc` are `EmitJsOptions` read by `emit`; " +
      "`add_text` is `emitNode`'s `text` arm (`safeAppend`); `add_expression` is its `expr` / " +
      "`rawExpr` arms and `emit`'s `blockExpr` arm (`BLOCK_EXPR`); `add_code` is the `code` " +
      "arm; `add_postamble` is `emit`'s `options.postamble`. `flush_newline_if_pending` has no " +
      "member: `emit`'s `push` pads to each node's source line, which is what Rails' pending " +
      "newlines keep, so the backtrace line matches the template's.",
  },
  {
    pattern: "/render_parser.rb",
    package: "actionview",
    reason:
      "`RenderParser` (render_parser.rb) reads a template's compiled Ruby. " +
      'No trails handler compiles to Ruby, so there is no `RubyTracker` and nothing for a `RenderParser` to parse: by repo-owner ruling (2026-10-18), recorded in packages/actionview/CLAUDE.md § "`TSETracker` answers what `RubyTracker` answers", `TSETracker` answers the three `RubyTrackerTests` (dependency_tracker_test.rb:274-302) instead. PERMANENT.',
  },
  {
    pattern: "render_parser/prism_render_parser.rb",
    package: "actionview",
    reason:
      "`RenderParser::PrismRenderParser` (prism_render_parser.rb) reads a template's compiled Ruby. " +
      'No trails handler compiles to Ruby, so there is no `RubyTracker` and nothing for a `RenderParser` to parse: by repo-owner ruling (2026-10-18), recorded in packages/actionview/CLAUDE.md § "`TSETracker` answers what `RubyTracker` answers", `TSETracker` answers the three `RubyTrackerTests` (dependency_tracker_test.rb:274-302) instead. PERMANENT.',
  },
  {
    pattern: "render_parser/ripper_render_parser.rb",
    package: "actionview",
    reason:
      "`RenderParser::RipperRenderParser` (ripper_render_parser.rb) reads a template's compiled Ruby. " +
      'No trails handler compiles to Ruby, so there is no `RubyTracker` and nothing for a `RenderParser` to parse: by repo-owner ruling (2026-10-18), recorded in packages/actionview/CLAUDE.md § "`TSETracker` answers what `RubyTracker` answers", `TSETracker` answers the three `RubyTrackerTests` (dependency_tracker_test.rb:274-302) instead. PERMANENT.',
  },
];
