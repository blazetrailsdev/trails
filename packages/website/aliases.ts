import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Workspace package entry points, shared by `vite.config.ts` and
 * `vitest.config.ts` so the two cannot drift — a package aliased for the app
 * build but not for the test run fails to resolve only under vitest.
 */
export const packageEntries: Array<[string, string]> = [
  ["@blazetrails/activesupport", "../activesupport/lib/index.ts"],
  ["@blazetrails/ruby-compat", "../ruby-compat/lib/index.ts"],
  ["@blazetrails/arel", "../arel/lib/index.ts"],
  ["@blazetrails/activemodel", "../activemodel/lib/index.ts"],
  ["@blazetrails/activerecord/migration", "../activerecord/lib/migration.ts"],
  ["@blazetrails/activerecord/base", "../activerecord/lib/base.ts"],
  ["@blazetrails/activerecord/schema", "../activerecord/lib/schema.ts"],
  [
    "@blazetrails/activerecord/connection-adapters/sqlite3-adapter",
    "../activerecord/lib/connection-adapters/sqlite3-adapter.ts",
  ],
  ["@blazetrails/activerecord/connection-adapters", "../activerecord/lib/connection-adapters.ts"],
  ["@blazetrails/activerecord", "../activerecord/lib/index.ts"],
  ["@blazetrails/rack", "../rack/lib/index.ts"],
  [
    "@blazetrails/actionview/rails-dom-testing/assertions",
    "../actionview/lib/rails-dom-testing/assertions.ts",
  ],
  [
    "@blazetrails/actionview/rails-dom-testing/testing",
    "../actionview/lib/rails-dom-testing/testing.ts",
  ],
  ["@blazetrails/actionview", "../actionview/lib/index.ts"],
  ["@blazetrails/tse-compiler", "../tse-compiler/lib/index.ts"],
  ["@blazetrails/actionpack", "../actionpack/lib/index.ts"],
  ["@blazetrails/trailties/all", "../trailties/lib/all.ts"],
  ["@blazetrails/trailties/generators", "../trailties/lib/generators/index.ts"],
  ["@blazetrails/globalid/wire", "../globalid/lib/wire.ts"],
  ["@blazetrails/globalid/signed-global-id", "../globalid/lib/signed-global-id.ts"],
  ["@blazetrails/globalid", "../globalid/lib/index.ts"],
  ["@blazetrails/actioncable", "../actioncable/lib/index.ts"],
  ["@blazetrails/solid-queue", "../solid-queue/lib/index.ts"],
  ["@blazetrails/solid-cable", "../solid-cable/lib/index.ts"],
  ["@blazetrails/actionmailbox", "../actionmailbox/lib/index.ts"],
  ["@blazetrails/actiontext", "../actiontext/lib/index.ts"],
  ["@blazetrails/activestorage", "../activestorage/lib/index.ts"],
  ["@blazetrails/bcrypt", "../bcrypt/lib/index.ts"],
  ["@blazetrails/date", "../date/lib/index.ts"],
  ["@blazetrails/did-you-mean", "../did-you-mean/lib/index.ts"],
  ["@blazetrails/i18n", "../i18n/lib/index.ts"],
  ["@blazetrails/builder", "../builder/lib/builder.ts"],
  ["@blazetrails/marcel", "../marcel/lib/marcel.ts"],
  ["@blazetrails/chronic", "../chronic/lib/chronic.ts"],
  ["@blazetrails/tzinfo", "../tzinfo/lib/index.ts"],
  ["@blazetrails/et-orbi", "../et-orbi/lib/et-orbi.ts"],
  ["@blazetrails/raabro", "../raabro/lib/raabro.ts"],
  ["@blazetrails/msgpack", "../msgpack/lib/index.ts"],
  ["@blazetrails/nokogiri", "../nokogiri/lib/index.ts"],
];

/**
 * Subpath prefixes, applied ahead of the bare package entries above so a
 * deep import (`@blazetrails/activesupport/temporal`) is not rewritten into
 * `…/src/index.ts/temporal`. The app build externalizes those subpaths
 * instead, so these are only used by vitest.
 */
export const subpathPrefixes: Array<[string, string]> = [
  ["@blazetrails/activesupport/", "../activesupport/lib/"],
  ["@blazetrails/ruby-compat/", "../ruby-compat/lib/"],
  ["@blazetrails/arel/test", "../arel/test"],
];

export function resolveEntries(entries: Array<[string, string]>): Array<[string, string]> {
  return entries.map(([name, entry]) => [
    name,
    path.resolve(__dirname, entry) + (entry.endsWith("/") ? "/" : ""),
  ]);
}
