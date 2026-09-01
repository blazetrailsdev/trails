/**
 * Re-export shim. `Module#prepend` is a Ruby core-language primitive, so it now
 * lives in `@blazetrails/ruby-compat` (RFC 0129). This file keeps the
 * historical activesupport import path working;
 * `delete-ruby-compat-reexport-shims`' successor removes it.
 */
export { prepend } from "@blazetrails/ruby-compat";
export type { PrependMethod, PrependModule } from "@blazetrails/ruby-compat";
