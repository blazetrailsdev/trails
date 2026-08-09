/**
 * Trails-only cover for `SQLiteDatabaseTasks#purge`
 * (`sqlite_database_tasks.rb:30-37`). Rails' own `sqlite_rake_test.rb` is not
 * in the vendored tree, so there is no test to port; what is pinned here is the
 * single behavior the rescue clause decides. Ruby rescues `NoDatabaseError` and
 * nothing else, so a `drop` that fails for any other reason propagates, and the
 * `ensure` runs `create` on that path too.
 *
 * `drop` and `create` are stubbed so the assertions land on the rescue clause
 * rather than on file I/O; `create` is counted because Ruby's `ensure` runs it
 * on every path, including the raising one.
 */
import { describe, it, expect } from "vitest";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { NoDatabaseError } from "../errors.js";
import { HashConfig } from "../database-configurations/hash-config.js";

describe("SQLiteDatabaseTasks#purge", () => {
  function tasksWith(dropError: Error): { tasks: SQLiteDatabaseTasks; created: () => number } {
    const configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    const tasks = new SQLiteDatabaseTasks(configuration);
    let created = 0;
    Object.assign(tasks, {
      drop: async () => {
        throw dropError;
      },
      create: async () => {
        created += 1;
      },
      connection: async () => ({
        disconnectBang: () => {},
        whenClosed: async () => {},
        reconnectBang: async () => {},
      }),
    });
    return { tasks, created: () => created };
  }

  it("swallows NoDatabaseError and still creates", async () => {
    const { tasks, created } = tasksWith(new NoDatabaseError("no such database"));
    await expect(tasks.purge()).resolves.toBeUndefined();
    expect(created()).toBe(1);
  });

  it("propagates every other error and still creates", async () => {
    const { tasks, created } = tasksWith(Object.assign(new Error("EACCES"), { code: "EACCES" }));
    await expect(tasks.purge()).rejects.toThrow("EACCES");
    expect(created()).toBe(1);
  });
});
