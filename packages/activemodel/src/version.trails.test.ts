import { describe, expect, it } from "vitest";
import { Gem } from "@blazetrails/ruby-compat";
import { VERSION, gemVersion } from "./gem-version.js";
import { version } from "./version.js";

describe("ActiveModel.version", () => {
  it("is the Gem::Version gem_version answers", () => {
    expect(version()).toBeInstanceOf(Gem.Version);
    expect(version()).toBe(gemVersion());
    expect(version().version).toBe(VERSION.STRING);
  });
});
