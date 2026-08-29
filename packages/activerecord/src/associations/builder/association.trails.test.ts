import { describe, it, expect } from "vitest";
import { Association } from "./association.js";
import { Author } from "../../test-helpers/models/author.js";

describe("Builder::Association VALID_OPTIONS", () => {
  it("does not accept a scope in the options hash", () => {
    expect(Association.VALID_OPTIONS).not.toContain("scope");
    expect(() => {
      (Author as unknown as { hasMany(name: string, options: object): void }).hasMany(
        "scoped_posts",
        { scope: (rel: unknown) => rel },
      );
    }).toThrow(/^Unknown key: :scope\. Valid keys are: /);
  });
});
