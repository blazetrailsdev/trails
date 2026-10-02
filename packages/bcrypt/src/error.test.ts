import { describe, expect, it } from "vitest";
import { StandardError } from "@blazetrails/ruby-compat";
import { Error as BCryptError, Errors } from "./index.js";

describe("Errors", () => {
  describe("BCrypt::Error", () => {
    it("can be rescued as a StandardError", () => {
      expect(BCryptError.prototype).toBeInstanceOf(StandardError);
    });
  });

  describe("BCrypt::Errors::InvalidCost", () => {
    it("can be rescued as a BCrypt::Error", () => {
      expect(Errors.InvalidCost.prototype).toBeInstanceOf(BCryptError);
    });
  });

  describe("BCrypt::Errors::InvalidHash", () => {
    it("can be rescued as a BCrypt::Error", () => {
      expect(Errors.InvalidHash.prototype).toBeInstanceOf(BCryptError);
    });
  });

  describe("BCrypt::Errors::InvalidSalt", () => {
    it("can be rescued as a BCrypt::Error", () => {
      expect(Errors.InvalidSalt.prototype).toBeInstanceOf(BCryptError);
    });
  });

  describe("BCrypt::Errors::InvalidSecret", () => {
    it("can be rescued as a BCrypt::Error", () => {
      expect(Errors.InvalidSecret.prototype).toBeInstanceOf(BCryptError);
    });
  });
});
