import { describe, it, expect } from "vitest";
import { AbstractRequest } from "./request.js";

describe("Rack::Auth::AbstractRequest", () => {
  it("returns the scheme from the authorization header", () => {
    const req = new AbstractRequest({ HTTP_AUTHORIZATION: "Basic dXNlcjpwYXNz" });
    expect(req.scheme()).toBe("basic");
    expect(req.params()).toBe("dXNlcjpwYXNz");
  });

  it("returns provided? false when no authorization header", () => {
    expect(new AbstractRequest({}).provided()).toBe(false);
  });

  it("returns provided? true when authorization header is present", () => {
    expect(new AbstractRequest({ HTTP_AUTHORIZATION: "Basic dXNlcjpwYXNz" }).provided()).toBe(true);
  });

  it("recognizes alternate authorization header names", () => {
    expect(new AbstractRequest({ "X-HTTP_AUTHORIZATION": "Basic x" }).provided()).toBe(true);
    expect(new AbstractRequest({ X_HTTP_AUTHORIZATION: "Basic x" }).provided()).toBe(true);
  });
});
