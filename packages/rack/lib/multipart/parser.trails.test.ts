import { describe, it, expect } from "vitest";
import { BoundedIO, EmptyContentError, Parser } from "./parser.js";
import { MockRequest } from "../mock-request.js";
import { Request } from "../request.js";
import { QueryParser } from "../query-parser.js";
import { EOFError, File } from "@blazetrails/ruby-compat";

const qp = QueryParser.makeDefault(100);

function parseBody(body: string, tempfile: typeof Parser.TEMPFILE_FACTORY | null = null) {
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
    tempfile,
    Parser.BUFSIZE,
    qp,
  );
}

describe("Rack::Multipart::Parser encodings", () => {
  it("writes a non-ASCII binary upload to its tempfile byte-for-byte", () => {
    let bytes = "";
    for (let i = 0; i < 256; i++) bytes += String.fromCharCode(i);
    const body =
      "--AaB03x\r\n" +
      'content-disposition: form-data; name="file"; filename="bytes.bin"\r\n' +
      "content-type: application/octet-stream\r\n" +
      "\r\n" +
      bytes +
      "\r\n" +
      "--AaB03x--\r\n";

    const file = parseBody(body, Parser.TEMPFILE_FACTORY).params!["file"];
    file.tempfile.close();
    expect(File.binread(file.tempfile.path())).toEqual(
      Uint8Array.from(bytes, (c) => c.charCodeAt(0)),
    );
  });

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

  it("raises EOFError when the content length exceeds the actual body", () => {
    const bounded = new BoundedIO({ read: (_size: number) => null }, 10);

    let caught: unknown;
    try {
      bounded.read(10);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EOFError);
    expect(caught).not.toBeInstanceOf(EmptyContentError);
    expect((caught as Error).message).toBe("bad content body");
  });
});

describe("Parser#tag_multipart_encoding", () => {
  it("decodes a UTF-8 field name once, however many times it is forced", () => {
    const nameBytes = String.fromCharCode(...new TextEncoder().encode("Iñtërnâtiônàlizætiøn"));
    const input = `--AaB03x\r\nContent-Disposition: form-data; name="${nameBytes}"\r\n\r\nvalue\r\n--AaB03x--\r\n`;
    const env = MockRequest.envFor("/", {
      ":method": "POST",
      ":input": Buffer.from(input, "latin1"),
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    });
    expect(new Request(env).POST).toEqual({ Iñtërnâtiônàlizætiøn: "value" });
  });
});
