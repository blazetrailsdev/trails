/**
 * `yaml` is an optionalDependency of this package. Rails has no counterpart to
 * this file: Psych is stdlib, so `require 'yaml'`
 * (i18n/lib/i18n/backend/base.rb:3) cannot fail and `load_yml` (base.rb:261)
 * simply hands the file to it.
 *
 * The static re-export is the shape `[[yaml-is-an-optional-npm-dependency]]`
 * settled on — move the package to `optionalDependencies` and leave the import
 * alone. `packages/activesupport/src/yaml.ts` wraps its own resolution in a
 * lazy `await import` instead, to keep a missing `yaml` from taking that
 * package's root import down with it; that shape is unavailable here, because
 * this module *is* in `@blazetrails/i18n`'s root graph (`backend/base.ts`
 * imports it), so the blast radius is the same either way, and a top-level
 * await additionally breaks the `iife` and `cjs` bundles built over this
 * package (`packages/website`'s service worker, `scripts/`' test-compare).
 */
export { parse } from "yaml";
