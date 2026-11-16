import { beforeEach, describe, expect, it } from "vitest";
import { EOFError } from "@blazetrails/ruby-compat";
import { Unpacker } from "../../lib/index.js";

const bin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("Unpacker", () => {
  let unpacker: Unpacker;
  beforeEach(() => {
    unpacker = new Unpacker();
  });

  it("skip_nil succeeds", () => {
    unpacker.feed(bin("\xc0"));
    expect(unpacker.skipNil()).toBe(true);
  });

  it("skip_nil fails", () => {
    unpacker.feed(bin("\x90"));
    expect(unpacker.skipNil()).toBe(false);
  });

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("skip skips objects", () => {});

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("skip raises EOFError", () => {});

  it("skip_nil raises EOFError", () => {
    expect(() => unpacker.skipNil()).toThrow(EOFError);
  });

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("skip raises level stack too deep error", () => {});

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("skip raises invalid byte error", () => {});
});
