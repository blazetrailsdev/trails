import { describe, expect, it } from "vitest";
import { Gem } from "@blazetrails/ruby-compat";
import { gemVersion, version } from "./index.js";

describe("ActionCable.version", () => {
  it("is the Gem::Version gem_version answers", () => {
    expect(version()).toBeInstanceOf(Gem.Version);
    expect(version().version).toBe(gemVersion().version);
  });
});
