import { describe, it, expect } from "vitest";
import {
  UnsafeRedirectError,
  _allowOtherHost,
  _computeRedirectToLocation,
  _ensureUrlIsHttpHeaderSafe,
  _enforceOpenRedirectProtection,
  _extractRedirectToStatus,
  _urlHostAllowed,
} from "./redirecting.js";

const host = (overrides: Record<string, unknown> = {}) =>
  ({
    request: { host: "example.com", protocol: "http://", hostWithPort: "example.com" },
    redirectTo: () => {},
    ...overrides,
  }) as never;

describe("_computeRedirectToLocation", () => {
  const req = { protocol: "http://", hostWithPort: "example.com" };

  it("passes scheme-qualified strings through", () => {
    expect(_computeRedirectToLocation.call(undefined, req, "https://foo.test/x")).toBe(
      "https://foo.test/x",
    );
  });

  it("passes protocol-relative strings through", () => {
    expect(_computeRedirectToLocation.call(undefined, req, "//foo.test/x")).toBe("//foo.test/x");
  });

  it("prepends protocol+host for plain paths", () => {
    expect(_computeRedirectToLocation.call(undefined, req, "/posts")).toBe(
      "http://example.com/posts",
    );
  });

  it("strips null, CR, LF from the result", () => {
    expect(_computeRedirectToLocation.call(undefined, req, "https://x.test/a\r\nb\0c")).toBe(
      "https://x.test/abc",
    );
  });

  it("recurses through a Proc-like function", () => {
    const fn = () => "/inner";
    expect(_computeRedirectToLocation.call(host(), req, fn)).toBe("http://example.com/inner");
  });

  it("delegates non-string options to urlFor", () => {
    const ctx = host({ urlFor: (o: { id: number }) => `/posts/${o.id}` });
    expect(_computeRedirectToLocation.call(ctx, req, { id: 5 })).toBe("/posts/5");
  });
});

describe("_allowOtherHost", () => {
  it("returns true when raiseOnOpenRedirects is falsy", () => {
    expect(_allowOtherHost.call({ raiseOnOpenRedirects: false } as never)).toBe(true);
    expect(_allowOtherHost.call({} as never)).toBe(true);
  });

  it("returns false when raiseOnOpenRedirects is true", () => {
    expect(_allowOtherHost.call({ raiseOnOpenRedirects: true } as never)).toBe(false);
  });
});

describe("_extractRedirectToStatus", () => {
  it("drains :status from a hash and resolves symbols", () => {
    const opts: Record<string, unknown> = { status: "see_other", id: 1 };
    expect(_extractRedirectToStatus.call(undefined, opts, {})).toBe(303);
    expect(opts).toEqual({ id: 1 });
  });

  it("falls back to responseOptions[:status]", () => {
    expect(_extractRedirectToStatus.call(undefined, "https://x.test", { status: 301 })).toBe(301);
  });

  it("defaults to 302", () => {
    expect(_extractRedirectToStatus.call(undefined, "https://x.test", {})).toBe(302);
  });
});

describe("_urlHostAllowed", () => {
  it("allows same-host absolute URLs", () => {
    expect(_urlHostAllowed.call(host(), "https://example.com/x")).toBe(true);
  });

  it("rejects other-host absolute URLs", () => {
    expect(_urlHostAllowed.call(host(), "https://evil.test/x")).toBe(false);
  });

  it("rejects protocol-relative URLs to other hosts", () => {
    expect(_urlHostAllowed.call(host(), "//evil.test/x")).toBe(false);
  });

  // Open-redirect guard: Rails' `URI("//foo").host` is nil, so the bare
  // `//`-prefix is unconditionally rejected even when the post-`//`
  // authority happens to match `request.host`.
  it("rejects protocol-relative URLs even when the authority matches request.host", () => {
    expect(_urlHostAllowed.call(host(), "//example.com/x")).toBe(false);
  });

  it("rejects malformed scheme-prefixed URLs", () => {
    expect(_urlHostAllowed.call(host(), "http://[::1")).toBe(false);
  });

  it("allows single-leading-slash paths", () => {
    expect(_urlHostAllowed.call(host(), "/profile")).toBe(true);
  });

  it("rejects non-rooted paths", () => {
    expect(_urlHostAllowed.call(host(), "profile")).toBe(false);
  });
});

describe("_enforceOpenRedirectProtection", () => {
  it("returns the location when allowOtherHost is true", () => {
    expect(
      _enforceOpenRedirectProtection.call(host(), "https://evil.test/x", { allowOtherHost: true }),
    ).toBe("https://evil.test/x");
  });

  it("returns the location when same-host", () => {
    expect(_enforceOpenRedirectProtection.call(host(), "/safe", { allowOtherHost: false })).toBe(
      "/safe",
    );
  });

  it("raises UnsafeRedirectError for cross-host without allowOtherHost", () => {
    expect(() =>
      _enforceOpenRedirectProtection.call(host(), "https://evil.test/x", {
        allowOtherHost: false,
      }),
    ).toThrow(UnsafeRedirectError);
  });
});

describe("_ensureUrlIsHttpHeaderSafe", () => {
  it("accepts safe ASCII URLs", () => {
    expect(() => _ensureUrlIsHttpHeaderSafe.call(undefined, "https://x.test/a")).not.toThrow();
  });

  it("rejects URLs with embedded CR/LF/NUL", () => {
    expect(() => _ensureUrlIsHttpHeaderSafe.call(undefined, "https://x.test/a\nfoo")).toThrow(
      UnsafeRedirectError,
    );
    expect(() => _ensureUrlIsHttpHeaderSafe.call(undefined, "https://x.test/a\0foo")).toThrow(
      UnsafeRedirectError,
    );
  });
});
