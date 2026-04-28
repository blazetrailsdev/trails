import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearEtaggers, combineEtags, etag } from "./conditional-get.js";

beforeEach(() => {
  clearEtaggers();
});

describe("combineEtags", () => {
  it("returns [validator] when no etaggers are registered", () => {
    expect(combineEtags("abc")).toEqual(["abc"]);
  });

  it("filters out undefined validator", () => {
    expect(combineEtags(undefined)).toEqual([]);
  });

  it("appends etagger results to validator", () => {
    etag(() => "etag1");
    expect(combineEtags("validator", { public: true })).toEqual(["validator", "etag1"]);
  });

  it("passes options to each etagger", () => {
    etag((opts) => `val-${String(opts.public)}`);
    expect(combineEtags("v", { public: true })).toEqual(["v", "val-true"]);
  });

  it("filters out undefined returns from etaggers", () => {
    etag(() => "etag1");
    etag(() => undefined);
    etag(() => "etag2");
    expect(combineEtags("v")).toEqual(["v", "etag1", "etag2"]);
  });

  it("combines multiple etaggers", () => {
    etag(() => "etag1");
    etag(() => "etag2");
    expect(combineEtags("validator")).toEqual(["validator", "etag1", "etag2"]);
  });

  it("returns only etagger results when validator is undefined", () => {
    etag(() => "etag1");
    expect(combineEtags(undefined)).toEqual(["etag1"]);
  });

  it("preserves empty-string etags (Ruby compact only drops nil)", () => {
    etag(() => "");
    etag(() => undefined);
    etag(() => "real");
    expect(combineEtags("v")).toEqual(["v", "", "real"]);
  });

  it("binds the controller as `this` when invoking each etagger (mirrors Rails instance_exec)", () => {
    const controller = { name: "PostsController" };
    const etagger = vi.fn(function () {
      return "etag-from-controller";
    });
    etag(etagger);
    expect(combineEtags.call(controller, "v")).toEqual(["v", "etag-from-controller"]);
    expect(etagger.mock.contexts[0]).toBe(controller);
  });
});
