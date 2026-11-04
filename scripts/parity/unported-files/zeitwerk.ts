/**
 * Entries scoped to `package: "zeitwerk"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const reason =
  'Ruby packaging surface: trails packages are npm packages, and `Registry.loaderForPackage` reads a `package.json` (RFC 0213 § "Non-goals", owner decision on trails#9619). PERMANENT.';

export const ZEITWERK_UNPORTED_FILES: UnportedFile[] = [
  { package: "zeitwerk", pattern: "/gem_loader.rb", reason },
  { package: "zeitwerk", pattern: "/gem_inflector.rb", reason },
  { package: "zeitwerk", testFile: "/test_gem_inflector.rb", reason },
  { package: "zeitwerk", testFile: "/test_for_gem.rb", reason },
  { package: "zeitwerk", testFile: "/test_for_gem_extension.rb", reason },
];
