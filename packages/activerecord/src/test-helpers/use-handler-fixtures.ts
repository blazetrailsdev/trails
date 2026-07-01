import { Base } from "../base.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import {
  withTransactionalFixtures,
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
  type FixturesConnectionOpts,
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
 * @example  // seed through a model-specific / caller-owned connection
 *   const { colleges } = useHandlerFixtures(["colleges"], {
 *     connection: () => College.connection,
 *     useTransactionalTests: false,
 *   });
 *
 * @internal
 */
export function useHandlerFixtures<M extends FixtureMap>(
  fixtures: M,
  options?: WithTransactionalFixturesOptions & UseFixturesOpts & FixturesConnectionOpts,
): UseFixturesResult<M>;
export function useHandlerFixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: WithTransactionalFixturesOptions & UseFixturesOpts & FixturesConnectionOpts,
): UseFixturesByNameResult<N>;
export function useHandlerFixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  options?: WithTransactionalFixturesOptions & UseFixturesOpts & FixturesConnectionOpts,
): UseTablelessFixturesResult<T>;
export function useHandlerFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  options:
    | (WithTransactionalFixturesOptions & UseFixturesOpts & FixturesConnectionOpts)
    | undefined = undefined,
): Record<string, unknown> {
  const {
    usesTransaction,
    invalidateSchemaCache,
    useTransactionalTests,
    connection,
    ...fixtureOpts
  } = options ?? {};

  // Caller-supplied connection/adapter thunk wins over the default handler
  // connection: multi-database suites seed through a model-specific
  // `*.connection`, and adapter-owning suites seed through their own adapter.
  const getConnection = connection ?? (() => Base.connection);

  setupHandlerSuite();
  // Rails' `use_transactional_tests = false` (default is true): skip the
  // savepoint-pinned wrapper so `useFixtures`' per-test delete/reseed commits
  // real DML, visible across pooled connections. Mirrors the direct-adapter
  // escape hatch the view/signed-id suites used before converging here.
  if (useTransactionalTests !== false) {
    withTransactionalFixtures(getConnection, {
      usesTransaction,
      invalidateSchemaCache,
    });
  }

  return useFixtures(
    fixturesOrNames as FixtureMap,
    getConnection,
    Object.keys(fixtureOpts).length > 0 ? fixtureOpts : undefined,
  );
}
