/**
 * Entries scoped to `package: "rack-cache"`. The `package` field, not this
 * file's name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const ALIAS_REASON =
  "RFC 0168-rack-cache-gem-port Non-goals: a deprecated alias file that only " +
  "warns and requires its renamed sibling; the sibling is the port.";

export const RACK_CACHE_UNPORTED_FILES: UnportedFile[] = [
  {
    package: "rack-cache",
    pattern: "/app_engine.rb",
    reason:
      "RFC 0168-rack-cache-gem-port Non-goals: `Rack::Cache::AppEngine` wraps JRuby's " +
      "Google App Engine memcache service (`app_engine.rb:5-13`), which has no Node runtime.",
  },
  { package: "rack-cache", pattern: "/appengine.rb", reason: ALIAS_REASON },
  { package: "rack-cache", pattern: "/cachecontrol.rb", reason: ALIAS_REASON },
  { package: "rack-cache", pattern: "/entitystore.rb", reason: ALIAS_REASON },
  { package: "rack-cache", pattern: "/metastore.rb", reason: ALIAS_REASON },
  { package: "rack-cache", pattern: "/rack-cache.rb", reason: ALIAS_REASON },
];
