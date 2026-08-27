import { describe, it, expect } from "vitest";
import { Model, UnknownAttributeError } from "./index.js";

/**
 * Port of `vendor/rails/activemodel/test/cases/api_test.rb`. Rails' host is
 * `include ActiveModel::API`; `Model` is `include API` + `include Access`
 * (model.rb:42-45), so the test classes extend `Model` for the constructor
 * `API#initialize` (api.rb:78-81) ports to.
 *
 * `module DefaultValue` (api_test.rb:7-17) is a mixin whose `initialize`
 * seeds `@attr` and whose `included` hook adds `attr_accessor :hello`. Ruby
 * inserts it into the ancestor chain, so `BasicModel` and
 * `BasicModelWithReversedMixins` differ only in whether the seeding runs
 * before or after `ActiveModel::API#initialize` assigns the passed attributes
 * — an ordering that is unobservable either way, since `||=` never overwrites
 * an assigned value. JS has one linear constructor chain and `super()` must
 * run first, so both classes seed after `super`, which is BasicModel's own
 * ancestry (`API#initialize` assigns, then `super` reaches DefaultValue).
 */
class DefaultValueModel extends Model {
  declare _hello?: string;

  declare _attr?: string;

  get hello(): string | undefined {
    return this._hello;
  }

  set hello(value: string | undefined) {
    this._hello = value;
  }

  get attr(): string | undefined {
    return this._attr;
  }

  set attr(value: string | undefined) {
    this._attr = value;
  }

  constructor(attrs?: Record<string, unknown> | null) {
    super(attrs ?? {});
    this._attr ??= "default value";
  }
}

class BasicModel extends DefaultValueModel {}

class BasicModelWithReversedMixins extends DefaultValueModel {}

class SimpleModel extends Model {
  declare _attr?: string;

  get attr(): string | undefined {
    return this._attr;
  }

  set attr(value: string | undefined) {
    this._attr = value;
  }
}

describe("APITest", () => {
  it("initialize with params", () => {
    const object = new BasicModel({ attr: "value" });
    expect(object.attr).toBe("value");
  });

  it("initialize with params and mixins reversed", () => {
    const object = new BasicModelWithReversedMixins({ attr: "value" });
    expect(object.attr).toBe("value");
  });

  it("initialize with nil or empty hash params does not explode", () => {
    expect(() => {
      new BasicModel();
      new BasicModel(null);
      new BasicModel({});
      new SimpleModel({ attr: "value" });
    }).not.toThrow();
  });

  it("persisted is always false", () => {
    const object = new BasicModel({ attr: "value" });
    expect(object.isPersisted()).toBeFalsy();
  });

  it("mixin inclusion chain", () => {
    const object = new BasicModel();
    expect(object.attr).toBe("default value");
  });

  it("mixin initializer when args exist", () => {
    const object = new BasicModel({ hello: "world" });
    expect(object.hello).toBe("world");
  });

  it("mixin initializer when args dont exist", () => {
    expect(() => new SimpleModel({ hello: "world" })).toThrow(UnknownAttributeError);
  });
});
