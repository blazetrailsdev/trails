import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { PrivateReader } from "./private-reader.js";

class Sample {
  declare static privateReader: (...names: string[]) => void;
  declare reader: string;
  _reader = "RVALUE";

  getReader(): string {
    return this.reader;
  }
}
include(Sample, PrivateReader);
Sample.privateReader("reader", "a");

describe("TestPrivateAttrs", () => {
  // PERMANENT-SKIP: visibility has no runtime form (CLAUDE.md § "Method visibility is compile-time only").
  it.skip("private reader is private", () => {});

  it("private reader returns data", () => {
    expect(new Sample().getReader()).toBe("RVALUE");
  });
});
