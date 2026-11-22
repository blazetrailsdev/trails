import { describe, expect, it } from "vitest";

import { LANDING_TILES } from "../src/lib/landing-tiles";
import { publishedPackages } from "../src/lib/parity";

describe("landing tiles", () => {
  it("names only published packages, each once", async () => {
    const published = new Set((await publishedPackages()).map((p) => p.dir));
    expect(LANDING_TILES.filter((t) => !published.has(t))).toEqual([]);
    expect(new Set(LANDING_TILES).size).toBe(LANDING_TILES.length);
  });
});
