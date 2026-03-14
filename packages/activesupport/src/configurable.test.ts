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

describe("ConfigurableActiveSupport", () => {
  it("adds a configuration hash", () => {
    class Config {}
    configAccessor(Config, "level", { default: "info" });
    expect((Config as any).level).toBe("info");
  });

  it("adds a configuration hash to a module as well", () => {
    const Mod = {};
    configAccessor(Mod, "debug", { default: false });
    expect((Mod as any).debug).toBe(false);
  });

  it("configuration hash is inheritable", () => {
    class Base {}
    configAccessor(Base, "timeout", { default: 30 });
    class Child extends Base {}
    expect((Child as any).timeout).toBe(30);
  });

  it("configuration accessors can take a default value as an option", () => {
    class Cfg {}
    configAccessor(Cfg, "size", { default: 100 });
    expect((Cfg as any).size).toBe(100);
  });

  it("configuration hash is available on instance", () => {
    class Cfg {}
    configAccessor(Cfg, "name", { default: "default" });
    const inst = new Cfg() as any;
    expect(inst.name).toBe("default");
  });

  it("should raise name error if attribute name is invalid", () => {
    class Cfg {}
    expect(() => configAccessor(Cfg, "invalid-name")).toThrow();
  });
});
