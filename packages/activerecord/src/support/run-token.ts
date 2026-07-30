/**
 * Per-run identity for the AR test harness: the token `globalSetup` stamps
 * before any worker forks, and the naming rules every lane derives from it.
 *
 * The sqlite lane already carried a run token so that two vitest invocations in
 * different worktrees could not touch each other's temp DB files
 * (`sqlite-template.ts`). PG and MySQL had no such discriminator: every run
 * named its slot databases `activerecord_unittest`, `activerecord_unittest_2`,
 * … and `globalSetup` opened with `DROP DATABASE IF EXISTS` on each, so a
 * second run against the same server dropped the first run's databases out from
 * under its live workers. The advisory locks that hand out slots are
 * server-wide too, so the two runs also shared one slot pool.
 *
 * This module is the single signal both lanes derive from, mirroring the
 * property `config.ts` documents: nothing rewrites a URL or a database name in
 * place — the token goes into the environment once and every consumer computes
 * the same name from it.
 *
 * Naming: `<base>_<runToken>_<slot>` for a slot database, plus
 * `<base>_<runToken>_template` for the PG clone template, and whatever a suite
 * appends to a slot name (`_arunit2`, via `arunit2-config.ts`). Every database
 * a run creates therefore starts with `<base>_<runToken>_`, which is what makes
 * "drop only my own" expressible as a prefix test.
 *
 * Hard rules (RFC 0023): no `node:*` imports, no `process.*`, async fs only —
 * none of which this module needs.
 *
 * @internal
 */

/** Env var: per-run token, stamped by `globalSetup` before workers fork. */
export const RUN_TOKEN_ENV = "AR_TEST_RUN_TOKEN";

/**
 * Age past which a run's leftovers are assumed orphaned by a killed run and
 * swept. No AR test run comes near this, so the cutoff cannot pull a database
 * (or a temp file) out from under a *concurrent* run — which a blanket
 * prefix-drop would, since parallel worktrees share one server and one tmpdir.
 */
export const STALE_DB_AGE_MS = 6 * 60 * 60 * 1000;

// `r<base36 millis><base36 random>`, the random half fixed-width so the two
// halves split without a separator — every character base36 produces is itself
// a legal separator candidate, so there is no safe one to pick.
//
// The leading millis is not decoration: a database name is all the stale sweep
// has to go on — unlike a temp file, a PostgreSQL database carries no mtime to
// compare against the cutoff. The `r` prefix is what keeps a legacy unstamped
// leftover like `activerecord_unittest_2_arunit2` from parsing as a run token
// whose "start time" is the epoch, which would make the sweep drop it.
const RANDOM_LENGTH = 6;
const TOKEN_PATTERN = "r[0-9a-z]+";

/** A fresh token for this vitest invocation. */
export function newRunToken(): string {
  const random = Math.floor(Math.random() * 36 ** RANDOM_LENGTH)
    .toString(36)
    .padStart(RANDOM_LENGTH, "0");
  return `r${Date.now().toString(36)}${random}`;
}

/** When the run that minted `runToken` started, or `null` if unparseable. */
export function runTokenStartedAt(runToken: string): number | null {
  if (!runToken.startsWith("r") || runToken.length <= RANDOM_LENGTH + 1) return null;
  const millis = parseInt(runToken.slice(1, -RANDOM_LENGTH), 36);
  return Number.isFinite(millis) && millis > 0 ? millis : null;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The prefix every database one run creates from `base` shares. */
export function runDatabasePrefix(base: string, runToken: string): string {
  return `${base}_${runToken}_`;
}

/**
 * The database for one advisory-lock slot.
 *
 * Slot 1 gets `<base>_<token>_1` like every other slot — it deliberately no
 * longer aliases the bare `activerecord_unittest`. That alias is exactly what
 * made two concurrent runs collide on the un-suffixed name, and keeping it
 * would leave the one database `globalSetup` DROPs shared between runs. The
 * bare base name is now used only when no run token is stamped at all (see
 * `applySlot` in `config.ts`).
 */
export function slotDatabaseName(base: string, runToken: string, slot: number): string {
  return `${runDatabasePrefix(base, runToken)}${slot}`;
}

/** The run token a database name carries, or `null` if it carries none. */
export function runTokenOfDatabase(base: string, name: string): string | null {
  const match = new RegExp(`^${escapeRegExp(base)}_(${TOKEN_PATTERN})_`).exec(name);
  return match?.[1] ?? null;
}

/**
 * The subset of `names` this run owns — the only databases `globalSetup` and
 * its teardown may ever DROP. A name minted by a different run (or an
 * unstamped name such as the bare `activerecord_unittest` a developer keeps by
 * hand) is never in it.
 */
export function ownRunDatabases(base: string, runToken: string, names: string[]): string[] {
  return names.filter((name) => runTokenOfDatabase(base, name) === runToken);
}

/**
 * Databases orphaned by runs that were killed before their teardown ran (a
 * `^C`-ed vitest). Foreign token *and* older than {@link STALE_DB_AGE_MS}, so a
 * concurrent run's live databases are out of reach.
 */
export function staleRunDatabases(
  base: string,
  runToken: string,
  names: string[],
  now: number = Date.now(),
): string[] {
  return names.filter((name) => {
    const token = runTokenOfDatabase(base, name);
    if (token === null || token === runToken) return false;
    const startedAt = runTokenStartedAt(token);
    return startedAt !== null && now - startedAt >= STALE_DB_AGE_MS;
  });
}

/**
 * The advisory-lock key pair for a slot: `pg_try_advisory_lock(classId, objId)`
 * with the run token hashed into the class half, so a second concurrent run
 * scans a disjoint key space instead of exhausting this run's slot pool.
 * PostgreSQL advisory-lock keys are signed 32-bit, hence the `| 0`.
 */
export function pgAdvisoryLockKey(runToken: string, slot: number): [number, number] {
  let hash = 0;
  for (let i = 0; i < runToken.length; i++) {
    hash = (Math.imul(hash, 31) + runToken.charCodeAt(i)) | 0;
  }
  return [hash, slot];
}

/** The `GET_LOCK` name for a slot — per-run for the same reason. */
export function mysqlAdvisoryLockName(runToken: string, slot: number): string {
  return `ar_test_slot_${runToken}_${slot}`;
}
