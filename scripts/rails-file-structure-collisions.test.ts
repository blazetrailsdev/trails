import { describe, it, expect } from "vitest";
import { lastSegment, resolveLastSegmentCollision } from "./rails-file-structure-collisions.js";

describe("lastSegment", () => {
  it("takes the fqn's last segment", () => {
    expect(lastSegment("Arel::Nodes::Casted")).toBe("Casted");
  });

  it("returns an unqualified name unchanged", () => {
    expect(lastSegment("Casted")).toBe("Casted");
  });
});

describe("resolveLastSegmentCollision", () => {
  it("returns the only fqn when there is no collision", () => {
    expect(resolveLastSegmentCollision(["ActionDispatch::Journey::Scanner"])).toBe(
      "ActionDispatch::Journey::Scanner",
    );
  });

  // The live case: actionpack/lib/action_dispatch/journey/scanner.rb declares
  // `Scanner` (line 9) and, nested inside it, `Scanner::Scanner` (line 20).
  it("gives the bare name to the shallower fqn of a same-named nested class", () => {
    expect(
      resolveLastSegmentCollision([
        "ActionDispatch::Journey::Scanner::Scanner",
        "ActionDispatch::Journey::Scanner",
      ]),
    ).toBe("ActionDispatch::Journey::Scanner");
  });

  it("has no winner for siblings colliding at the same depth", () => {
    expect(resolveLastSegmentCollision(["Foo::Builder", "Bar::Builder"])).toBeNull();
  });

  it("has no winner for an empty set", () => {
    expect(resolveLastSegmentCollision([])).toBeNull();
  });
});
