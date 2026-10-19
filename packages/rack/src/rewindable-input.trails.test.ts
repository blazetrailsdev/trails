import { describe, it, expect } from "vitest";
import { Errno, StringIO } from "@blazetrails/ruby-compat";
import { RewindableInput } from "./rewindable-input.js";

const variants: [string, () => any][] = [
  ["an IO object that is already rewindable", () => new StringIO("\xff\xfehello")],
  [
    "an IO object that is not rewindable",
    () => {
      const io: any = new StringIO("\xff\xfehello");
      io.rewind = undefined;
      return io;
    },
  ],
  [
    "an IO object whose rewind method raises Errno::ESPIPE",
    () => {
      const io: any = new StringIO("\xff\xfehello");
      io.rewind = () => {
        throw new Errno.ESPIPE("You can't rewind this!");
      };
      return io;
    },
  ],
];

describe("Rack::RewindableInput with binary bytes", () => {
  for (const [name, makeIo] of variants) {
    it(`buffers bytes >= 0x80 unchanged given ${name}`, () => {
      const rio = new RewindableInput(makeIo());
      try {
        expect(rio.read()).toBe("\xff\xfehello");
        expect(rio.size()).toBe(7);
        rio.rewind();
        expect(rio.read(2)).toBe("\xff\xfe");
      } finally {
        rio.close();
      }
    });
  }

  it("rewrites the unwritten tail of a partial write once", () => {
    const rio: any = new RewindableInput(new StringIO("\xff\xfehello"));
    const superPosix = rio.isFilesystemHasPosixSemantics.bind(rio);
    rio.isFilesystemHasPosixSemantics = () => {
      const io = rio.rewindableIo;
      const superWrite = io.write.bind(io);
      io.write = (buffer: Uint8Array) => superWrite(buffer.slice(0, 2));
      return superPosix();
    };
    try {
      expect(rio.read()).toBe("\xff\xfehello");
    } finally {
      rio.close();
    }
  });
});

it("buffers multi-byte input byte for byte", () => {
  const bytes = new TextEncoder().encode("héllo wörld ✓");
  const rio = new RewindableInput(new StringIO(bytes));
  expect(rio.read()).toBe(String.fromCharCode(...bytes));
  expect(rio.size()).toBe(bytes.length);
  rio.close();
});
