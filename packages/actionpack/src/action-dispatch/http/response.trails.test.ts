import { describe, expect, it } from "vitest";
import { Response } from "./response.js";

describe("ActionDispatch::Response#location", () => {
  it("is nil when no Location header is set, as Rack's get_header answers", () => {
    const response = new Response();
    expect(response.location).toBeUndefined();
    response.location = "http://example.com/";
    expect(response.location).toBe("http://example.com/");
  });
});

describe("ActionDispatch::Response#body=", () => {
  it("keeps a binary String as one body part", () => {
    const bytes = Buffer.from([0x89, 0x00, 0xff, 0xc3, 0x28]);
    const response = new Response();
    response.body = bytes;
    expect(response.bodyParts()).toEqual([bytes]);
    expect(response.getHeader("content-length")).toBe("5");
  });
});
