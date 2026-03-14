import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "./logger.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "./string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "./callbacks.js";
import { concern, includeConcern, hasConcern } from "./concern.js";
import { transliterate } from "./transliterate.js";
import { CurrentAttributes } from "./current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "./inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "./module-ext.js";
import { Notifications } from "./notifications.js";
import { MemoryStore, NullStore, FileStore } from "./cache/stores.js";
import { MessageVerifier } from "./message-verifier.js";
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
} from "./hash-utils.js";
import { OrderedHash } from "./ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "./safe-buffer.js";
import { ErrorReporter } from "./error-reporter.js";
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
} from "./testing-helpers.js";
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
} from "./range-ext.js";
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
} from "./enumerable-utils.js";
import { toSentence } from "./array-utils.js";
import { ParameterFilter } from "./parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "./key-generator.js";

describe("OptionMergerTest", () => {
  // withOptions creates a helper that deep-merges default options into calls
  function withOptions<T extends Record<string, unknown>>(defaults: T) {
    return {
      merge(opts: Partial<T> = {}): T {
        return deepMerge(defaults, opts) as T;
      },
    };
  }

  function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };
    for (const [k, v] of Object.entries(source)) {
      if (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof result[k] === "object" &&
        result[k] !== null
      ) {
        result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  it("method with options merges string options", () => {
    const m = withOptions({ class: "default" });
    expect((m as any).merge({ id: "foo" })).toEqual({ class: "default", id: "foo" });
  });

  it("method with options merges options when options are present", () => {
    const m = withOptions({ html: { class: "btn" } });
    expect((m as any).merge({ html: { id: "x" } })).toEqual({ html: { class: "btn", id: "x" } });
  });

  it("method with options appends options when options are missing", () => {
    const m = withOptions({ disabled: true });
    expect((m as any).merge({})).toEqual({ disabled: true });
  });

  it("method with options copies options when options are missing", () => {
    const defaults = { size: 10 };
    const m = withOptions(defaults);
    const result = (m as any).merge({});
    result.size = 99;
    expect(defaults.size).toBe(10); // original not mutated
  });

  it("method with options allows to overwrite options", () => {
    const m = withOptions({ color: "red" });
    expect((m as any).merge({ color: "blue" })).toEqual({ color: "blue" });
  });

  it("nested method with options containing hashes merge", () => {
    const m = withOptions({ style: { color: "red" } });
    expect((m as any).merge({ style: { size: "big" } })).toEqual({
      style: { color: "red", size: "big" },
    });
  });

  it("nested method with options containing hashes overwrite", () => {
    const m = withOptions({ style: { color: "red" } });
    expect((m as any).merge({ style: { color: "blue" } })).toEqual({ style: { color: "blue" } });
  });

  it("nested method with options containing hashes going deep", () => {
    const m = withOptions({ a: { b: { c: 1 } } });
    expect((m as any).merge({ a: { b: { d: 2 } } })).toEqual({ a: { b: { c: 1, d: 2 } } });
  });

  it("nested method with options using lambda as only argument", () => {
    const fn = (opts: Record<string, unknown>) => ({ result: opts.value });
    const defaults = { value: 42 };
    expect(fn(defaults)).toEqual({ result: 42 });
  });

  it("proc as first argument with other options should still merge options", () => {
    const m = withOptions({ shared: true });
    expect((m as any).merge({ extra: "yes" })).toEqual({ shared: true, extra: "yes" });
  });

  it("option merger class method", () => {
    const m = withOptions({ type: "submit" });
    expect((m as any).merge({})).toHaveProperty("type", "submit");
  });

  it("option merger implicit receiver", () => {
    const m = withOptions({ class: "btn" });
    const result = (m as any).merge({ id: "submit-btn" });
    expect(result).toMatchObject({ class: "btn", id: "submit-btn" });
  });

  it("with options hash like", () => {
    const options = { a: 1, b: 2 };
    const m = withOptions(options);
    expect((m as any).merge({ c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("with options no block", () => {
    const m = withOptions({ x: 10 });
    expect((m as any).merge()).toEqual({ x: 10 });
  });
});
