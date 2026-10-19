import { describe, it, expect, beforeEach } from "vitest";
import { NameError } from "@blazetrails/ruby-compat";

describe("UncorrectableNameCheckTest", () => {
  class FirstNameError extends NameError {}

  let error: FirstNameError;

  beforeEach(() => {
    try {
      throw new FirstNameError("Other name error");
    } catch (e) {
      expect(e).toBeInstanceOf(FirstNameError);
      error = e as FirstNameError;
    }
  });

  it("message", () => {
    expect(error.message).not.toMatch(/Did you mean\?/);
  });
});
