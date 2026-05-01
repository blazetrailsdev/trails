/**
 * Vitest setupFile for ar-db: applies a per-worker database suffix to
 * PG_TEST_URL and MYSQL_TEST_URL before any test code or import runs.
 *
 * Mutating process.env here ensures every consumer in this fork — including
 * adapter test helpers that read process.env directly — connects to the
 * correct per-worker database rather than all sharing the base database.
 *
 * AR_DB_FORKS: number of parallel DB slots provisioned in CI (default: 1).
 * VITEST_WORKER_ID: global incrementing fork ID assigned by vitest.
 *   Consecutive IDs are assigned to concurrent forks, so (id-1) % forks + 1
 *   maps each concurrent fork to a distinct slot with no overlap.
 */

function workerDbUrl(baseUrl: string): string {
  const forks = parseInt(process.env.AR_DB_FORKS ?? "1", 10);
  if (!Number.isFinite(forks) || forks <= 1) return baseUrl;

  const raw = parseInt(process.env.VITEST_WORKER_ID ?? "1", 10);
  const slot = ((raw - 1) % forks) + 1;
  if (slot === 1) return baseUrl;

  const url = new URL(baseUrl);
  const db = url.pathname.replace(/^\//, "");
  if (!db) throw new Error(`workerDbUrl: no database name in URL: ${baseUrl}`);
  url.pathname = `/${db}_${slot}`;
  return url.toString();
}

if (process.env.PG_TEST_URL) {
  process.env.PG_TEST_URL = workerDbUrl(process.env.PG_TEST_URL);
}
if (process.env.MYSQL_TEST_URL) {
  process.env.MYSQL_TEST_URL = workerDbUrl(process.env.MYSQL_TEST_URL);
}
