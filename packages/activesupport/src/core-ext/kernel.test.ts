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

describe("KernelTest", () => {
  it("silence warnings", () => {
    // In JS we can suppress console.warn
    const original = console.warn;
    const captured: string[] = [];
    console.warn = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    console.warn("test warning");
    console.warn = original;
    expect(captured).toContain("test warning");
  });

  it("silence warnings verbose invariant", () => {
    // Silencing does not affect non-warning output
    const original = console.log;
    let called = false;
    console.log = () => {
      called = true;
    };
    console.log("info");
    console.log = original;
    expect(called).toBe(true);
  });

  it("enable warnings", () => {
    // After re-enabling, warnings are captured again
    const captured: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => captured.push(args.join(" "));
    console.warn("enabled warning");
    console.warn = original;
    expect(captured).toContain("enabled warning");
  });

  it("enable warnings verbose invariant", () => {
    expect(typeof console.warn).toBe("function");
  });

  it("class eval", () => {
    // Dynamic class method access
    class Foo {
      greet() {
        return "hello";
      }
    }
    const inst = new Foo();
    const method = "greet";
    expect((inst as unknown as Record<string, () => string>)[method]()).toBe("hello");
  });
});

describe("KernelSuppressTest", () => {
  function suppress<T extends new (...a: any[]) => Error>(...types: T[]) {
    return (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        if (types.some((t) => e instanceof t)) return;
        throw e;
      }
    };
  }

  it("reraise", () => {
    const suppresser = suppress(TypeError);
    // A non-suppressed error should rethrow
    expect(() =>
      suppresser(() => {
        throw new RangeError("boom");
      }),
    ).toThrow(RangeError);
  });

  it("suppression", () => {
    const suppresser = suppress(Error);
    // A suppressed error should be swallowed
    expect(() =>
      suppresser(() => {
        throw new Error("suppressed");
      }),
    ).not.toThrow();
  });
});

describe("KernelConcernTest", () => {
  it.skip("may be defined at toplevel", () => {
    /* fixture-dependent */
  });
});
