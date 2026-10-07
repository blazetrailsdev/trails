import { describe, expect, it } from "vitest";
import { StandardError } from "@blazetrails/ruby-compat";
import { DatabaseNotSupported } from "./database-tasks.js";

describe("DatabaseNotSupported", () => {
  it("is a StandardError named by its Rails path", () => {
    const error = new DatabaseNotSupported("Rake tasks not supported by 'x' adapter");

    expect(error).toBeInstanceOf(StandardError);
    expect(error.name).toBe("ActiveRecord::Tasks::DatabaseNotSupported");
    expect(Object.prototype.hasOwnProperty.call(error, "name")).toBe(false);
  });
});
