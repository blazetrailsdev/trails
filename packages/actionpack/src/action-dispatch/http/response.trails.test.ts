import { describe, expect, it } from "vitest";
import { RackBody, Response } from "./response.js";
import { bytes } from "@blazetrails/ruby-compat";

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

describe("ActionDispatch::Response::Buffer#body", () => {
  it("appends a binary String chunk byte for byte", () => {
    const response = new Response();
    response.body = Buffer.from([0x89, 0x50, 0xff, 0xc3, 0x28]);
    expect(bytes(response.body)).toEqual([0x89, 0x50, 0xff, 0xc3, 0x28]);
  });
});

describe("ActionDispatch::Response::Buffer#to_ary", () => {
  it("answers the Array buffer itself", () => {
    const response = new Response(200, {}, ["a", "b"]);
    expect((response.toA()[2] as RackBody).toAry()).toEqual(["a", "b"]);
  });
});
