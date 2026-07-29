/**
 * Phase 0 probe: confirms the sqlite template-clone mechanism is active
 * and that canonical DDL was issued exactly once for this vitest invocation.
 * Skipped automatically on PG/MySQL runs (env vars not set).
 *
 * The `registerDbFileCleanupOnExit` suite is adapter-agnostic and always runs;
 * it takes its own listeners back off so they don't accumulate across files.
 */
import { describe, it, expect, afterEach } from "vitest";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import {
  TEMPLATE_PATH_ENV,
  RUN_TOKEN_ENV,
  WORKER_DB_ENV,
  isSqliteRun,
  registerDbFileCleanupOnExit,
  sweepRunDbFiles,
  sweepStaleDbFiles,
  unlinkDbFiles,
} from "./sqlite-template.js";

const SIDECARS = ["", "-wal", "-shm"];

async function tmpPath(): Promise<string> {
  const os = await getOsAsync();
  return `${os.tmpdir()}/ar-test-cleanup-${Math.random().toString(36).slice(2)}.sqlite`;
}

describe("registerDbFileCleanupOnExit", () => {
  const added: Array<() => void> = [];

  async function register(base: string): Promise<Array<() => void>> {
    const before = new Set(process.listeners("exit"));
    await registerDbFileCleanupOnExit(base);
    const fresh = process.listeners("exit").filter((fn) => !before.has(fn)) as Array<() => void>;
    added.push(...fresh);
    return fresh;
  }

  afterEach(() => {
    for (const fn of added.splice(0)) process.off("exit", fn);
  });

  it("runs its exit listener to unlink the DB file and its WAL sidecars", async () => {
    const fs = await getFsAsync();
    const base = await tmpPath();
    for (const suffix of SIDECARS) fs.writeFileSync(base + suffix, "");

    const [listener] = await register(base);
    expect(listener, "registration must add exactly one exit listener").toBeDefined();
    listener();

    for (const suffix of SIDECARS) expect(await fs.exists(base + suffix)).toBe(false);
  });

  it("registers a path only once per process", async () => {
    const base = await tmpPath();
    expect(await register(base)).toHaveLength(1);
    expect(await register(base)).toHaveLength(0);
  });

  it("tolerates a DB file that was never created", async () => {
    const fs = await getFsAsync();
    const base = await tmpPath();
    expect(() => unlinkDbFiles(fs, base)).not.toThrow();
  });
});

describe("sweepRunDbFiles", () => {
  const token = () => `sweep${Math.random().toString(36).slice(2)}`;

  async function seed(name: string): Promise<string> {
    const [fs, os] = [await getFsAsync(), await getOsAsync()];
    const target = `${os.tmpdir()}/${name}`;
    fs.writeFileSync(target, "");
    return target;
  }

  it("unlinks every temp DB stamped with the run token, sidecars included", async () => {
    const fs = await getFsAsync();
    const run = token();
    const seeded = await Promise.all([
      seed(`ar-test-template-${run}.sqlite`),
      seed(`ar-test-worker-${run}-1.sqlite`),
      seed(`ar-test-worker-${run}-1.sqlite-wal`),
      seed(`ar-test-worker-${run}-1.sqlite-shm`),
      seed(`ar-test-worker-${run}-1.sqlite_arunit2`),
      seed(`ar-test-animals-${run}-2.sqlite`),
    ]);

    await sweepRunDbFiles(run);

    for (const target of seeded) expect(await fs.exists(target), target).toBe(false);
  });

  it("leaves a concurrent run's files alone", async () => {
    const fs = await getFsAsync();
    const other = await seed(`ar-test-worker-${token()}-1.sqlite`);
    try {
      await sweepRunDbFiles(token());
      expect(await fs.exists(other)).toBe(true);
    } finally {
      unlinkDbFiles(fs, other);
    }
  });
});

describe("sweepStaleDbFiles", () => {
  it("keeps a temp DB that a running suite could still be using", async () => {
    const fs = await getFsAsync();
    const fresh = `${(await getOsAsync()).tmpdir()}/ar-test-worker-stale${Math.random()
      .toString(36)
      .slice(2)}-1.sqlite`;
    fs.writeFileSync(fresh, "");
    try {
      await sweepStaleDbFiles();
      expect(await fs.exists(fresh)).toBe(true);
    } finally {
      unlinkDbFiles(fs, fresh);
    }
  });
});

describe.skipIf(!isSqliteRun())("sqlite template-clone (Phase 0 probe)", () => {
  it("globalSetup built a template file for this run", async () => {
    const templatePath = process.env[TEMPLATE_PATH_ENV];
    expect(templatePath, "AR_TEST_TEMPLATE_PATH must be set by globalSetup").toBeTruthy();

    const fs = await getFsAsync();
    expect(await fs.exists(templatePath!), `template file must exist at ${templatePath}`).toBe(
      true,
    );
  });

  it("this worker has a per-worker clone keyed by its pool slot", async () => {
    const workerDb = process.env[WORKER_DB_ENV];
    expect(workerDb, "AR_TEST_WORKER_DB must be set by test-setup-worker-db").toBeTruthy();

    const fs = await getFsAsync();
    expect(await fs.exists(workerDb!), `worker clone must exist at ${workerDb}`).toBe(true);

    // The clone path embeds the vitest worker's pool slot ID
    // (`ar-test-worker-<token>-<slot>.sqlite`), mirroring how Rails keys each
    // parallel test DB by fork index (test_databases.rb). Two workers with
    // different VITEST_POOL_IDs resolve to different paths, making cross-worker
    // DB sharing structurally impossible.
    const slot = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
    expect(workerDb).toContain(`-${slot}.sqlite`);

    // Also distinct from the shared template — workers write to their own clone.
    expect(workerDb).not.toBe(process.env[TEMPLATE_PATH_ENV]);
  });

  it("per-run token appears in both template and worker clone paths", () => {
    const runToken = process.env[RUN_TOKEN_ENV];
    expect(runToken, "AR_TEST_RUN_TOKEN must be set by globalSetup").toBeTruthy();

    expect(process.env[TEMPLATE_PATH_ENV]).toContain(runToken);
    expect(process.env[WORKER_DB_ENV]).toContain(runToken);
  });
});
