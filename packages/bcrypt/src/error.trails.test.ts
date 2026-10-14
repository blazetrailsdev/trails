import { describe, expect, it } from "vitest";
import { rbModName } from "@blazetrails/ruby-compat";
import { Error as BCryptError, Errors } from "./index.js";

describe("BCrypt::Errors", () => {
  it("names each error class under the BCrypt::Errors module", () => {
    expect(rbModName(Errors)).toBe("BCrypt::Errors");
    expect(rbModName(BCryptError)).toBe("BCrypt::Error");
    expect(rbModName(Errors.InvalidSalt)).toBe("BCrypt::Errors::InvalidSalt");
    expect(rbModName(Errors.InvalidHash)).toBe("BCrypt::Errors::InvalidHash");
    expect(rbModName(Errors.InvalidCost)).toBe("BCrypt::Errors::InvalidCost");
    expect(rbModName(Errors.InvalidSecret)).toBe("BCrypt::Errors::InvalidSecret");
  });
});
