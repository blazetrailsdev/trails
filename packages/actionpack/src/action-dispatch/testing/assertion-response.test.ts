import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { AssertionResponse } from "./assertion-response.js";

describe("AssertionResponse", () => {
  it("constructs from a generic symbol", () => {
    const r = new AssertionResponse("success");
    expect(r.name).toBe("success");
    expect(r.code).toBe("2XX");
    expect(r.codeAndName()).toBe("2XX: success");
  });

  it("constructs from a Rack status symbol", () => {
    const r = new AssertionResponse("not_found");
    expect(r.name).toBe("not_found");
    expect(r.code).toBe(404);
  });

  it("constructs from an integer code (falls through to HTTP_STATUS_CODES)", () => {
    const r = new AssertionResponse(404);
    expect(r.name).toBe("Not Found");
    expect(r.code).toBe(404);
  });

  it("raises on a string code, as HTTP_STATUS_CODES is keyed by Integer", () => {
    expect(() => new AssertionResponse("422")).toThrow(/Invalid response code: 422/);
  });

  it("constructs from a generic code via GENERIC_RESPONSE_CODES.invert", () => {
    const r = new AssertionResponse("2XX");
    expect(r.name).toBe("success");
    expect(r.code).toBe("2XX");
  });

  it("raises ArgumentError on an invalid code", () => {
    expect(() => new AssertionResponse(999)).toThrow(ArgumentError);
  });

  it("throws on invalid name", () => {
    expect(() => new AssertionResponse("bogus_status")).toThrow(/Invalid response name/);
  });

  it("throws on invalid code", () => {
    expect(() => new AssertionResponse(999)).toThrow(/Invalid response code/);
  });
});
