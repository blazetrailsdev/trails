import { afterEach, describe, expect, it } from "vitest";
import { setTrailsRoot, trailsRoot } from "./trails-root.js";

describe("trailsRoot", () => {
  afterEach(() => setTrailsRoot(null));

  it("is null by default (bare ActiveRecord usage)", () => {
    expect(trailsRoot()).toBeNull();
  });

  it("reflects the injected root", () => {
    setTrailsRoot("/srv/app");
    expect(trailsRoot()).toBe("/srv/app");
  });

  it("clears back to null", () => {
    setTrailsRoot("/srv/app");
    setTrailsRoot(null);
    expect(trailsRoot()).toBeNull();
  });
});
