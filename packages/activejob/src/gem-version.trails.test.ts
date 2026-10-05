import { describe, expect, it } from "vitest";
import { Gem } from "@blazetrails/ruby-compat";
import { VERSION, gemVersion } from "./gem-version.js";

describe("ActiveJob.gem_version", () => {
  it("is a Gem::Version built from VERSION::STRING", () => {
    expect(VERSION.STRING).toBe("8.0.2");
    expect(gemVersion()).toBeInstanceOf(Gem.Version);
    expect(gemVersion().version).toBe(VERSION.STRING);
  });
});
