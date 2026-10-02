import { describe, expect, it } from "vitest";
import { StandardError } from "@blazetrails/ruby-compat";
import { Error as BCryptError, Errors } from "./index.js";

describe("Errors", () => {
  it("can be rescued as a StandardError", () => {
    expect(BCryptError.prototype).toBeInstanceOf(StandardError);
  });

  it("can be rescued as a BCrypt::Error", () => {
    for (const describedClass of Object.values(Errors)) {
      expect(describedClass.prototype).toBeInstanceOf(BCryptError);
    }
  });
});
