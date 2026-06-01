import { Base } from "../base.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
  type WithTransactionalFixturesOptions,
} from "./with-transactional-fixtures.js";
import {
  useFixtures,
  type FixtureMap,
  type FixtureName,
  type TablelessFixtureEntry,
  type UseFixturesResult,
  type UseFixturesByNameResult,
  type UseTablelessFixturesResult,
  type UseFixturesOpts,
} from "./use-fixtures.js";

/**
 * One-call wiring for handler-path test files that use fixtures.
 *
 * Combines {@link setupHandlerSuite} + {@link withTransactionalFixtures} +
 * {@link useFixtures} into a single call, eliminating the three-line boilerplate
 * that every fixture-backed describe block previously required.
 *
 * Mirrors the Rails `ActiveRecord::TestCase` contract where including
 * `TestFixtures`, declaring `fixtures :name`, and enabling
 * `use_transactional_tests` are a single opt-in at the class level.
 *
 * @example
 *   const { topics } = useHandlerFixtures({
 *     topics: [Topic, { rails: { title: "Rails" } }],
 *   });
 *
 * @example  // by registry name
 *   const { customers } = useHandlerFixtures(["customers"]);
 *
 * @example  // with usesTransaction opt-out
 *   const { posts } = useHandlerFixtures(["posts"], {
 *     usesTransaction: ["fires after_commit callback"],
 *   });
 *
 * @internal
 */
export function useHandlerFixtures<M extends FixtureMap>(
  fixtures: M,
  options?: WithTransactionalFixturesOptions & UseFixturesOpts,
): UseFixturesResult<M>;
export function useHandlerFixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: WithTransactionalFixturesOptions & UseFixturesOpts,
): UseFixturesByNameResult<N>;
export function useHandlerFixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  options?: WithTransactionalFixturesOptions & UseFixturesOpts,
): UseTablelessFixturesResult<T>;
export function useHandlerFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  options: (WithTransactionalFixturesOptions & UseFixturesOpts) | undefined = undefined,
): Record<string, unknown> {
  const { usesTransaction, invalidateSchemaCache, ...fixtureOpts } = options ?? {};

  setupHandlerSuite();
  withTransactionalFixtures(() => Base.connection as TransactionalFixturesAdapter, {
    usesTransaction,
    invalidateSchemaCache,
  });

  return useFixtures(
    fixturesOrNames as FixtureMap,
    () => Base.connection,
    Object.keys(fixtureOpts).length > 0 ? fixtureOpts : undefined,
  );
}
