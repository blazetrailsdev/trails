import { StandardError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Error, Mysql2 } from "../lib/index.js";

describe("Mysql2::Error", () => {
  it("answers error_number, sql_state, errno and error", () => {
    const err = new Error("boom", 80000, 1064, "42000");
    expect(err).toBeInstanceOf(StandardError);
    expect(err.errorNumber).toBe(1064);
    expect(err.sqlState).toBe("42000");
    expect(err.errno).toBe(1064);
    expect(err.error).toBe("boom");
  });

  it("new_with_args picks the class from CODES", () => {
    expect(Error.newWithArgs("t", null, 1205, null)).toBeInstanceOf(Error.TimeoutError);
    expect(Error.newWithArgs("c", null, 2006, null)).toBeInstanceOf(Error.ConnectionError);
    expect(Error.newWithArgs("x", null, 1064, null).constructor).toBe(Error);
  });

  it("is seated on the Mysql2 namespace", () => {
    expect(Mysql2.Error).toBe(Error);
  });
});
