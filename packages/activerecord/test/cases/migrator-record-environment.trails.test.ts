import { describe, it, expect, vi, afterEach } from "vitest";
import { ActiveRecord } from "../../lib/namespaces.js";
import { Migrator } from "../../lib/migration.js";
import { NullPool } from "../../lib/connection-adapters/abstract/connection-pool.js";
import type { SchemaMigration } from "../../lib/schema-migration.js";
import type { InternalMetadata } from "../../lib/internal-metadata.js";

describe("Migrator#record_environment on a bare adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stamps a NullPool's nil env name as NULL", async () => {
    vi.spyOn(ActiveRecord.Tasks.DatabaseTasks, "migrationConnection").mockResolvedValue({
      pool: new NullPool(),
    } as never);
    const set = vi.fn(async () => {});
    const migrator = new Migrator(
      "up",
      [],
      {} as SchemaMigration,
      { set } as unknown as InternalMetadata,
    );
    await migrator.recordEnvironment();
    expect(set).toHaveBeenCalledWith("environment", null);
  });
});
