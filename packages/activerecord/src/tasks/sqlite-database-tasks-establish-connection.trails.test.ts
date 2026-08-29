import { describe, it, expect, vi, afterEach } from "vitest";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";

describe("SQLiteDatabaseTasks#establish_connection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("establishes the connection and then connects it", async () => {
    const calls: string[] = [];
    const configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    const tasks = new SQLiteDatabaseTasks(configuration);
    vi.spyOn(Base, "establishConnection").mockImplementation(async () => {
      calls.push("establishConnection");
    });
    Object.assign(tasks, {
      connection: async () => ({
        connectBang: async () => {
          calls.push("connectBang");
        },
      }),
    });

    await (tasks as unknown as { establishConnection(): Promise<void> }).establishConnection();

    expect(calls).toEqual(["establishConnection", "connectBang"]);
  });
});
