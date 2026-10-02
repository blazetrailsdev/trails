import { describe, expect, it } from "vitest";
import { StandardError } from "@blazetrails/ruby-compat";
import { Error as BCryptError, Errors } from "./index.js";

describe("Errors", () => {
  describe("BCrypt::Error", () => {
    it("can be rescued as a StandardError", () => {
      expect(BCryptError.prototype).toBeInstanceOf(StandardError);
    });
  });

  for (const name of ["InvalidCost", "InvalidHash", "InvalidSalt", "InvalidSecret"] as const) {
    describe(`BCrypt::Errors::${name}`, () => {
      it("can be rescued as a BCrypt::Error", () => {
        expect(Errors[name].prototype).toBeInstanceOf(BCryptError);
      });
    });
  }
});
