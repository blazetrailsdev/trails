import { afterEach, describe, expect, it } from "vitest";
import { Trails, setTrailsRoot, trailsRoot } from "./trails-root.js";

describe("Trails.root", () => {
  afterEach(() => setTrailsRoot(null));

  it("is null by default (bare ActiveRecord usage)", () => {
    expect(trailsRoot()).toBeNull();
    expect(Trails.root).toBeNull();
  });

  it("reflects the injected root through both accessors", () => {
    setTrailsRoot("/srv/app");
    expect(trailsRoot()).toBe("/srv/app");
    expect(Trails.root).toBe("/srv/app");
  });

  it("can be set through the Trails namespace", () => {
    Trails.root = "/srv/other";
    expect(trailsRoot()).toBe("/srv/other");
  });

  it("clears back to null", () => {
    setTrailsRoot("/srv/app");
    setTrailsRoot(null);
    expect(trailsRoot()).toBeNull();
  });
});
