/**
 * Re-export shim: `Regexp.escape` is Ruby core, so it lives in
 * `@blazetrails/ruby-compat` (RFC 0129). It is re-exported here so
 * `@blazetrails/activesupport`'s public surface is unchanged; the shim is
 * removed by `delete-ruby-compat-reexport-shims`.
 */
export { regexpEscape } from "@blazetrails/ruby-compat";
