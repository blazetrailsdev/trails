import { describe, expect, it } from "vitest";
import { rbHash } from "@blazetrails/ruby-compat";
import { Image } from "./image.js";
import { imagePath } from "./test-helpers/support/helpers.js";

describe("MiniMagick::Image signature cache", () => {
  it("answers #signature with a promise until identify has run, then synchronously", async () => {
    const image = new Image(imagePath());
    const cold = image.signature();
    expect(cold).toBeInstanceOf(Promise);
    expect(image.equals(new Image(imagePath()))).toBe(false);
    const signature = await cold;
    expect(image.signature()).toEqual(signature);
    expect(rbHash(image)).toEqual(rbHash(signature));
    const other = new Image(imagePath());
    await other.signature();
    expect(image.equals(other)).toBe(true);
  });
});
