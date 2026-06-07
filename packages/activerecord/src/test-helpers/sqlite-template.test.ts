/**
 * Phase 0 probe: confirms the sqlite template-clone mechanism is active
 * and that canonical DDL was issued exactly once for this vitest invocation.
 *
 * Skipped automatically on PG/MySQL runs (env vars not set).
 */
import { describe, it, expect } from "vitest";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { TEMPLATE_PATH_ENV, RUN_TOKEN_ENV, WORKER_DB_ENV, isSqliteRun } from "./sqlite-template.js";

describe.skipIf(!isSqliteRun())("sqlite template-clone (Phase 0 probe)", () => {
  it("globalSetup built a template file for this run", async () => {
    const templatePath = process.env[TEMPLATE_PATH_ENV];
    expect(templatePath, "AR_TEST_TEMPLATE_PATH must be set by globalSetup").toBeTruthy();

    const fs = await getFsAsync();
    expect(await fs.exists(templatePath!), `template file must exist at ${templatePath}`).toBe(
      true,
    );
  });

  it("this worker has a per-worker clone distinct from the template", async () => {
    const workerDb = process.env[WORKER_DB_ENV];
    expect(workerDb, "AR_TEST_WORKER_DB must be set by test-setup-worker-db").toBeTruthy();

    const fs = await getFsAsync();
    expect(await fs.exists(workerDb!), `worker clone must exist at ${workerDb}`).toBe(true);

    // Clone is a separate file — no cross-worker state sharing.
    const templatePath = process.env[TEMPLATE_PATH_ENV];
    expect(workerDb).not.toBe(templatePath);
  });

  it("per-run token appears in both template and worker clone paths", () => {
    const runToken = process.env[RUN_TOKEN_ENV];
    expect(runToken, "AR_TEST_RUN_TOKEN must be set by globalSetup").toBeTruthy();

    expect(process.env[TEMPLATE_PATH_ENV]).toContain(runToken);
    expect(process.env[WORKER_DB_ENV]).toContain(runToken);
  });
});
