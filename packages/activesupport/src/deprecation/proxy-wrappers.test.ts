import { beforeEach, describe, expect, it } from "vitest";
import { Deprecation } from "../deprecation.js";
import {
  DeprecatedConstantProxy,
  DeprecatedInstanceVariableProxy,
  DeprecatedObjectProxy,
} from "./proxy-wrappers.js";
import { extend, include, prepend } from "@blazetrails/ruby-compat/include";
import { registerConstant } from "../inflector.js";
import { assertPredicate } from "../testing/assertions.js";
import { assertDeprecated, assertNotDeprecated } from "../testing/deprecation.js";

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
    assertPredicate(new klass() as unknown as typeof WaffleModule, (o) => o.isWaffle());
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
    assertPredicate(new klass(), (o) => o.isWaffle());
  });

  it("proxy delegates respond_to? and hash to target without warning", async () => {
    const proxy = DeprecatedConstantProxy.new("OldWaffleModule", "WaffleModule", deprecator) as {
      respondTo(method: string): boolean;
      hash(): unknown;
    };
    await assertNotDeprecated(deprecator, () => {
      expect(proxy.respondTo("isWaffle")).toBe(true);
      expect(proxy.respondTo("isPancake")).toBe(false);
      proxy.hash();
    });
  });

  it("extending proxy module", async () => {
    const proxy = DeprecatedConstantProxy.new("OldWaffleModule", "WaffleModule", deprecator);
    const obj = {};
    await assertDeprecated("OldWaffleModule", deprecator, () => {
      extend(obj, proxy as never);
    });
    assertPredicate(obj as typeof WaffleModule, (o) => o.isWaffle());
  });
});
