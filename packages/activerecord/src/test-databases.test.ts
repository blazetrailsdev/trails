import { describe, it, expect } from "vitest";
import { createAndMigrate, eachDatabase } from "./test-databases.js";
import { createTestAdapter } from "./test-adapter.js";
import type { MigrationProxy } from "./migration.js";

describe("TestDatabasesTest", () => {
  it.skip("databases are created", () => {});
  it.skip("create databases after fork", () => {});
  it.skip("order of configurations isnt changed by test databases", () => {});

  it("createAndMigrate runs migrations on all adapters", async () => {
    const adapter = createTestAdapter();
    const log: string[] = [];
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "M1",
        migration: () => ({
          up: async () => {
            log.push("up");
          },
          down: async () => {},
        }),
      },
    ];

    await createAndMigrate([adapter], migrations);
    expect(log).toEqual(["up"]);
  });

  it("eachDatabase iterates all adapters", async () => {
    const adapters = [createTestAdapter(), createTestAdapter(), createTestAdapter()];
    const visited: number[] = [];

    await eachDatabase(adapters, async (_adapter, index) => {
      visited.push(index);
    });

    expect(visited).toEqual([0, 1, 2]);
  });
});
