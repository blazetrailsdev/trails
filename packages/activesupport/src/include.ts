/**
 * Re-export shim. `Module#include` / `#extend` / `#prepend`, their `included` /
 * `extended` hook symbols and the type-level halves `Included<>` / `Extended<>`
 * are Ruby core-language primitives, so they now live in
 * `@blazetrails/ruby-compat` (RFC 0129). This file keeps the historical
 * activesupport import path working; `delete-ruby-compat-reexport-shims`'
 * successor removes it.
 */
export {
  Module,
  defineModule,
  extend,
  extended,
  include,
  included,
  isModuleIncluded,
  moduleVisibility,
  prepend,
  publicInstanceMethods,
} from "@blazetrails/ruby-compat/include";
export type { Extended, Included, ModuleVisibility } from "@blazetrails/ruby-compat/include";
