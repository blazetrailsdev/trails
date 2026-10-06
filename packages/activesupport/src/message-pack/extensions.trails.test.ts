import { describe, expect, it } from "vitest";
import {
  EOFError,
  NameError,
  ZeroDivisionError,
  complex,
  rational,
} from "@blazetrails/ruby-compat";

import { Extensions, MissingClassError } from "./extensions.js";
import { Factory } from "./factory.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";

describe("MessagePackExtensionsTest", () => {
  const readRational = (numerator: number, denominator?: number) => {
    const factory = new Factory();
    const packer = factory.packer();
    packer.write(numerator);
    if (denominator !== undefined) packer.write(denominator);
    return factory.unpacker((unpacker) =>
      Extensions.readRational(unpacker.feedReference(packer.toBuffer())),
    );
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

  const dump = (value: unknown) => {
    const factory = new Factory();
    Extensions.install(factory);
    const packer = factory.packer();
    packer.write(value);
    return packer.toBuffer();
  };
  const load = (dumped: Buffer) => {
    const factory = new Factory();
    Extensions.install(factory);
    return factory.unpacker((unpacker) => unpacker.feedReference(dumped).read());
  };

  it("round-trips a Rational whose numerator is past Number.MAX_SAFE_INTEGER", () => {
    const wide = rational(12345678901234567891n, 1000);
    expect([...dump(wide)]).toEqual([
      199, 12, 3, 207, 171, 84, 169, 140, 235, 31, 10, 211, 205, 3, 232,
    ]);
    expect(load(dump(wide))).toEqual({ numerator: 12345678901234567891n, denominator: 1000n });
  });

  it("dumps Rational bytes identical to real Rails MessagePack", () => {
    expect([...dump(rational(1, 3))]).toEqual([213, 3, 1, 3]);
    expect([...dump(rational(2, 6))]).toEqual([213, 3, 1, 3]);
    expect([...dump(rational(0, 1))]).toEqual([212, 3, 0]);
    expect([...dump(rational(3, -4))]).toEqual([213, 3, 253, 4]);
  });

  it("dumps Complex bytes identical to real Rails MessagePack", () => {
    expect([...dump(complex(1, -1))]).toEqual([213, 4, 1, 255]);
    expect([...dump(complex(1, 0))]).toEqual([213, 4, 1, 0]);
    const nested = complex(1.5, rational(1, 2));
    expect([...dump(nested)]).toEqual([199, 13, 4, 203, 63, 248, 0, 0, 0, 0, 0, 0, 213, 3, 1, 2]);
    expect(load(dump(nested))).toEqual(nested);
  });

  it("raises EOFError on a truncated payload", () => {
    for (const bytes of [
      [0x92, 0x01],
      [0xcf, 0x01],
      [0xd3, 0x01],
      [0xcb, 0x01],
      [0xa5, 0x61],
      [],
    ]) {
      expect(() => load(Buffer.from(bytes))).toThrow(EOFError);
      expect(() => load(Buffer.from(bytes))).toThrow("end of buffer reached");
    }
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
    const result = factory.unpacker((unpacker) =>
      unpacker.feedReference(dumped).read(),
    ) as HashWithIndifferentAccess;
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(result.get("a")).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("load_class raises MissingClassError when the missing name is the whole name", () => {
    expect(() => Extensions.loadClass("LoadClassAbsent")).toThrow(MissingClassError);
    expect(() => Extensions.loadClass("LoadClassAbsent")).toThrow("Missing class: LoadClassAbsent");
  });

  it("load_class re-raises the NameError when a namespace of the path is missing", () => {
    let error: unknown;
    try {
      Extensions.loadClass("LoadClassAbsent::Nested");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NameError);
    expect(error).not.toBeInstanceOf(MissingClassError);
  });
});
