import { describe, it, expect, beforeEach, vi } from "vitest";
import { classAttribute } from "@blazetrails/activesupport";
import { ClassMethods, combineEtags as _combineEtags, type Etagger } from "./conditional-get.js";

class Host {
  declare static etaggers: Etagger[];
  declare etaggers: Etagger[];
  static etag = ClassMethods.etag;
  combineEtags = _combineEtags;
}

let klass: typeof Host;
let controller: Host;
const etag = (etagger: Etagger): void => klass.etag(etagger);
const combineEtags = (validator: unknown, options?: Record<string, unknown>): unknown[] =>
  controller.combineEtags(validator, options);

beforeEach(() => {
  klass = class extends Host {};
  classAttribute.call(klass, "etaggers", { default: [] });
  controller = new klass();
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
    const etagger = vi.fn(function () {
      return "etag-from-controller";
    });
    etag(etagger);
    expect(combineEtags("v")).toEqual(["v", "etag-from-controller"]);
    expect(etagger.mock.contexts[0]).toBe(controller);
  });

  it("etag writes are local to the class that writes", () => {
    etag(() => "parent");
    const child = class extends klass {};
    child.etag(() => "child");
    expect(new child().combineEtags("v")).toEqual(["v", "parent", "child"]);
    expect(combineEtags("v")).toEqual(["v", "parent"]);
  });
});
