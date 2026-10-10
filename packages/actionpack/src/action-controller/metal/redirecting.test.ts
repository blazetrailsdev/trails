import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { Redirecting, UnsafeRedirectError } from "./redirecting.js";

const req = { host: "example.com", protocol: "http://", hostWithPort: () => "example.com" };

class RedirectingController extends Base {}

const host = (overrides: Record<string, unknown> = {}): any =>
  Object.assign(new RedirectingController(), { request: req }, overrides);

describe("_computeRedirectToLocation", () => {
  it("passes scheme-qualified strings through", () => {
    expect(Redirecting._computeRedirectToLocation(req, "https://foo.test/x")).toBe(
      "https://foo.test/x",
    );
  });

  it("passes protocol-relative strings through", () => {
    expect(Redirecting._computeRedirectToLocation(req, "//foo.test/x")).toBe("//foo.test/x");
  });

  it("prepends protocol+host for plain paths", () => {
    expect(Redirecting._computeRedirectToLocation(req, "/posts")).toBe("http://example.com/posts");
  });

  it("strips null, CR, LF from the result", () => {
    expect(Redirecting._computeRedirectToLocation(req, "https://x.test/a\r\nb\0c")).toBe(
      "https://x.test/abc",
    );
  });

  it("recurses through a Proc-like function", () => {
    const fn = () => "/inner";
    expect(host()._computeRedirectToLocation(req, fn)).toBe("http://example.com/inner");
  });

  it("delegates non-string options to urlFor", () => {
    const ctx = host({ urlFor: (o: { id: number }) => `/posts/${o.id}` });
    expect(ctx._computeRedirectToLocation(req, { id: 5 })).toBe("/posts/5");
  });
});

describe("_allowOtherHost", () => {
  it("returns true when raiseOnOpenRedirects is falsy", () => {
    expect(host({ raiseOnOpenRedirects: false })._allowOtherHost()).toBe(true);
  });

  it("returns false when raiseOnOpenRedirects is true", () => {
    expect(host({ raiseOnOpenRedirects: true })._allowOtherHost()).toBe(false);
  });
});

describe("_extractRedirectToStatus", () => {
  it("drains :status from a hash and resolves symbols", () => {
    const opts: Record<string, unknown> = { status: "see_other", id: 1 };
    expect(host()._extractRedirectToStatus(opts, {})).toBe(303);
    expect(opts).toEqual({ id: 1 });
  });

  it("falls back to responseOptions[:status]", () => {
    expect(host()._extractRedirectToStatus("https://x.test", { status: 301 })).toBe(301);
  });

  it("defaults to 302", () => {
    expect(host()._extractRedirectToStatus("https://x.test", {})).toBe(302);
  });
});

describe("_urlHostAllowed", () => {
  it("allows same-host absolute URLs", () => {
    expect(host()._urlHostAllowed("https://example.com/x")).toBe(true);
  });

  it("rejects other-host absolute URLs", () => {
    expect(host()._urlHostAllowed("https://evil.test/x")).toBe(false);
  });

  it("rejects protocol-relative URLs to other hosts", () => {
    expect(host()._urlHostAllowed("//evil.test/x")).toBe(false);
  });

  it("allows a protocol-relative URL whose authority is request.host", () => {
    expect(host()._urlHostAllowed("//example.com/x")).toBe(true);
  });

  it("rejects an empty-host URL", () => {
    expect(host()._urlHostAllowed("http:///example.com/x")).toBe(false);
  });

  it("rejects malformed scheme-prefixed URLs", () => {
    expect(host()._urlHostAllowed("http://[::1")).toBe(false);
  });

  it("allows single-leading-slash paths", () => {
    expect(host()._urlHostAllowed("/profile")).toBe(true);
  });

  it("rejects non-rooted paths", () => {
    expect(host()._urlHostAllowed("profile")).toBe(false);
  });
});

describe("_enforceOpenRedirectProtection", () => {
  it("returns the location when allowOtherHost is true", () => {
    expect(
      host()._enforceOpenRedirectProtection("https://evil.test/x", { allowOtherHost: true }),
    ).toBe("https://evil.test/x");
  });

  it("returns the location when same-host", () => {
    expect(host()._enforceOpenRedirectProtection("/safe", { allowOtherHost: false })).toBe("/safe");
  });

  it("raises UnsafeRedirectError for cross-host without allowOtherHost", () => {
    expect(() =>
      host()._enforceOpenRedirectProtection("https://evil.test/x", {
        allowOtherHost: false,
      }),
    ).toThrow(UnsafeRedirectError);
  });
});

describe("_ensureUrlIsHttpHeaderSafe", () => {
  it("accepts safe ASCII URLs", () => {
    expect(() => host()._ensureUrlIsHttpHeaderSafe("https://x.test/a")).not.toThrow();
  });

  it("rejects URLs with embedded CR/LF/NUL", () => {
    expect(() => host()._ensureUrlIsHttpHeaderSafe("https://x.test/a\nfoo")).toThrow(
      UnsafeRedirectError,
    );
    expect(() => host()._ensureUrlIsHttpHeaderSafe("https://x.test/a\0foo")).toThrow(
      UnsafeRedirectError,
    );
  });
});
