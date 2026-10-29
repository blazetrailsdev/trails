import { describe, expect, it } from "vitest";
import "../index.js";
import * as Errors from "./errors.js";

describe("ActiveRecord::Encryption::Errors", () => {
  it("names each bodiless error by its own class path", () => {
    expect(new Errors.Decryption("x").name).toBe("ActiveRecord::Encryption::Errors::Decryption");
    expect(new Errors.ForbiddenClass().name).toBe(
      "ActiveRecord::Encryption::Errors::ForbiddenClass",
    );
    expect(new Errors.Base().name).toBe("ActiveRecord::Encryption::Errors::Base");
  });
});
