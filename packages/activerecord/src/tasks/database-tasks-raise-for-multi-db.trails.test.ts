import { describe, it, expect, afterEach } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { Base } from "../base.js";

describe("DatabaseTasksRaiseForMultiDbTest", () => {
  afterEach(() => {
    Base.configurations({});
  });

  it("lists every namespaced task as a sentence", () => {
    Base.configurations({
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
    Base.configurations({
      storyenv: { primary: { adapter: "sqlite3", database: "primary.sqlite3" } },
    });

    expect(() =>
      DatabaseTasks.raiseForMultiDb("storyenv", { command: "db:migrate" }),
    ).not.toThrow();
  });
});
