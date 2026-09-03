import { describe, expect, it } from "vitest";
import { ZeroDivisionError } from "@blazetrails/ruby-compat";

import { Extensions } from "./extensions.js";
import { Factory } from "./factory.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";

describe("MessagePackExtensionsTest", () => {
  const readRational = (numerator: number, denominator?: number) => {
    const factory = new Factory();
    const packer = factory.packer();
    packer.write(numerator);
    if (denominator !== undefined) packer.write(denominator);
    return Extensions.readRational(factory.unpacker(packer.toBuffer()));
  };

  it("normalizes the sign of a decoded Rational onto the numerator", () => {
    expect(readRational(1, -2)).toEqual({ numerator: -1n, denominator: 2n });
    expect(readRational(-1, -2)).toEqual({ numerator: 1n, denominator: 2n });
  });

  it("reduces a decoded Rational", () => {
    expect(readRational(2, 4)).toEqual({ numerator: 1n, denominator: 2n });
  });

  it("raises on a zero denominator", () => {
    expect(() => readRational(1, 0)).toThrow(ZeroDivisionError);
  });

  it("reads a zero numerator without a denominator", () => {
    expect(readRational(0)).toEqual({ numerator: 0n, denominator: 1n });
  });

  it("packs a nested HashWithIndifferentAccess through the type-17 handler again", () => {
    const factory = new Factory();
    Extensions.install(factory);
    const hwia = new HashWithIndifferentAccess({ a: { b: 1 } });
    const packer = factory.packer();
    packer.write(hwia);
    const dumped = packer.toBuffer();
    const nested = factory.packer();
    nested.write(new HashWithIndifferentAccess({ b: 1 }));
    expect([...dumped].join(",")).toContain([...nested.toBuffer()].join(","));
    const result = factory.unpacker(dumped).read() as HashWithIndifferentAccess;
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(result.get("a")).toBeInstanceOf(HashWithIndifferentAccess);
  });
});
