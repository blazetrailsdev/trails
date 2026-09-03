/**
 * Re-export shim: `Tempfile` is Ruby stdlib (`vendor/ruby/lib/tempfile.rb:89`)
 * and lives in `@blazetrails/ruby-compat` (RFC 0129). This file keeps
 * `@blazetrails/activesupport`'s public surface unchanged until
 * `delete-ruby-compat-reexport-shims` removes it.
 */
export { Tempfile } from "@blazetrails/ruby-compat";
export type { TempfileBasename } from "@blazetrails/ruby-compat";
