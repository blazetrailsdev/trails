import { describe, it, expect, afterEach, vi } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { SchemaDumper } from "../connection-adapters/abstract/schema-dumper.js";
import { schemaFormat } from "../active-record.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("DatabaseTasksDumpSchemaTest (trails)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns before resolving a dump path when the config opts out of schema dumps", async () => {
    const schemaDumpPath = vi.spyOn(DatabaseTasks, "schemaDumpPath").mockReturnValue(null);
    const dbConfig = new HashConfig("storyenv", "primary", {
      adapter: "sqlite3",
      database: "primary.sqlite3",
      schemaDump: false,
    });

    await DatabaseTasks.dumpSchema(dbConfig);

    expect(schemaDumpPath).not.toHaveBeenCalled();
  });

  it("resolves a dump path when the config dumps its schema", async () => {
    const schemaDumpPath = vi.spyOn(DatabaseTasks, "schemaDumpPath").mockReturnValue(null);
    const dbConfig = new HashConfig("storyenv", "primary", {
      adapter: "sqlite3",
      database: "primary.sqlite3",
    });

    await DatabaseTasks.dumpSchema(dbConfig);

    expect(schemaDumpPath).toHaveBeenCalledOnce();
  });

  it("dumps in the format it was called with, not the global one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trails-dump-schema-format-"));
    try {
      vi.spyOn(DatabaseTasks, "schemaDumpPath").mockReturnValue(join(dir, "schema.js"));
      vi.spyOn(DatabaseTasks, "dbDir", "get").mockReturnValue(dir);
      vi.spyOn(DatabaseTasks, "migrationConnectionPool").mockReturnValue(null as never);
      let dumpedAs: string | undefined;
      vi.spyOn(SchemaDumper, "dump").mockImplementation((async (
        _pool: unknown,
        stream: unknown,
      ) => {
        dumpedAs = schemaFormat();
        return stream;
      }) as never);
      const dbConfig = new HashConfig("storyenv", "primary", {
        adapter: "sqlite3",
        database: "primary.sqlite3",
      });

      expect(schemaFormat()).toBe("ts");
      await DatabaseTasks.dumpSchema(dbConfig, "js");

      expect(dumpedAs).toBe("js");
      expect(schemaFormat()).toBe("ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
