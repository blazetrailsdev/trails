import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { QueryParser } from "../query-parser.js";

const qp = QueryParser.makeDefault(100);

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
