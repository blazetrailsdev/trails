import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "../logger.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "../string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "../callbacks.js";
import { concern, includeConcern, hasConcern } from "../concern.js";
import { transliterate } from "../transliterate.js";
import { CurrentAttributes } from "../current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "../inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "../module-ext.js";
import { Notifications } from "../notifications.js";
import { MemoryStore, NullStore, FileStore } from "../cache/stores.js";
import { MessageVerifier } from "../message-verifier.js";
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
} from "../hash-utils.js";
import { OrderedHash } from "../ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "../safe-buffer.js";
import { ErrorReporter } from "../error-reporter.js";
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
} from "../testing-helpers.js";
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
} from "../range-ext.js";
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
} from "../enumerable-utils.js";
import { toSentence } from "../array-utils.js";
import { ParameterFilter } from "../parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "../key-generator.js";

describe("IntrospectionTest", () => {
  // Helper to create a function with a specific name property
  function namedFn(name: string): Function {
    const f = function () {};
    Object.defineProperty(f, "name", { value: name, configurable: true });
    return f;
  }

  it("module parent name", () => {
    expect(moduleParentName(class FooBar {})).toBeNull(); // no ::
    expect(moduleParentName(namedFn("Foo::Bar"))).toBe("Foo");
  });

  it("module parent name when frozen", () => {
    expect(moduleParentName(namedFn("Foo::Bar::Baz"))).toBe("Foo::Bar");
  });

  it("module parent name notice changes", () => {
    expect(moduleParentName(namedFn("A::B::C"))).toBe("A::B");
    expect(moduleParentName(namedFn("A::B"))).toBe("A");
    expect(moduleParentName(namedFn("A"))).toBeNull();
  });

  it("module parent", () => {
    class Animal {}
    class Dog extends Animal {}
    expect(Object.getPrototypeOf(Dog)).toBe(Animal);
  });

  it("module parents", () => {
    class A {}
    class B extends A {}
    class C extends B {}
    const chain: unknown[] = [];
    let proto = Object.getPrototypeOf(C);
    while (proto && proto !== Function.prototype) {
      chain.push(proto);
      proto = Object.getPrototypeOf(proto);
    }
    expect(chain).toContain(B);
    expect(chain).toContain(A);
  });

  it("module parent notice changes", () => {
    expect(moduleParentName(namedFn("Outer::Inner"))).toBe("Outer");
  });
});
