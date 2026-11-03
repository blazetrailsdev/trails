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
];
