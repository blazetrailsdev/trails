import { describe, it, expect, afterEach } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";

describe("DatabaseTasksRaiseForMultiDbTest", () => {
  afterEach(() => {
    DatabaseTasks.databaseConfiguration = null;
  });

  it("lists every namespaced task as a sentence", () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      storyenv: {
        primary: { adapter: "sqlite3", database: "primary.sqlite3" },
        animals: { adapter: "sqlite3", database: "animals.sqlite3" },
        plants: { adapter: "sqlite3", database: "plants.sqlite3" },
      },
    });

    expect(() => DatabaseTasks.raiseForMultiDb("storyenv", { command: "db:migrate" })).toThrow(
      "You're using a multiple database application. To use `db:migrate` you must run the namespaced task with a VERSION. Available tasks are db:migrate:primary, db:migrate:animals, and db:migrate:plants.",
    );
  });

  it("does not raise for a single database", () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      storyenv: { primary: { adapter: "sqlite3", database: "primary.sqlite3" } },
    });

    expect(() =>
      DatabaseTasks.raiseForMultiDb("storyenv", { command: "db:migrate" }),
    ).not.toThrow();
  });
});
