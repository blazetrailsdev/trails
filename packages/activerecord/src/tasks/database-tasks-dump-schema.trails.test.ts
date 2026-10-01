import { describe, it, expect, afterEach, vi } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

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
});
