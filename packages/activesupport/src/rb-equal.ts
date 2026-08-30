/**
 * Re-export shim: `rb_equal` is a Ruby C primitive and lives in
 * `@blazetrails/ruby-compat` (RFC 0129). Re-exported here so
 * `@blazetrails/activesupport`'s public surface is unchanged; the shim is
 * removed by `delete-ruby-compat-reexport-shims`.
 */
export { rbEqual } from "@blazetrails/ruby-compat";
