import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { QueryParser } from "../query-parser.js";

const qp = QueryParser.makeDefault(100);

/**
 * Ruby tags a part's body with the charset and leaves its bytes alone, so
 * Rack's specs assert `.encoding` (`spec_multipart.rb:93` "sets US_ASCII
 * encoding based on charset", `:105` "sets BINARY encoding for invalid
 * charsets"). A JS string carries no encoding tag, and both of those specs'
 * fixtures hold the ASCII body "contents", which every candidate encoding
 * decodes identically — so ported literally they would pass against a
 * `tag_multipart_encoding` that did nothing at all. What the charset
 * observably selects in TS is the decode, so that is what these assert.
 */
function parseBody(body: string) {
  let done = false;
  return Parser.parse(
    {
      read: (_n: number) => {
        if (done) return null;
        done = true;
        return body;
      },
    },
    null,
    "multipart/form-data; boundary=AaB03x",
    null,
    Parser.BUFSIZE,
    qp,
  );
}

describe("Rack::Multipart::Parser encodings", () => {
  it("decodes a text part's bytes under its charset", () => {
    const body =
      "--AaB03x\r\n" +
      'content-disposition: form-data; name="text"\r\n' +
      "content-type: text/plain; charset=UTF-8\r\n" +
      "\r\n" +
      "cafÃ©\r\n" +
      "--AaB03x--\r\n";

    expect(parseBody(body).params!["text"]).toBe("café");
  });

  it("leaves a text part's bytes alone under an unknown charset", () => {
    const body =
      "--AaB03x\r\n" +
      'content-disposition: form-data; name="text"\r\n' +
      "content-type: text/plain; charset=nope-8\r\n" +
      "\r\n" +
      "cafÃ©\r\n" +
      "--AaB03x--\r\n";

    expect(parseBody(body).params!["text"]).toBe("cafÃ©");
  });

  it("decodes a text part declaring a Ruby-only charset name", () => {
    // `TextDecoder` rejects "CP932" outright; `Encoding.find` resolves it to
    // Windows-31J, so the part decodes rather than falling back to binary.
    const body =
      "--AaB03x\r\n" +
      'content-disposition: form-data; name="text"\r\n' +
      "content-type: text/plain; charset=CP932\r\n" +
      "\r\n" +
      String.fromCharCode(0x82, 0xa0) +
      "\r\n" +
      "--AaB03x--\r\n";

    expect(parseBody(body).params!["text"]).toBe("\u3042");
  });
});
