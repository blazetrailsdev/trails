import { describe, it, expect } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import { Model, UnknownAttributeError } from "./index.js";

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

describe("ModelTest", () => {
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

  it("load hook is called", () => {
    let value = "not loaded";

    onLoad("active_model", () => {
      value = "loaded";
    });

    expect(value).toBe("loaded");
  });
});
