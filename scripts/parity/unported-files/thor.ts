/**
 * Entries scoped to `package: "thor"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const RUNNER_REASON =
  "`Thor::Runner` (`runner.rb`, the `thor` executable that installs and runs Thorfiles) and " +
  "the util members that exist only for it. railties never reaches them.";

const RAKE_COMPAT_REASON =
  "`Thor::RakeCompat`: Rake-task-to-Thor bridging. railties does not use it.";

const HTML_REASON = "`Thor::Shell::HTML` and `Util.escape_html`: no terminal.";

const READLINE_REASON =
  "`Thor::LineEditor::Readline` (completion and history). `Basic` covers every railties " +
  "prompt, and `LineEditor.best_available` answers `Basic`.";

const LCS_DIFF_REASON =
  "`LCSDiff`: needs the `diff-lcs` gem, which is not vendored. `Color#show_diff` falls back " +
  "to `Basic#show_diff` (`diff -u`, shell/basic.rb:314-323), exactly as Thor does when the " +
  "gem is absent.";

export const THOR_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "/runner.rb",
    testFile: "/runner_spec.rb",
    package: "thor",
    reason: RUNNER_REASON,
  },
  {
    pattern: "/rake_compat.rb",
    testFile: "/rake_compat_spec.rb",
    package: "thor",
    reason: RAKE_COMPAT_REASON,
  },
  {
    pattern: "shell/html.rb",
    testFile: "shell/html_spec.rb",
    package: "thor",
    reason: HTML_REASON,
  },
  {
    pattern: "shell/lcs_diff.rb",
    package: "thor",
    reason: LCS_DIFF_REASON,
  },
  {
    pattern: "line_editor/readline.rb",
    testFile: "line_editor/readline_spec.rb",
    package: "thor",
    reason: READLINE_REASON,
  },
  {
    testFile: "/quality_spec.rb",
    package: "thor",
    reason:
      "A whitespace lint over the gem's own Ruby source files (trailing whitespace, tabs). " +
      "It tests the repository, not Thor.",
  },
  {
    testFile: "/no_warnings_spec.rb",
    package: "thor",
    reason:
      "Spawns `ruby -w` over a Thor script and asserts the interpreter prints no warnings. " +
      "There is no Ruby warning channel in JS.",
  },
  {
    testFile: "/encoding_spec.rb",
    package: "thor",
    reason:
      "Exercises `Thor::Util.load_thorfile` over Thorfiles in three encodings. " + RUNNER_REASON,
  },
  {
    testFile: "/script_exit_status_spec.rb",
    package: "thor",
    reason: "Spawns the `bin/thor` executable and reads its exit status. " + RUNNER_REASON,
  },
  {
    testFile: "util_spec.rb",
    tests: [
      // #namespaces_in_content
      "returns an array of names of constants defined in the string",
      "doesn't put the newly-defined constants in the enclosing namespace",
      // #user_home
      "returns the user path if no variable is set on the environment",
      "returns the *nix system path if file cannot be expanded and separator does not exist",
      "returns the windows system path if file cannot be expanded and a separator exists",
      "returns HOME/.thor if set",
      "returns path with HOMEDRIVE and HOMEPATH if set",
      "returns APPDATA/.thor if set",
      // #thor_root_glob and #globs_for
      "escapes globs in path",
    ],
    reason: RUNNER_REASON,
  },
  {
    testFile: "base_spec.rb",
    className: "#subclass_files",
    tests: [
      "returns tracked subclasses, grouped by the files they come from",
      "tracks a single subclass across multiple files",
    ],
    reason:
      "`Thor::Base.subclass_files` keys subclasses by the `caller` file that defined them, " +
      "for `Thor::Runner` alone. " +
      RUNNER_REASON,
  },
  {
    testFile: "line_editor_spec.rb",
    className: "on a system with Readline support",
    tests: ["uses the Readline line editor"],
    reason: READLINE_REASON,
  },
  {
    testFile: "shell/color_spec.rb",
    className: "#file_collision",
    tests: ["invokes the diff command"],
    reason: LCS_DIFF_REASON,
  },
];
