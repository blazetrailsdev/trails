import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "node:url";
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
import {
  getMultipartFileLimit,
  setMultipartFileLimit,
  getMultipartTotalPartLimit,
  setMultipartTotalPartLimit,
} from "../utils.js";

const qp = QueryParser.makeDefault(100);
const noopIo = { read: (_size: number) => null as string | null };
const fixDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test",
  "multipart",
);
function fix(
  name: string,
  boundary = "AaB03x",
  tf: ((f: string, ct: string) => any) | null = null,
) {
  const c = fs.readFileSync(path.join(fixDir, name), "binary");
  let done = false;
  return Parser.parse(
    {
      read: (_n: number) => {
        if (done) return null;
        done = true;
        return c;
      },
    },
    null,
    `multipart/form-data; boundary=${boundary}`,
    tf,
    Parser.BUFSIZE,
    qp,
  );
}

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
    expect(new Parser("b", null, 1024, qp).dequote('"hello"')).toBe("hello");
  });

  it("dequote handles backslash escapes", () => {
    expect(new Parser("b", null, 1024, qp).dequote('"hel\\"lo"')).toBe('hel"lo');
  });

  it("dequote returns unquoted string unchanged", () => {
    expect(new Parser("b", null, 1024, qp).dequote("plain")).toBe("plain");
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

  it("parses multipart content when content type is present but disposition is not", () => {
    expect(fix("content_type_and_no_disposition").params!["text/plain; charset=US-ASCII"]).toEqual([
      "contents",
    ]);
  });

  it("parses multipart content when content type present but filename is not", () => {
    expect(fix("content_type_and_no_filename").params!["text"]).toBe("contents");
  });

  it("sets BINARY encoding on things without content type", () => {
    expect(fix("none").params!["submit-name"]).toBe("Larry");
  });

  it("raises for invalid data preceding the boundary", () => {
    expect(() => fix("preceding_boundary")).toThrow(EmptyContentError);
  });

  it("reaches a multipart file limit", () => {
    const prev = getMultipartFileLimit();
    try {
      setMultipartFileLimit(1);
      expect(() =>
        fix("text", "AaB03x", (_f, _ct) => {
          let b = "";
          return {
            write: (s: string) => {
              b += s;
            },
            read: () => b,
          };
        }),
      ).toThrow(MultipartPartLimitError);
    } finally {
      setMultipartFileLimit(prev);
    }
  });

  it("reaches a multipart total limit", () => {
    const prev = getMultipartTotalPartLimit();
    try {
      setMultipartTotalPartLimit(1);
      expect(() => fix("none")).toThrow(MultipartTotalPartLimitError);
    } finally {
      setMultipartTotalPartLimit(prev);
    }
  });
});
