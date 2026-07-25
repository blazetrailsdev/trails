/**
 * Phase 0 probe: confirms the sqlite template-clone mechanism is active
 * and that canonical DDL was issued exactly once for this vitest invocation.
 *
 * Skipped automatically on PG/MySQL runs (env vars not set).
 */
import { describe, it, expect } from "vitest";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import {
  TEMPLATE_PATH_ENV,
  RUN_TOKEN_ENV,
  WORKER_DB_ENV,
  isSqliteRun,
  registerDbFileCleanupOnExit,
  unlinkDbFiles,
} from "./sqlite-template.js";

describe("registerDbFileCleanupOnExit", () => {
  it("registers one exit listener per path", async () => {
    const base = `/tmp/ar-test-cleanup-probe-${Math.random().toString(36).slice(2)}.sqlite`;
    const before = process.listenerCount("exit");
    await registerDbFileCleanupOnExit(base);
    await registerDbFileCleanupOnExit(base);
    expect(process.listenerCount("exit")).toBe(before + 1);
  });

  it("unlinks the DB file and its WAL sidecars", async () => {
    const fs = await getFsAsync();
    const base = `/tmp/ar-test-cleanup-unlink-${Math.random().toString(36).slice(2)}.sqlite`;
    for (const suffix of ["", "-wal", "-shm"]) fs.writeFileSync(base + suffix, "");
    unlinkDbFiles(fs, base);
    for (const suffix of ["", "-wal", "-shm"]) expect(await fs.exists(base + suffix)).toBe(false);
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
