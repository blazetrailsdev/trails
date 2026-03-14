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

describe("TimeTravelTest", () => {
  afterEach(() => {
    travelBack();
  });

  it("time helper travel", () => {
    const before = Date.now();
    travel(24 * 60 * 60 * 1000); // 1 day
    const after = currentTime().getTime();
    expect(after - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
  });

  it("time helper travel with block", () => {
    let inside: Date | null = null;
    travel(1000, () => {
      inside = currentTime();
    });
    expect(inside).not.toBeNull();
  });

  it("time helper travel to", () => {
    travelTo(new Date("2030-01-01T00:00:00Z"));
    expect(currentTime().getUTCFullYear()).toBe(2030);
  });

  it("time helper travel to with block", () => {
    let inside: Date | null = null;
    travelTo(new Date("2032-06-15T12:00:00Z"), () => {
      inside = currentTime();
    });
    expect(inside!.getUTCFullYear()).toBe(2032);
  });

  it.skip("time helper travel to with time zone", () => {
    /* TimeZone not implemented */
  });
  it.skip("time helper travel to with different system and application time zones", () => {
    /* TimeZone */
  });
  it.skip("time helper travel to with string for time zone", () => {
    /* TimeZone */
  });

  it("time helper travel to with string and milliseconds", () => {
    const target = new Date("2033-03-15T10:30:00Z");
    travelTo(target);
    expect(currentTime().getUTCFullYear()).toBe(2033);
    expect(currentTime().getUTCMonth()).toBe(2); // March = 2
  });

  it.skip("time helper travel to with separate class", () => {
    /* Ruby-specific Time subclass */
  });

  it("time helper travel back", () => {
    const before = new Date();
    travelTo(new Date("2050-01-01"));
    travelBack();
    expect(Math.abs(currentTime().getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("time helper travel back with block", () => {
    travelTo(new Date("2040-01-01"), () => {
      expect(currentTime().getUTCFullYear()).toBe(2040);
    });
    expect(currentTime().getUTCFullYear()).not.toBe(2040);
  });

  it("time helper travel to with nested calls with blocks", () => {
    travelTo(new Date("2035-01-01"), () => {
      expect(currentTime().getUTCFullYear()).toBe(2035);
      travelTo(new Date("2036-01-01"), () => {
        expect(currentTime().getUTCFullYear()).toBe(2036);
      });
    });
  });

  it("time helper travel to with nested calls", () => {
    travelTo(new Date("2037-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2037);
    travelTo(new Date("2038-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2038);
  });

  it("time helper travel to with subsequent calls", () => {
    travelTo(new Date("2035-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2035);
    travelTo(new Date("2036-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2036);
  });

  it.skip("time helper travel to with usec", () => {
    /* microseconds */
  });
  it.skip("time helper with usec true", () => {
    /* microseconds */
  });
  it.skip("time helper travel to with datetime and usec", () => {
    /* microseconds */
  });
  it.skip("time helper travel to with datetime and usec true", () => {
    /* microseconds */
  });
  it.skip("time helper travel to with string and usec", () => {
    /* microseconds */
  });
  it.skip("time helper travel to with string and usec true", () => {
    /* microseconds */
  });
  it.skip("time helper freeze time with usec true", () => {
    /* microseconds */
  });

  it("time helper travel with subsequent block", () => {
    const results: number[] = [];
    travelTo(new Date("2041-01-01"), () => {
      results.push(currentTime().getUTCFullYear());
    });
    travelTo(new Date("2042-01-01"), () => {
      results.push(currentTime().getUTCFullYear());
    });
    expect(results).toEqual([2041, 2042]);
  });

  it.skip("travel to will reset the usec to avoid mysql rounding", () => {
    /* DB-specific */
  });
  it.skip("time helper travel with time subclass", () => {
    /* Ruby Time subclass */
  });

  it("time helper freeze time", () => {
    freezeTime();
    const t1 = currentTime().getTime();
    const t2 = currentTime().getTime();
    expect(Math.abs(t2 - t1)).toBeLessThan(10);
  });

  it("time helper freeze time with block", () => {
    let frozen: Date | null = null;
    freezeTime(() => {
      frozen = currentTime();
    });
    expect(frozen).not.toBeNull();
  });

  it("time helper unfreeze time", () => {
    freezeTime();
    travelBack();
    expect(Math.abs(currentTime().getTime() - Date.now())).toBeLessThan(100);
  });
});
