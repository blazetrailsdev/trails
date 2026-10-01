/**
 * `version.rb`, one entry per package that has not ported it. activemodel
 * has (`packages/activemodel/src/version.ts`), so it carries no entry. Each
 * remaining package leaves by deleting its name here. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const VERSION_UNPORTED_FILES: UnportedFile[] = [
  "activerecord",
  "activesupport",
  "actionpackversion",
  "actionview",
  "trailties",
  "rack",
  "i18n",
].map((pkg) => ({
  pattern: "/version.rb",
  package: pkg,
  reason:
    "`Module.version` returns `gem_version` (e.g. active_record/version.rb:8), " +
    "and this package has not ported it yet. Anchored (leading `/`) so it " +
    "cannot also exclude `gem_version.rb`, which IS ported and owns real " +
    "surface (`ActionPack.gem_version`).",
}));
