// Behavioral coverage for the exported assertRedirectedTo helper that
// isn't covered by the Rails-mirrored response_assertions_test port —
// Rails' redirect tests live in action_pack_assertions_test.rb and
// depend on controller infra not yet ported.
import { describe, expect, it } from "vitest";
import { assertRedirectedTo, type AssertionResponseHost } from "./response.js";

function host(status: number, headers: Record<string, string> = {}): AssertionResponseHost {
  return {
    response: {
      status,
      body: "",
      getHeader: (k) => headers[k.toLowerCase()],
    },
  };
}

describe("assertRedirectedTo", () => {
  it("passes when location matches exact string", () => {
    expect(() => assertRedirectedTo.call(host(302, { location: "/foo" }), "/foo")).not.toThrow();
  });

  it("passes when location matches regex (with flags)", () => {
    expect(() =>
      assertRedirectedTo.call(host(302, { location: "http://Example.org/x" }), /example\.org/i),
    ).not.toThrow();
  });

  it("fails when response is not a redirect", () => {
    expect(() => assertRedirectedTo.call(host(200, { location: "/foo" }), "/foo")).toThrow();
  });

  it("fails when location does not match string", () => {
    expect(() => assertRedirectedTo.call(host(302, { location: "/bar" }), "/foo")).toThrow(
      /redirect to <\/foo>/,
    );
  });

  it("includes regex flags in failure message", () => {
    expect(() => assertRedirectedTo.call(host(302, { location: "/bar" }), /posts/i)).toThrow(
      /<\/posts\/i>/,
    );
  });

  it("honors :status override (asserts the exact code)", () => {
    expect(() =>
      assertRedirectedTo.call(host(301, { location: "/foo" }), "/foo", {
        status: "moved_permanently",
      }),
    ).not.toThrow();

    // status override that doesn't match the actual response still fails
    expect(() =>
      assertRedirectedTo.call(host(302, { location: "/foo" }), "/foo", {
        status: "moved_permanently",
      }),
    ).toThrow();
  });

  it("fails when location header is missing", () => {
    expect(() => assertRedirectedTo.call(host(302), "/foo")).toThrow();
  });
});
