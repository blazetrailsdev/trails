import { describe, it, expect } from "vitest";
import { Association } from "./association.js";
import { Author } from "../../test-helpers/models/author.js";

// `Builder::Association::VALID_OPTIONS`
// (associations/builder/association.rb:20-22) does not carry `:scope`: a scope
// only ever reaches an association as the second POSITIONAL argument
// (associations.rb:1302), and `create_reflection` hands the options hash
// straight to `assert_valid_keys` (association.rb:43,70).
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
