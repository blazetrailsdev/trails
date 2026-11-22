import { describe, expect, it } from "vitest";
import { PACKAGE_GROUPS } from "./package-groups.js";
import { publishedPackages } from "./parity.js";

describe("PACKAGE_GROUPS", () => {
  it("places every published package in exactly one group", async () => {
    const placed = PACKAGE_GROUPS.flatMap((g) => g.packages);
    const published = (await publishedPackages()).map((p) => p.dir);
    expect([...placed].sort()).toEqual(published);
  });
});
