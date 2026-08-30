/**
 * Re-export shim: `String#succ` is Ruby core and lives in
 * `@blazetrails/ruby-compat` (RFC 0129). The shim is removed by
 * `delete-ruby-compat-reexport-shims`.
 */
export { succ } from "@blazetrails/ruby-compat";
