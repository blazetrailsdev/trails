import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError } from "../argument-error.js";
import { Gem } from "../gem.js";
import { stderr } from "../process-adapter.js";

describe("Gem::Version", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the version it was given", () => {
    expect(new Gem.Version("8.0.2").version).toBe("8.0.2");
    expect(`${new Gem.Version(" 1.2 ")}`).toBe("1.2");
    expect(new Gem.Version(3).version).toBe("3");
    expect(new Gem.Version(1.5).version).toBe("1.5");
    expect(new Gem.Version(1.0e-5).version).toBe("1.0e.pre.05");
  });

  it("reads an empty version as 0 and a dash as a prerelease segment", () => {
    expect(new Gem.Version("").version).toBe("0");
    expect(new Gem.Version("1.0-beta").version).toBe("1.0.pre.beta");
  });

  it("answers one object per version", () => {
    expect(new Gem.Version("8.0.2")).toBe(new Gem.Version("8.0.2"));
    class Sub extends Gem.Version {}
    expect(new Sub("8.0.2")).not.toBe(new Sub("8.0.2"));
  });

  it("raises ArgumentError for a malformed version", () => {
    expect(() => new Gem.Version("junk")).toThrow(ArgumentError);
    expect(() => new Gem.Version("junk")).toThrow("Malformed version number string junk");
    expect(Gem.Version.isCorrect("5.1")).toBe(true);
    expect(Gem.Version.isCorrect("an incorrect version")).toBe(false);
  });

  it("warns about a nil version unless Gem::Deprecate.skip", () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    expect(Gem.Version.isCorrect(null)).toBe(true);
    expect(write).toHaveBeenCalledWith(
      "nil versions are discouraged and will be deprecated in Rubygems 4\n",
    );
    write.mockClear();
    Gem.Deprecate.skip = true;
    try {
      expect(new Gem.Version(null).version).toBe("");
      expect(write).not.toHaveBeenCalled();
    } finally {
      Gem.Deprecate.skip = false;
    }
  });
});
