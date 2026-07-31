/**
 * Off-by-default instrumentation for the global between-test sweep.
 *
 * RFC 0064 wants to delete the global `beforeEach` reset
 * (`cases/helper.ts` → `resetTestAdapterState` → `resetTestTables`) on the
 * argument that per-file teardown already drops everything a test creates.
 * This records what the sweep *actually* drops so the argument can be checked
 * against a full-suite run before the sweep goes away: set `AR_SWEEP_REPORT`
 * to a directory and every dropped (i.e. non-boot-laid) table name is written
 * there, one JSON file per worker; leave it unset and nothing runs.
 *
 * Env reads go through activesupport's `getEnv`; async fs only.
 *
 * @internal Test infrastructure only.
 */
import { getEnv, getFsAsync } from "@blazetrails/activesupport";

type EnvReader = (name: string) => string | undefined;

const REPORT_DIR_ENV = "AR_SWEEP_REPORT";
const WORKER_ID_ENV = "VITEST_POOL_ID";

/** Names swept so far in this worker, keyed by adapter lane. */
const sweptByLane = new Map<string, Set<string>>();

/** Serializes the rewrite-whole-file flushes so concurrent sweeps can't interleave. */
let flushChain: Promise<void> = Promise.resolve();

export function sweepReportDir(read: EnvReader = getEnv): string | undefined {
  const dir = read(REPORT_DIR_ENV);
  return dir === undefined || dir === "" ? undefined : dir;
}

/**
 * Record the tables one sweep dropped. No-op unless `AR_SWEEP_REPORT` is set.
 *
 * The file is rewritten with the accumulated set rather than appended to, so a
 * worker that is killed mid-run still leaves a readable (if partial) report.
 */
export async function recordSweptTables(
  lane: string,
  tables: Iterable<string>,
  read: EnvReader = getEnv,
): Promise<void> {
  const dir = sweepReportDir(read);
  if (dir === undefined) return;

  let swept = sweptByLane.get(lane);
  if (!swept) {
    swept = new Set<string>();
    sweptByLane.set(lane, swept);
  }
  const before = swept.size;
  for (const table of tables) swept.add(table);
  if (swept.size === before) return;

  const names = [...swept].sort();
  flushChain = flushChain.then(() => writeReport(dir, lane, names, read));
  await flushChain;
}

/** Never throws: instrumentation must not be able to fail a test run. */
async function writeReport(
  dir: string,
  lane: string,
  names: readonly string[],
  read: EnvReader,
): Promise<void> {
  try {
    const fs = await getFsAsync();
    if (!fs.mkdir || !fs.writeFile) return;
    await fs.mkdir(dir, { recursive: true });
    const worker = read(WORKER_ID_ENV) ?? "0";
    await fs.writeFile(
      `${dir}/sweep-${lane}-${worker}.json`,
      `${JSON.stringify({ lane, worker, tables: names }, null, 2)}\n`,
    );
  } catch {
    return;
  }
}

/** Test seam: forget what this worker has recorded. @internal */
export function _resetSweepReport(): void {
  sweptByLane.clear();
}
