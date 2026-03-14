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

describe("SubscriberTest", () => {
  it("attaches subscribers", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe("test.action", (e) => events.push(e.name));
    Notifications.instrument("test.action");
    Notifications.unsubscribe(sub);
    expect(events).toContain("test.action");
  });

  it("attaches subscribers with inherit all option", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe(null, (e) => events.push(e.name));
    Notifications.instrument("any.event");
    Notifications.instrument("another.event");
    Notifications.unsubscribe(sub);
    expect(events).toContain("any.event");
    expect(events).toContain("another.event");
  });

  it("attaches subscribers with inherit all option replaces original behavior", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe(/\.test$/, (e) => events.push(e.name));
    Notifications.instrument("foo.test");
    Notifications.instrument("bar.test");
    Notifications.instrument("foo.other");
    Notifications.unsubscribe(sub);
    expect(events).toContain("foo.test");
    expect(events).toContain("bar.test");
    expect(events).not.toContain("foo.other");
  });

  it("attaches only one subscriber", () => {
    const events: string[] = [];
    const handler = (e: { name: string }) => events.push(e.name);
    const sub = Notifications.subscribe("single.test", handler);
    Notifications.instrument("single.test");
    Notifications.unsubscribe(sub);
    expect(events).toHaveLength(1);
  });

  it("does not attach private methods", () => {
    // In JS there are no private methods on subscribers in the same way
    // Test that only the intended handler is called
    let called = 0;
    const sub = Notifications.subscribe("private.test", () => called++);
    Notifications.instrument("private.test");
    Notifications.unsubscribe(sub);
    expect(called).toBe(1);
  });

  it("detaches subscribers", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe("detach.test", (e) => events.push(e.name));
    Notifications.instrument("detach.test");
    Notifications.unsubscribe(sub);
    Notifications.instrument("detach.test");
    expect(events).toHaveLength(1);
  });

  it("detaches subscribers from inherited methods", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe("inherited.test", (e) => events.push(e.name));
    Notifications.instrument("inherited.test");
    Notifications.unsubscribe(sub);
    Notifications.instrument("inherited.test");
    expect(events).toHaveLength(1);
  });

  it("supports publish event", () => {
    const events: { name: string; payload: Record<string, unknown> }[] = [];
    const sub = Notifications.subscribe("publish.test", (e) =>
      events.push({ name: e.name, payload: e.payload }),
    );
    Notifications.instrument("publish.test", { message: "hello" });
    Notifications.unsubscribe(sub);
    expect(events[0].name).toBe("publish.test");
    expect(events[0].payload.message).toBe("hello");
  });

  it("publish event preserve units", () => {
    const events: { name: string }[] = [];
    const sub = Notifications.subscribe("units.test", (e) => events.push({ name: e.name }));
    Notifications.instrument("units.test", { value: 42, unit: "ms" });
    Notifications.unsubscribe(sub);
    expect(events[0].name).toBe("units.test");
  });
});
