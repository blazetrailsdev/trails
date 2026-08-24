import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Workspace package entry points, shared by `vite.config.ts` and
 * `vitest.config.ts` so the two cannot drift — a package aliased for the app
 * build but not for the test run fails to resolve only under vitest.
 */
export const packageEntries: Array<[string, string]> = [
  ["@blazetrails/activesupport", "../activesupport/src/index.ts"],
  ["@blazetrails/arel", "../arel/src/index.ts"],
  ["@blazetrails/activemodel", "../activemodel/src/index.ts"],
  ["@blazetrails/activerecord/migration", "../activerecord/src/migration.ts"],
  ["@blazetrails/activerecord/base", "../activerecord/src/base.ts"],
  ["@blazetrails/activerecord/migrator", "../activerecord/src/migrator.ts"],
  ["@blazetrails/activerecord/schema", "../activerecord/src/schema.ts"],
  ["@blazetrails/activerecord", "../activerecord/src/index.ts"],
  ["@blazetrails/rack", "../rack/src/index.ts"],
  ["@blazetrails/actionview", "../actionview/src/index.ts"],
  ["@blazetrails/tse-compiler", "../tse-compiler/src/index.ts"],
  ["@blazetrails/actionpack", "../actionpack/src/index.ts"],
  ["@blazetrails/trailties/generators", "../trailties/src/generators/index.ts"],
  ["@blazetrails/globalid/wire", "../globalid/src/wire.ts"],
  ["@blazetrails/globalid/signed-global-id", "../globalid/src/signed-global-id.ts"],
  ["@blazetrails/globalid", "../globalid/src/index.ts"],
  ["@blazetrails/date", "../date/src/index.ts"],
  ["@blazetrails/did-you-mean", "../did-you-mean/src/index.ts"],
  ["@blazetrails/i18n", "../i18n/src/index.ts"],
  ["@blazetrails/nokogiri", "../nokogiri/src/index.ts"],
];

/**
 * Subpath prefixes, applied ahead of the bare package entries above so a
 * deep import (`@blazetrails/activesupport/temporal`) is not rewritten into
 * `…/src/index.ts/temporal`. The app build externalizes those subpaths
 * instead, so these are only used by vitest.
 */
export const subpathPrefixes: Array<[string, string]> = [
  ["@blazetrails/activesupport/", "../activesupport/src/"],
  ["@blazetrails/arel/src", "../arel/src"],
];

export function resolveEntries(entries: Array<[string, string]>): Array<[string, string]> {
  return entries.map(([name, entry]) => [
    name,
    path.resolve(__dirname, entry) + (entry.endsWith("/") ? "/" : ""),
  ]);
}
