/**
 * Lane-independent probe: globalSetup must stamp the run token on *every*
 * adapter lane, not just sqlite.
 *
 * The teardown sweep (`sweepRunDbFiles`) matches temp DB files by run token,
 * and `scratchDatabasePath` / `fallbackDatabasePath` mint on-disk sqlite files
 * whatever the active lane is — `multi-db-migrator.test.ts` opens one on a PG
 * run too. If the token were sqlite-only those files would carry the `"x"` (or
 * a random per-process) fallback stamp and survive the run.
 */
import { describe, it, expect } from "vitest";
import { RUN_TOKEN_ENV } from "./sqlite-template.js";
import { scratchDatabasePath } from "./scratch-database.js";

const runToken = process.env[RUN_TOKEN_ENV];

describe("temp sqlite DB sweep arming", () => {
  it("stamps the run token regardless of the active lane", () => {
    expect(runToken).toBeTruthy();
  });

  it("stamps scratch database paths with the swept run token", async () => {
    expect(await scratchDatabasePath("global-setup-probe")).toContain(`-${runToken}-`);
  });
});
