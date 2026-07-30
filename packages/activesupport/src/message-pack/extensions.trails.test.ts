import { describe, expect, it } from "vitest";
import { Extensions, ZeroDivisionError } from "./extensions.js";
import { Factory } from "./factory.js";

describe("MessagePackExtensionsTest", () => {
  const readRational = (numerator: number, denominator?: number) => {
    const factory = new Factory();
    const packer = factory.packer();
    packer.write(numerator);
    if (denominator !== undefined) packer.write(denominator);
    return Extensions.readRational(factory.unpacker(packer.toBuffer()));
  };

  it("normalizes the sign of a decoded Rational onto the numerator", () => {
    expect(readRational(1, -2)).toEqual({ numerator: -1, denominator: 2 });
    expect(readRational(-1, -2)).toEqual({ numerator: 1, denominator: 2 });
  });

  it("reduces a decoded Rational", () => {
    expect(readRational(2, 4)).toEqual({ numerator: 1, denominator: 2 });
  });

  it("raises on a zero denominator", () => {
    expect(() => readRational(1, 0)).toThrow(ZeroDivisionError);
  });

  it("reads a zero numerator without a denominator", () => {
    expect(readRational(0)).toEqual({ numerator: 0, denominator: 1 });
  });
});
