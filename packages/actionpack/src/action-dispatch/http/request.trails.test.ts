import { describe, it, expect } from "vitest";
import { Request } from "./request.js";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { StringIO } from "@blazetrails/ruby-compat";

describe("Request#GET / #POST", () => {
  it("GET raises BadRequest when the query string cannot be parsed", () => {
    const req = new Request({ QUERY_STRING: "a[]=1&a[b]=2" });
    expect(() => req.GET()).toThrow(BadRequest);
    expect(() => req.GET()).toThrow(
      "Invalid query parameters: expected Hash (got Array) for param `a'",
    );
  });

  it("POST raises BadRequest when the form body cannot be parsed", () => {
    const body = "a[]=1&a[b]=2";
    const req = new Request({
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
      CONTENT_LENGTH: String(body.length),
      "rack.input": new StringIO(body),
    });
    expect(() => req.POST()).toThrow(BadRequest);
    expect(() => req.POST()).toThrow("Invalid request parameters:");
  });
});
