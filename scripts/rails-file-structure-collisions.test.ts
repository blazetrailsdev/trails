import { describe, it, expect } from "vitest";
import {
  lastSegment,
  qualifyByParent,
  resolveLastSegmentCollision,
} from "./rails-file-structure-collisions.js";

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

describe("qualifyByParent", () => {
  it("keys same-depth siblings under different parents by their enclosing class", () => {
    const fqns = [
      "Thor::UndefinedCommandError::SpellChecker",
      "Thor::UnknownArgumentError::SpellChecker",
    ];
    expect(resolveLastSegmentCollision(fqns)).toBeNull();
    expect(qualifyByParent(fqns)).toEqual(
      new Map([
        ["Thor::UndefinedCommandError::SpellChecker", "UndefinedCommandError.SpellChecker"],
        ["Thor::UnknownArgumentError::SpellChecker", "UnknownArgumentError.SpellChecker"],
      ]),
    );
  });

  it("has no keys when two fqns share a parent segment", () => {
    expect(qualifyByParent(["A::Foo::Builder", "B::Foo::Builder"])).toBeNull();
  });

  it("has no keys for an fqn with no enclosing class", () => {
    expect(qualifyByParent(["Builder", "Foo::Builder"])).toBeNull();
  });
});
