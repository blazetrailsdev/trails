import { describe, expect, it } from "vitest";
import { IDHash } from "./dhash-vips.js";
import { distance, fixtureImage } from "./test-helper.js";

describe("DHashVips::IDHash", () => {
  it("fingerprint matches dhash-vips over the same thumbnail", async () => {
    const hash = await IDHash.fingerprint(fixtureImage("portrait.jpg").path()!);
    expect(hash.toString(16)).toBe(
      "81ff7c381c3800ff6c683c3e78e4e4e67800017ec68100ffedfdbec0871011fe",
    );
  });

  it.each([
    ["portrait", "rotated", true],
    ["portrait", "fit", true],
    ["portrait", "square", false],
    ["portrait", "landscape", false],
    ["portrait", "composited", false],
    ["square", "landscape", false],
    ["fill", "cover", false],
  ] as const)("%s and %s are similar: %s", async (a, b, similar) => {
    const d = await distance(fixtureImage(`${a}.jpg`), fixtureImage(`${b}.jpg`));
    expect(d <= 3).toBe(similar);
  });

  it("median matches the gem's self-checks", () => {
    expect(IDHash.median([1, 2, 2, 2, 2, 2, 3])).toBe(2);
    expect(IDHash.median([1, 2, 2, 2, 2, 3, 3])).toBe(3);
    expect(IDHash.median([1, 1, 2, 2, 3, 3, 3])).toBe(3);
    expect(IDHash.median([1, 1, 1, 2, 3, 3, 3])).toBe(2);
    expect(IDHash.median([1, 1, 2, 2, 2, 2, 3])).toBe(2);
    expect(IDHash.median([1, 2, 2, 2, 2, 3])).toBe(2);
    expect(IDHash.median([1, 2, 2, 3, 3, 3])).toBe(3);
    expect(IDHash.median([1, 1, 1])).toBe(1);
    expect(IDHash.median([1, 1])).toBe(1);
  });
});
