/**
 * Covers the invariants callers of `scratchDatabasePath` depend on: a path that
 * is stable per label (so an adapter can be closed and reopened against the
 * same database), distinct across labels (so `MultiDbMigratorTest`'s two pools
 * really are two databases), never `:memory:`, and empty on first use.
 *
 * The listeners `registerDbFileCleanupOnExit` attaches are taken back off in
 * `afterAll` so they don't accumulate across test files.
 */
import { describe, it, expect, afterAll } from "vitest";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import { unlinkDbFiles } from "./sqlite-template.js";
import { scratchDatabasePath } from "./scratch-database.js";

describe("scratchDatabasePath", () => {
  const before = new Set(process.listeners("exit"));

  afterAll(async () => {
    const fs = await getFsAsync();
    for (const path of [
      await scratchDatabasePath("scratch-database-spec"),
      await scratchDatabasePath("scratch-database-spec-other"),
    ]) {
      unlinkDbFiles(fs, path);
    }
    for (const fn of process.listeners("exit")) {
      if (!before.has(fn)) process.off("exit", fn);
    }
  });

  it("returns the same path for the same label", async () => {
    expect(await scratchDatabasePath("scratch-database-spec")).toBe(
      await scratchDatabasePath("scratch-database-spec"),
    );
  });

  it("returns distinct paths for distinct labels", async () => {
    expect(await scratchDatabasePath("scratch-database-spec")).not.toBe(
      await scratchDatabasePath("scratch-database-spec-other"),
    );
  });

  it("returns an on-disk path under the temp root, never :memory:", async () => {
    const os = await getOsAsync();
    const path = await scratchDatabasePath("scratch-database-spec");

    expect(path).not.toBe(":memory:");
    expect(path.startsWith(os.tmpdir())).toBe(true);
    expect(path).toContain("scratch-database-spec");
  });

  it("wipes a database left behind by an earlier run", async () => {
    const fs = await getFsAsync();
    // The label has not been resolved yet, so this run's `writeFileSync` stands
    // in for a file a killed run left at the same deterministic path.
    const stale = (await scratchDatabasePath("scratch-database-spec")).replace(
      "scratch-database-spec",
      "scratch-database-stale",
    );
    fs.writeFileSync(stale, "not a database");
    expect(fs.existsSync(stale)).toBe(true);

    expect(await scratchDatabasePath("scratch-database-stale")).toBe(stale);
    expect(fs.existsSync(stale)).toBe(false);
  });
});
