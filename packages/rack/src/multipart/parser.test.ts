import { describe, it, expect } from "vitest";
import {
  Parser,
  BoundaryTooLongError,
  EmptyContentError,
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  EOL,
  MULTIPART,
} from "./parser.js";
import { QueryParser } from "../query-parser.js";

const qp = QueryParser.makeDefault(100);
const noopIo = { read: (_size: number) => null as string | null };

describe("Rack::Multipart::Parser", () => {
  it("returns nil if the content type is not multipart", () => {
    expect(Parser.parseBoundary("application/x-www-form-urlencoded")).toBeNull();
  });

  it("parses boundary from multipart/form-data", () => {
    expect(Parser.parseBoundary("multipart/form-data; boundary=AaB03x")).toBe("AaB03x");
  });

  it("parses quoted boundary", () => {
    expect(Parser.parseBoundary('multipart/form-data; boundary="AaB03x"')).toBe("AaB03x");
  });

  it("returns EMPTY for zero content length", () => {
    const r = Parser.parse(noopIo, 0, "multipart/form-data; boundary=x", null, 1024, qp);
    expect(r.params).toBeNull();
    expect(r.tmpFiles).toEqual([]);
  });

  it("returns EMPTY when no boundary in content type", () => {
    expect(Parser.parse(noopIo, null, "multipart/form-data", null, 1024, qp).params).toBeNull();
  });

  it("raises an exception if boundary is too long", () => {
    expect(() =>
      Parser.parse(noopIo, null, `multipart/form-data; boundary=${"A".repeat(71)}`, null, 1024, qp),
    ).toThrow(BoundaryTooLongError);
  });

  it("dequote strips surrounding quotes", () => {
    expect(new Parser("b", null, 1024, qp)._dequote('"hello"')).toBe("hello");
  });

  it("dequote handles backslash escapes", () => {
    expect(new Parser("b", null, 1024, qp)._dequote('"hel\\"lo"')).toBe('hel"lo');
  });

  it("dequote returns unquoted string unchanged", () => {
    expect(new Parser("b", null, 1024, qp)._dequote("plain")).toBe("plain");
  });

  it("EOL is CRLF", () => expect(EOL).toBe("\r\n"));
  it("MULTIPART matches multipart content types", () => {
    expect(MULTIPART.test("multipart/form-data; boundary=x")).toBe(true);
    expect(MULTIPART.test("text/plain")).toBe(false);
  });
  it("BoundaryTooLongError name", () =>
    expect(new BoundaryTooLongError().name).toBe("BoundaryTooLongError"));
  it("EmptyContentError name", () =>
    expect(new EmptyContentError().name).toBe("EmptyContentError"));
  it("MultipartPartLimitError name", () =>
    expect(new MultipartPartLimitError().name).toBe("MultipartPartLimitError"));
  it("MultipartTotalPartLimitError name", () =>
    expect(new MultipartTotalPartLimitError().name).toBe("MultipartTotalPartLimitError"));
});
