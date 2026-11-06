import { describe, expect, it } from "vitest";
import { Body } from "./body.js";
import "./index.js";
import { AttachmentsList } from "./attachments-list.js";
import { Part } from "./part.js";

describe("mail body and part edges", () => {
  it("answers nil from delivery readers on an ordinary part", () => {
    const part = new Part();
    expect(part.action()).toBeNull();
    expect(part.isBounced()).toBe(false);
  });

  it("raises IndexError for an out of range attachment", () => {
    expect(() => new AttachmentsList([]).get(3)).toThrow(/index 3/);
  });

  it("restores ivars through initWith", () => {
    const body = new Body("x");
    body.initWith({ map: { raw_source: "y", boundary: "b" }, get: () => [] });
    expect(body.rawSource).toBe("y");
    expect(body.boundary).toBe("b");
  });

  it("parses a binary raw source as Part#parse_message splits the binary String", () => {
    const part = new Part(new TextEncoder().encode("Content-Type: text/plain\r\n\r\nhéllo"));
    expect(part.mimeType()).toBe("text/plain");
    expect(part.body().decoded()).toBe("héllo");
  });
});
