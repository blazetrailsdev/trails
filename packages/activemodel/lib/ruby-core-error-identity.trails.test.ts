import { describe, it, expect } from "vitest";
import {
  ArgumentError as RubyCompatArgumentError,
  TypeError as RubyCompatTypeError,
} from "@blazetrails/ruby-compat";
import { ArgumentError as DateArgumentError, Date as RubyDate } from "@blazetrails/date";
import { ArgumentError as ActiveSupportArgumentError } from "@blazetrails/activesupport";
import { ArgumentError, TypeError } from "./attribute-assignment.js";

describe("Ruby core error identity across packages", () => {
  it("has one ArgumentError class for Ruby's one", () => {
    expect(ArgumentError).toBe(RubyCompatArgumentError);
    expect(DateArgumentError).toBe(RubyCompatArgumentError);
    expect(ActiveSupportArgumentError).toBe(RubyCompatArgumentError);
  });

  it("raises Date::Error through the shared ArgumentError", () => {
    const error = (() => {
      try {
        RubyDate.parse("not a date");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ArgumentError);
    expect((error as Error).name).toBe("Date::Error");
  });

  it("has one TypeError class for Ruby's one", () => {
    expect(TypeError).toBe(RubyCompatTypeError);
    expect(new TypeError("boom").name).toBe("TypeError");
  });
});
