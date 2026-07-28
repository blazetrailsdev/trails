import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stdout, stderr } from "@blazetrails/activesupport";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseAlreadyExists, NoDatabaseError } from "../errors.js";

function config(): HashConfig {
  return new HashConfig("development", "primary", { adapter: "sqlite3", database: "my-db" });
}

describe("DatabaseTasksBannersTest", () => {
  let out: string[];
  let err: string[];

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    vi.restoreAllMocks();
  });

  it("create prints the created banner", async () => {
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    await DatabaseTasks.create(config());
    expect(out.join("")).toEqual("Created database 'my-db'\n");
    expect(err).toEqual([]);
  });

  it("create prints already exists on DatabaseAlreadyExists", async () => {
    DatabaseTasks.registerTask("sqlite", {
      create: async () => {
        throw new DatabaseAlreadyExists("boom");
      },
    });
    await DatabaseTasks.create(config());
    expect(out).toEqual([]);
    expect(err.join("")).toEqual("Database 'my-db' already exists\n");
  });

  it("create reraises other errors after printing both lines", async () => {
    DatabaseTasks.registerTask("sqlite", {
      create: async () => {
        throw new Error("nope");
      },
    });
    await expect(DatabaseTasks.create(config())).rejects.toThrow("nope");
    expect(err.join("")).toEqual(
      "nope\nCouldn't create 'my-db' database. Please check your configuration.\n",
    );
  });

  it("drop prints the dropped banner", async () => {
    DatabaseTasks.registerTask("sqlite", { drop: async () => {} });
    await DatabaseTasks.drop(config());
    expect(out.join("")).toEqual("Dropped database 'my-db'\n");
  });

  it("drop prints does not exist on NoDatabaseError", async () => {
    DatabaseTasks.registerTask("sqlite", {
      drop: async () => {
        throw new NoDatabaseError("boom");
      },
    });
    await DatabaseTasks.drop(config());
    expect(out).toEqual([]);
    expect(err.join("")).toEqual("Database 'my-db' does not exist\n");
  });

  it("drop reraises other errors after printing both lines", async () => {
    DatabaseTasks.registerTask("sqlite", {
      drop: async () => {
        throw new Error("nope");
      },
    });
    await expect(DatabaseTasks.drop(config())).rejects.toThrow("nope");
    expect(err.join("")).toEqual("nope\nCouldn't drop database 'my-db'\n");
  });
});
