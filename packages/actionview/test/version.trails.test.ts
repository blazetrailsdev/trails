import { describe, expect, it } from "vitest";
import { Gem } from "@blazetrails/ruby-compat";
import { VERSION, gemVersion, version } from "../lib/index.js";

describe("ActionView.version", () => {
  it("is the Gem::Version gem_version answers", () => {
    expect(version()).toBeInstanceOf(Gem.Version);
    expect(version()).toBe(gemVersion());
    expect(version().version).toBe(VERSION.STRING);
  });
});
