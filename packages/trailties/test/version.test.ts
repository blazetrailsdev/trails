import { describe, expect, it } from "vitest";
import { Gem } from "@blazetrails/ruby-compat";
import { Trails } from "../lib/trails.js";

describe("VersionTest", () => {
  it("trails version returns a string", () => {
    expect(typeof Trails.version()).toBe("string");
  });

  it("trails gem version returns a correct gem version object", () => {
    expect(Trails.gemVersion()).toBeInstanceOf(Gem.Version);
    expect(String(Trails.gemVersion())).toBe(Trails.version());
  });
});
