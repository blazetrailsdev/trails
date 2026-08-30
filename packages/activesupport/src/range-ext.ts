/**
 * Re-export shim: Ruby's core `Range` lives in `@blazetrails/ruby-compat`
 * (RFC 0129), which is where a Ruby class belongs — ActiveSupport is a Rails
 * gem that USES Ruby. Re-exported here so `@blazetrails/activesupport`'s
 * public surface is unchanged; the shim is removed by
 * `delete-ruby-compat-reexport-shims`.
 */
export { Range } from "@blazetrails/ruby-compat/range";
