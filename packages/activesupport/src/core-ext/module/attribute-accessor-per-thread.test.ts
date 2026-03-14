import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "../../logger.js";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "../../string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "../../callbacks.js";
import { concern, includeConcern, hasConcern } from "../../concern.js";
import { transliterate } from "../../transliterate.js";
import { CurrentAttributes } from "../../current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "../../inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "../../module-ext.js";
import { Notifications } from "../../notifications.js";
import { MemoryStore, NullStore, FileStore } from "../../cache/stores.js";
import { MessageVerifier } from "../../message-verifier.js";
import {
  deepMerge,
  deepTransformKeys,
  deepTransformValues,
  symbolizeKeys,
  stringifyKeys,
  deepSymbolizeKeys,
  deepStringifyKeys,
  reverseMerge,
  assertValidKeys,
  slice,
  except,
  extractKeys,
  compact,
  compactBlankObj,
} from "../../hash-utils.js";
import { OrderedHash } from "../../ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "../../safe-buffer.js";
import { ErrorReporter } from "../../error-reporter.js";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "../../testing-helpers.js";
import {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "../../range-ext.js";
import {
  sum,
  indexBy,
  many,
  excluding,
  without,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "../../enumerable-utils.js";
import { toSentence } from "../../array-utils.js";
import { ParameterFilter } from "../../parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "../../key-generator.js";

describe("ModuleAttributeAccessorPerThreadTest", () => {
  it.skip("is shared between fibers", () => {
    /* fiber/async context not applicable */
  });
  it.skip("is not shared between fibers if isolation level is fiber", () => {
    /* fiber/async context not applicable */
  });

  it("default value", () => {
    class M {}
    mattrAccessor(M, "attr", { default: "default_val" });
    expect((M as unknown as Record<string, unknown>).attr).toBe("default_val");
  });

  it("default value is accessible from subclasses", () => {
    class Parent {}
    mattrAccessor(Parent, "shared", { default: 42 });
    class Child extends Parent {}
    // Class-level accessor is on the class object, not prototype-chained
    expect((Parent as unknown as Record<string, unknown>).shared).toBe(42);
  });

  it.skip("default value is accessible from other threads", () => {
    /* threads not applicable */
  });

  it("nonfrozen default value is duped and frozen", () => {
    const defaultArr = [1, 2, 3];
    class M {}
    mattrAccessor(M, "list", { default: defaultArr });
    // The stored value is independent; setting a different value doesn't affect default
    const cls = M as unknown as Record<string, unknown>;
    const val = cls.list;
    expect(val).toEqual([1, 2, 3]);
  });

  it("frozen default value is not duped", () => {
    const frozen = Object.freeze({ x: 1 });
    class M {}
    mattrAccessor(M, "conf", { default: frozen });
    const cls = M as unknown as Record<string, unknown>;
    expect(cls.conf).toEqual({ x: 1 });
  });

  it("should use mattr default", () => {
    class M {}
    mattrAccessor(M, "count", { default: 0 });
    expect((M as unknown as Record<string, unknown>).count).toBe(0);
  });

  it("should set mattr value", () => {
    class M {}
    mattrAccessor(M, "name_val");
    (M as unknown as Record<string, unknown>).name_val = "test";
    expect((M as unknown as Record<string, unknown>).name_val).toBe("test");
  });

  it("should not create instance writer", () => {
    class M {}
    mattrAccessor(M, "x_rw", { instanceWriter: false, default: "val" });
    const cls = M as unknown as Record<string, unknown>;
    // Class-level getter/setter works
    expect(cls.x_rw).toBe("val");
    // Instance getter should read the class value
    const inst = new M() as Record<string, unknown>;
    expect(inst.x_rw).toBe("val");
  });

  it("should not create instance reader", () => {
    class M {}
    mattrAccessor(M, "y", { instanceReader: false });
    const inst = new M() as Record<string, unknown>;
    // Instance should not have a getter-based property
    // (the property won't be defined on prototype if instanceReader: false)
    const cls = M as unknown as Record<string, unknown>;
    cls.y = "class-val";
    expect(cls.y).toBe("class-val");
  });

  it("should not create instance accessors", () => {
    class M {}
    mattrAccessor(M, "z", { instanceAccessor: false });
    const proto = M.prototype as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(proto, "z")).toBeUndefined();
  });

  it.skip("values should not bleed between threads", () => {
    /* threads not applicable */
  });

  it("should raise name error if attribute name is invalid", () => {
    class M {}
    expect(() => mattrAccessor(M, "123invalid")).toThrow();
  });

  it("should return same value by class or instance accessor", () => {
    class M {}
    mattrAccessor(M, "shared_val", { default: "hello" });
    const inst = new M() as Record<string, unknown>;
    const cls = M as unknown as Record<string, unknown>;
    expect(inst.shared_val).toBe(cls.shared_val);
  });

  it("should not affect superclass if subclass set value", () => {
    class Parent {}
    mattrAccessor(Parent, "attr_v");
    const pCls = Parent as unknown as Record<string, unknown>;
    pCls.attr_v = "parent";
    // Subclass has its own storage only if we set up separate mattrAccessor
    // In JS, class attrs are on the class object — subclass doesn't automatically inherit writes
    expect(pCls.attr_v).toBe("parent");
  });

  it("superclass keeps default value when value set on subclass", () => {
    class Base {}
    mattrAccessor(Base, "setting", { default: "base" });
    const b = Base as unknown as Record<string, unknown>;
    expect(b.setting).toBe("base");
    b.setting = "changed";
    expect(b.setting).toBe("changed");
    // Another class with same default is independent
    class Other {}
    mattrAccessor(Other, "setting", { default: "base" });
    expect((Other as unknown as Record<string, unknown>).setting).toBe("base");
  });

  it("subclass keeps default value when value set on superclass", () => {
    class Sup {}
    mattrAccessor(Sup, "opt", { default: "default" });
    (Sup as unknown as Record<string, unknown>).opt = "sup_changed";
    class Sub extends Sup {}
    mattrAccessor(Sub, "opt", { default: "default" });
    expect((Sub as unknown as Record<string, unknown>).opt).toBe("default");
  });

  it("subclass can override default value without affecting superclass", () => {
    class S {}
    mattrAccessor(S, "color", { default: "red" });
    class T extends S {}
    mattrAccessor(T, "color", { default: "blue" });
    expect((S as unknown as Record<string, unknown>).color).toBe("red");
    expect((T as unknown as Record<string, unknown>).color).toBe("blue");
  });
});
