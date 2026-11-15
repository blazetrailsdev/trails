import { describe, expect, it } from "vitest";
import { Gem } from "../../lib/index.js";

describe("Gem::Requirement", () => {
  const v = (s: string) => new Gem.Version(s);

  it("satisfied_by? with the pessimistic operator", () => {
    const req = new Gem.Requirement("~> 3.0.0");
    expect(req.isSatisfiedBy(v("3.0.5"))).toBe(true);
    expect(req.isSatisfiedBy(v("3.1.0"))).toBe(false);
    expect(req.isSatisfiedBy(v("2.9"))).toBe(false);
  });

  it("parse defaults to = and raises BadRequirementError", () => {
    expect(new Gem.Requirement("1.2").requirements[0][0]).toBe("=");
    expect(new Gem.Requirement().requirements).toEqual([Gem.Requirement.DefaultRequirement]);
    expect(() => new Gem.Requirement("~> x")).toThrow(Gem.Requirement.BadRequirementError);
  });

  it("Version#bump and #release", () => {
    expect(v("5.2.4").bump().toString()).toBe("5.3");
    expect(v("5.0.0.beta").release().toString()).toBe("5.0.0");
    expect(v("5.0.0").release().toString()).toBe("5.0.0");
  });
});
