import { beforeEach, describe, expect, it } from "vitest";
import { Deprecation } from "../deprecation.js";
import {
  DeprecatedConstantProxy,
  DeprecatedInstanceVariableProxy,
  DeprecatedObjectProxy,
} from "./proxy-wrappers.js";
import { extend, include, prepend } from "../include.js";
import { registerConstant } from "../inflector.js";
import { assertDeprecated } from "../testing/deprecation.js";

describe("ProxyWrappersTest", () => {
  const Waffles = false;
  const NewWaffles = "hamburgers";

  const WaffleModule = {
    isWaffle(): boolean {
      return true;
    },
  };
  registerConstant("WaffleModule", WaffleModule);

  let deprecator: Deprecation;

  beforeEach(() => {
    deprecator = new Deprecation();
  });

  it("deprecated object proxy doesnt wrap falsy objects", () => {
    const proxy = DeprecatedObjectProxy.new(null, "message");
    expect(proxy).toBeFalsy();
  });

  it("deprecated instance variable proxy doesnt wrap falsy objects", () => {
    const proxy = DeprecatedInstanceVariableProxy.new(null, "waffles");
    expect(proxy).toBeFalsy();
  });

  it("deprecated constant proxy doesnt wrap falsy objects", () => {
    const proxy = DeprecatedConstantProxy.new(Waffles, NewWaffles);
    expect(proxy).toBeFalsy();
  });

  it("including proxy module", async () => {
    const proxy = DeprecatedConstantProxy.new("OldWaffleModule", "WaffleModule", deprecator);
    const klass = class {};
    await assertDeprecated("OldWaffleModule", deprecator, () => {
      include(klass, proxy as never);
    });
    expect((new klass() as unknown as typeof WaffleModule).isWaffle()).toBe(true);
  });

  it("prepending proxy module", async () => {
    const proxy = DeprecatedConstantProxy.new("OldWaffleModule", "WaffleModule", deprecator);
    const klass = class {
      isWaffle(): boolean {
        return false;
      }
    };
    await assertDeprecated("OldWaffleModule", deprecator, () => {
      prepend(klass, proxy as never);
    });
    expect(new klass().isWaffle()).toBe(true);
  });

  it("extending proxy module", async () => {
    const proxy = DeprecatedConstantProxy.new("OldWaffleModule", "WaffleModule", deprecator);
    const obj = {};
    await assertDeprecated("OldWaffleModule", deprecator, () => {
      extend(obj, proxy as never);
    });
    expect((obj as typeof WaffleModule).isWaffle()).toBe(true);
  });
});
