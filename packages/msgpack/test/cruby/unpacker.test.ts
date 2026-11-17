import { beforeEach, describe, expect, it } from "vitest";
import { EOFError } from "@blazetrails/ruby-compat";
import { MalformedFormatError, Packer, StackError, Unpacker } from "../../lib/index.js";

const bin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("Unpacker", () => {
  let unpacker: Unpacker;
  let packer: Packer;
  beforeEach(() => {
    unpacker = new Unpacker();
    packer = new Packer();
  });

  it("skip_nil succeeds", () => {
    unpacker.feed(bin("\xc0"));
    expect(unpacker.skipNil()).toBe(true);
  });

  it("skip_nil fails", () => {
    unpacker.feed(bin("\x90"));
    expect(unpacker.skipNil()).toBe(false);
  });

  it("skip skips objects", () => {
    packer.write(1);
    packer.write(2);
    packer.write(3);
    packer.write(4);
    packer.write(5);

    const unpacker = new Unpacker();
    unpacker.feed(packer.toS());

    expect(unpacker.read()).toBe(1);
    unpacker.skip();
    expect(unpacker.read()).toBe(3);
    unpacker.skip();
    expect(unpacker.read()).toBe(5);
  });

  it("skip raises EOFError", () => {
    expect(() => unpacker.skip()).toThrow(EOFError);
  });

  it("skip_nil raises EOFError", () => {
    expect(() => unpacker.skipNil()).toThrow(EOFError);
  });

  it("skip raises level stack too deep error", () => {
    for (let i = 0; i < 512; i++) packer.writeArrayHeader(1);
    packer.write(null);

    const unpacker = new Unpacker();
    unpacker.feed(packer.toS());
    expect(() => unpacker.skip()).toThrow(StackError);
  });

  it("skip raises invalid byte error", () => {
    unpacker.feed(bin("\xc1"));
    expect(() => unpacker.skip()).toThrow(MalformedFormatError);
  });
});
