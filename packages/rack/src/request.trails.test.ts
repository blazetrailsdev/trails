import { describe, it, expect } from "vitest";
import { Request } from "./request.js";
import { MockRequest } from "./mock-request.js";

describe("RackRequestTrailsTest", () => {
  it("compacts a forwarded authority that does not match AUTHORITY out of forwardedPort", () => {
    const req = new Request(
      MockRequest.envFor("/", { HTTP_FORWARDED: "for=1.2.3.4:1234, for=]bad[" }),
    );

    expect(req.forwardedPort).toEqual([1234]);
  });

  it("treats a non-matching authority as nil against a scheme with no default port", () => {
    const req = new Request(
      MockRequest.envFor("/", { HTTP_HOST: "]bad[", "rack.url_scheme": "ftp" }),
    );

    expect(req.hostWithPort()).toBeNull();
  });
});
