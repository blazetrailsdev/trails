import { setupHandlerSuite } from "./setup-handler-suite.js";
import { useHandlerFixtures } from "./use-handler-fixtures.js";
import { type WithTransactionalFixturesOptions } from "./with-transactional-fixtures.js";
import {
  type FixtureMap,
  type FixtureName,
  type TablelessFixtureEntry,
  type UseFixturesResult,
  type UseFixturesByNameResult,
  type UseTablelessFixturesResult,
  type UseFixturesOpts,
} from "./use-fixtures.js";

/**
 * Rails-faithful public surface for declaring fixtures in a test file.
 *
 * Thin, non-breaking alias for {@link useHandlerFixtures} — same overloads
 * (map / names / tableless), same runtime path. Mirrors Rails'
 * `fixtures :authors, :posts` declaration, which carries no "handler"
 * qualifier. New and newly-ported tests should prefer this name; existing
 * `useHandlerFixtures` call sites stay as-is and migrate mechanically later.
 *
 * @example  // primary documented form
 *   const { authors, posts } = fixtures({
 *     authors: [Author, { david: { name: "David" } }],
 *     posts: [Post, { welcome: { title: "Welcome" } }],
 *   });
 *
 * @example  // by registry name
 *   const { authors, posts } = fixtures(["authors", "posts"]);
 *
 * @internal
 */
export function fixtures<M extends FixtureMap>(
  fixtures: M,
  options?: WithTransactionalFixturesOptions & UseFixturesOpts,
): UseFixturesResult<M>;
export function fixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: WithTransactionalFixturesOptions & UseFixturesOpts,
): UseFixturesByNameResult<N>;
export function fixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  options?: WithTransactionalFixturesOptions & UseFixturesOpts,
): UseTablelessFixturesResult<T>;
export function fixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  options: (WithTransactionalFixturesOptions & UseFixturesOpts) | undefined = undefined,
): Record<string, unknown> {
  return (useHandlerFixtures as (...args: unknown[]) => Record<string, unknown>)(
    fixturesOrNames,
    options,
  );
}

/**
 * Rails-faithful alias for {@link setupHandlerSuite}.
 *
 * Mirrors Rails' `setup_fixtures` — bootstraps the connection handler once per
 * worker and shields shared-DB tables from the global reset. Use when a file
 * needs the handler-suite wiring without declaring fixtures in the same call.
 *
 * @internal
 */
export function setupFixtures(): void {
  setupHandlerSuite();
}
