import { describe, expect, it } from "vitest";
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
    expect(r.code).toBe("404");
  });

  it("constructs from an integer code (falls through to HTTP_STATUS_CODES)", () => {
    // Faithful Rails behavior: integer code never hits GENERIC_RESPONSE_CODES.invert
    // (its keys are strings), so we get the canonical Rack name.
    const r = new AssertionResponse(404);
    expect(r.name).toBe("Not Found");
    expect(r.code).toBe("404");
  });

  it("constructs from a string code", () => {
    const r = new AssertionResponse("422");
    expect(r.code).toBe("422");
    expect(r.name).toMatch(/unprocessable/i);
  });

  it("throws on invalid name", () => {
    expect(() => new AssertionResponse("bogus_status")).toThrow(/Invalid response name/);
  });

  it("throws on invalid code", () => {
    expect(() => new AssertionResponse(999)).toThrow(/Invalid response code/);
  });
});
