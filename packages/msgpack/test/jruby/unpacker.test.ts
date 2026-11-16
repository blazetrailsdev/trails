import { describe, it } from "vitest";

describe("MessagePack::Unpacker", () => {
  describe("#execute/#execute_limit/#finished?", () => {
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("extracts an object from the buffer", () => {});
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("extracts an object from the buffer, starting at an offset", () => {});
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("extracts an object from the buffer, starting at an offset reading bytes up to a limit", () => {});
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("extracts nothing if the limit cuts an object in half", () => {});
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("returns the offset where the object ended", () => {});
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("is finished if #data returns an object", () => {});
  });

  describe("#each", () => {
    describe("with a StringIO stream", () => {
      // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
      it.skip("yields each object in the stream", () => {});
    });

    describe("with a File stream", () => {
      // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
      it.skip("yields each object in the stream", () => {});
    });
  });

  describe("#fill", () => {
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("is a no-op", () => {});
  });

  describe("encoding", () => {
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("produces results with encoding as binary or string(utf8)", () => {});
    // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
    it.skip("recodes to internal encoding", () => {});
  });

  describe("extensions", () => {
    describe("symbolized keys", () => {
      // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
      it.skip("can symbolize keys when using #execute", () => {});
    });

    describe("encoding", () => {
      // PERMANENT-SKIP: JRuby-only Unpacker API (#execute, #data, #stream=, #fill); the CRuby extension this package ports defines none of it (ext/msgpack/unpacker_class.c:426-446).
      it.skip("decode binary as ascii-8bit string when using #execute", () => {});
    });
  });
});
