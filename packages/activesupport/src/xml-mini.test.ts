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

describe("HashToXmlTest", () => {
  it.skip("one level", () => {
    /* fixture-dependent */
  });
  it.skip("one level dasherize false", () => {
    /* fixture-dependent */
  });
  it.skip("one level dasherize true", () => {
    /* fixture-dependent */
  });
  it.skip("one level camelize true", () => {
    /* fixture-dependent */
  });
  it.skip("one level camelize lower", () => {
    /* fixture-dependent */
  });
  it.skip("one level with types", () => {
    /* fixture-dependent */
  });
  it.skip("one level with nils", () => {
    /* fixture-dependent */
  });
  it.skip("one level with skipping types", () => {
    /* fixture-dependent */
  });
  it.skip("one level with yielding", () => {
    /* fixture-dependent */
  });
  it.skip("two levels", () => {
    /* fixture-dependent */
  });
  it.skip("two levels with second level overriding to xml", () => {
    /* fixture-dependent */
  });
  it.skip("two levels with array", () => {
    /* fixture-dependent */
  });
  it.skip("three levels with array", () => {
    /* fixture-dependent */
  });
  it.skip("multiple records from xml with attributes other than type ignores them without exploding", () => {
    /* fixture-dependent */
  });
  it.skip("single record from xml", () => {
    /* fixture-dependent */
  });
  it.skip("single record from xml with nil values", () => {
    /* fixture-dependent */
  });
  it.skip("multiple records from xml", () => {
    /* fixture-dependent */
  });
  it.skip("single record from xml with attributes other than type", () => {
    /* fixture-dependent */
  });
  it.skip("all caps key from xml", () => {
    /* fixture-dependent */
  });
  it.skip("empty array from xml", () => {
    /* fixture-dependent */
  });
  it.skip("empty array with whitespace from xml", () => {
    /* fixture-dependent */
  });
  it.skip("array with one entry from xml", () => {
    /* fixture-dependent */
  });
  it.skip("array with multiple entries from xml", () => {
    /* fixture-dependent */
  });
  it.skip("file from xml", () => {
    /* fixture-dependent */
  });
  it.skip("file from xml with defaults", () => {
    /* fixture-dependent */
  });
  it.skip("tag with attrs and whitespace", () => {
    /* fixture-dependent */
  });
  it.skip("empty cdata from xml", () => {
    /* fixture-dependent */
  });
  it.skip("xsd like types from xml", () => {
    /* fixture-dependent */
  });
  it.skip("type trickles through when unknown", () => {
    /* fixture-dependent */
  });
  it.skip("from xml raises on disallowed type attributes", () => {
    /* fixture-dependent */
  });
  it.skip("from xml disallows symbol and yaml types by default", () => {
    /* fixture-dependent */
  });
  it.skip("from xml array one", () => {
    /* fixture-dependent */
  });
  it.skip("from xml array many", () => {
    /* fixture-dependent */
  });
  it.skip("from trusted xml allows symbol and yaml types", () => {
    /* fixture-dependent */
  });
  it.skip("kernel method names to xml", () => {
    /* fixture-dependent */
  });
  it.skip("empty string works for typecast xml value", () => {
    /* fixture-dependent */
  });
  it.skip("escaping to xml", () => {
    /* fixture-dependent */
  });
  it.skip("unescaping from xml", () => {
    /* fixture-dependent */
  });
  it.skip("roundtrip to xml from xml", () => {
    /* fixture-dependent */
  });
  it.skip("datetime xml type with utc time", () => {
    /* fixture-dependent */
  });
  it.skip("datetime xml type with non utc time", () => {
    /* fixture-dependent */
  });
  it.skip("datetime xml type with far future date", () => {
    /* fixture-dependent */
  });
  it.skip("to xml dups options", () => {
    /* fixture-dependent */
  });
  it.skip("expansion count is limited", () => {
    /* fixture-dependent */
  });
});

describe("ToXmlTest", () => {
  it.skip("to xml with hash elements", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with non hash elements", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with non hash different type elements", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with dedicated name", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with options", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with indent set", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with dasherize false", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with dasherize true", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with instruct", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with block", () => {
    /* fixture-dependent */
  });
  it.skip("to xml with empty", () => {
    /* fixture-dependent */
  });
  it.skip("to xml dups options", () => {
    /* fixture-dependent */
  });
});

describe("ParsingTest", () => {
  it.skip("symbol", () => {
    /* fixture-dependent */
  });
  it.skip("date", () => {
    /* fixture-dependent */
  });
  it.skip("datetime", () => {
    /* fixture-dependent */
  });
  it.skip("duration", () => {
    /* fixture-dependent */
  });
  it.skip("integer", () => {
    /* fixture-dependent */
  });
  it.skip("float", () => {
    /* fixture-dependent */
  });
  it.skip("decimal", () => {
    /* fixture-dependent */
  });
  it.skip("boolean", () => {
    /* fixture-dependent */
  });
  it.skip("string", () => {
    /* fixture-dependent */
  });
  it.skip("yaml", () => {
    /* fixture-dependent */
  });
  it.skip("hexBinary", () => {
    /* fixture-dependent */
  });
  it.skip("base64Binary and binary", () => {
    /* fixture-dependent */
  });
});
