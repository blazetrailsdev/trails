/**
 * Re-export shim: `Object#hash` is a Ruby C primitive and lives in
 * `@blazetrails/ruby-compat` (RFC 0129). Re-exported here so
 * `@blazetrails/activesupport`'s public surface is unchanged; the shim is
 * removed by `delete-ruby-compat-reexport-shims`.
 */
export { rbHash } from "@blazetrails/ruby-compat";
