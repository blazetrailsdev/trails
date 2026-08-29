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
