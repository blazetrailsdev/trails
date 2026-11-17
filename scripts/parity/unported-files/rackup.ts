/**
 * Entries scoped to `package: "rackup"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const RACKUP_UNPORTED_FILES: UnportedFile[] = [
  {
    package: "rackup",
    pattern: "handler/webrick.rb",
    testFile: "spec_webrick.rb",
    reason:
      "RFC 0217-rackup-gem-port Non-goals: WEBrick is a Ruby stdlib server with no Node " +
      "counterpart; `Handler::Node` is the trails server.",
  },
  {
    package: "rackup",
    pattern: "handler/cgi.rb",
    reason:
      "RFC 0217-rackup-gem-port Non-goals: a Node process is never a CGI script; no " +
      "application of trails is deployed that way.",
  },
  {
    testFile: "spec_handler.rb",
    tests: ["has registered default handlers"],
    reason:
      "RFC 0217-rackup-gem-port Non-goals: asserts the CGI and WEBrick handlers are " +
      "registered, and both are unported.",
  },
  {
    testFile: "spec_server.rb",
    tests: ["run a secure server"],
    reason:
      "RFC 0217-rackup-gem-port Non-goals: WEBrick's SSLEnable has no Node handler counterpart.",
  },
  {
    testFile: "spec_server.rb",
    tests: ["#start daemonizes if daemonize option is given"],
    reason: 'Process.daemon forks: CLAUDE.md, "Runtime facts Node does not expose".',
  },
  {
    testFile: "spec_server.rb",
    tests: [
      "#profiles to temp file if :profile_mode option is given and :profile_file option is not given",
      "#profiles to given file if :profile_mode and :profile_file options are given",
      "support --profile-mode option for stackprof profiling",
      "support --profile-mode option for stackprof profiling without --profile option",
    ],
    reason: "RFC 0217-rackup-gem-port Design: stackprof has no Node counterpart.",
  },
  {
    testFile: "spec_server.rb",
    tests: ["support --heap option for heap profiling"],
    reason: "RFC 0217-rackup-gem-port Design: objspace has no Node counterpart.",
  },
];
