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

  it("keeps a forwarded authority that does not match AUTHORITY as nil in forwardedFor", () => {
    const req = new Request(MockRequest.envFor("/", { HTTP_FORWARDED: "for=1.2.3.4, for=]bad[" }));

    expect(req.forwardedFor).toEqual(["1.2.3.4", undefined]);
    expect(req.ip).toBe("1.2.3.4");
  });

  it("answers nil for ip when every forwarded authority misses AUTHORITY", () => {
    const req = new Request(
      MockRequest.envFor("/", { HTTP_FORWARDED: "for=]bad[", REMOTE_ADDR: "127.0.0.1" }),
    );

    expect(req.forwardedFor).toEqual([undefined]);
    expect(req.ip).toBeNull();
  });

  it("keeps a nil element from x-forwarded-for and returns the trailing client address", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        HTTP_X_FORWARDED_FOR: "]bad[, 1.2.3.4",
        REMOTE_ADDR: "127.0.0.1",
      }),
    );

    expect(req.forwardedFor).toEqual([undefined, "1.2.3.4"]);
    expect(req.ip).toBe("1.2.3.4");
  });

  const graphCases: Array<[string, number, boolean]> = [
    ["a C1 control", 0x80, false],
    ["a soft hyphen", 0x00ad, true],
    ["a zero-width space", 0x200b, true],
    ["a byte order mark", 0xfeff, true],
    ["an unassigned code point", 0x0378, false],
    ["a private use code point", 0xe000, true],
    ["a no-break space", 0x00a0, false],
    ["an ideographic space", 0x3000, false],
    ["a line separator", 0x2028, false],
    ["a delete", 0x7f, false],
  ];

  for (const [name, codePoint, graph] of graphCases) {
    it(`matches MRI's [[:graph:]] for a hostname containing ${name}`, () => {
      const authority = `exa${String.fromCodePoint(codePoint)}mple.com`;
      const req = new Request(MockRequest.envFor("/", { HTTP_HOST: authority }));

      expect(req.host).toBe(graph ? authority : null);
      expect(req.hostname).toBe(graph ? authority : null);
    });
  }
});
