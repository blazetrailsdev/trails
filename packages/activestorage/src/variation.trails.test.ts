import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { ActiveStorage } from "./active-storage.js";
import { Variation } from "./variation.js";

describe("Variation", () => {
  beforeAll(() => {
    ActiveStorage.verifier ??= new MessageVerifier("secret");
  });

  it("round-trips transformations through encode and decode", () => {
    const transformations = { resizeToLimit: [100, 100] };
    expect(Variation.decode(Variation.encode(transformations)).transformations).toEqual(
      transformations,
    );
  });

  it("wraps a variation, a key and a hash", () => {
    const variation = new Variation({ rotate: 90 });
    expect(Variation.wrap(variation)).toBe(variation);
    expect(Variation.wrap(variation.key).transformations).toEqual({ rotate: 90 });
    expect(Variation.wrap({ rotate: 90 }).transformations).toEqual({ rotate: 90 });
  });

  it("keeps a given format over the default", () => {
    const variation = new Variation({ format: "jpg" }).defaultTo({ format: "png" });
    expect(variation.format).toBe("jpg");
    expect(variation.contentType).toBe("image/jpeg");
  });

  it("defaults to png and rejects an unknown format", () => {
    expect(new Variation({}).format).toBe("png");
    expect(() => new Variation({ format: "nope" }).format).toThrow(ArgumentError);
  });

  it("computes a stable digest", () => {
    expect(new Variation({ rotate: 90 }).digest).toBe(new Variation({ rotate: 90 }).digest);
    expect(new Variation({ rotate: 90 }).digest).not.toBe(new Variation({ rotate: 91 }).digest);
  });
});
