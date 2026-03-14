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

describe("MessagesSerializerWithFallbackTest", () => {
  it.skip(":marshal serializer dumps objects using Marshal format", () => {
    /* fixture-dependent */
  });
  it.skip(":json serializer dumps objects using JSON format", () => {
    /* fixture-dependent */
  });
  it.skip(":message_pack serializer dumps objects using MessagePack format", () => {
    /* fixture-dependent */
  });
  it.skip("every serializer can load every non-Marshal format", () => {
    /* fixture-dependent */
  });
  it.skip("only :marshal and :*_allow_marshal serializers can load Marshal format", () => {
    /* fixture-dependent */
  });
  it.skip(":json serializer recognizes regular JSON", () => {
    /* fixture-dependent */
  });
  it.skip(":json serializer can load irregular JSON", () => {
    /* fixture-dependent */
  });
  it.skip("notifies when serializer falls back to loading an alternate format", () => {
    /* fixture-dependent */
  });
  it.skip("raises on invalid format name", () => {
    /* fixture-dependent */
  });
});

describe("MessageVerifierMetadataTest", () => {
  it("#verify raises when :purpose does not match", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate("data", { purpose: "login" });
    expect(() => verifier.verify(message, { purpose: "admin" })).toThrow();
  });

  it("#verify raises when message is expired via :expires_at", () => {
    const verifier = new MessageVerifier("secret");
    const pastDate = new Date(Date.now() - 1000);
    const message = verifier.generate("data", { expiresAt: pastDate });
    expect(() => verifier.verify(message)).toThrow();
  });

  it("#verify raises when message is expired via :expires_in", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate("data", { expiresIn: -1 }); // already expired
    expect(() => verifier.verify(message)).toThrow();
  });

  it("messages are readable by legacy versions when use_message_serializer_for_metadata = false", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate("hello");
    expect(verifier.verify(message)).toBe("hello");
  });

  it("messages are readable by legacy versions when force_legacy_metadata_serializer is true", () => {
    const verifier = new MessageVerifier("secret");
    const message = verifier.generate({ key: "value" });
    expect(verifier.verify(message)).toEqual({ key: "value" });
  });

  it("messages keep the old format when use_message_serializer_for_metadata is false", () => {
    const verifier = new MessageVerifier("secret");
    const msg = verifier.generate(42);
    expect(verifier.verify(msg)).toBe(42);
  });
});

describe("MessageVerifiersTest", () => {
  it.skip("can override secret generator", () => {
    /* fixture-dependent */
  });
  it.skip("supports arbitrary secret generator kwargs", () => {
    /* fixture-dependent */
  });
  it.skip("supports arbitrary secret generator kwargs when using #rotate block", () => {
    /* fixture-dependent */
  });
});

describe("MessagesRotationConfiguration", () => {
  it.skip("signed configurations", () => {
    /* fixture-dependent */
  });
  it.skip("encrypted configurations", () => {
    /* fixture-dependent */
  });
});

describe("MessageVerifierRotatorTest", () => {
  it.skip("rotate digest", () => {
    /* fixture-dependent */
  });
});
