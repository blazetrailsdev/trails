import { expect, it } from "vitest";

import { Encoding } from "../json/encoding.js";
import { NullSerializer } from "../message-encryptor.js";
import { Temporal } from "../temporal.js";
import { currentTimeInstant, setFrozenInstant } from "../time-travel.js";
import type { MessageSerializer } from "./codec.js";
import { Metadata, type ExpectedMetadataOptions, type MetadataOptions } from "./metadata.js";
import type { Format } from "./serializer-with-fallback.js";

export function usingMessageSerializerForMetadata(value: boolean, block: () => void): void {
  const original = Metadata.useMessageSerializerForMetadata;
  Metadata.useMessageSerializerForMetadata = value;
  try {
    block();
  } finally {
    Metadata.useMessageSerializerForMetadata = original;
  }
}

export function freezeTime(
  block: (travel: (duration: Temporal.DurationLike) => void) => void,
): void {
  let now = currentTimeInstant();
  setFrozenInstant(now);
  try {
    block((duration) => {
      now = now.add(duration);
      setFrozenInstant(now);
    });
  } finally {
    setFrozenInstant(null);
  }
}

/**
 * Ruby's `Time#<=>` coerces a non-Time operand through `to_datetime <=> other`
 * (activesupport/lib/active_support/core_ext/time/calculations.rb:329-343), so
 * `Time.local(2004) == "2004-01-01 00:00:00 -0500"` is true and Rails'
 * `assert_equal data, ...` holds over {@link DATA} even under the serializers
 * that decode the time back as a string. JS equality has no such coercion, so
 * the two spellings `ActiveSupport::JSON` can render an instant in —
 * `xmlschema` and the `use_standard_json_time_format = false` slash format
 * (json.ts `temporalAsJson`) — are compared the same way here.
 */
expect.addEqualityTesters([
  function (a: unknown, b: unknown): boolean | undefined {
    const [instant, other] =
      a instanceof Temporal.Instant
        ? [a, b]
        : b instanceof Temporal.Instant
          ? [b, a]
          : [null, null];
    if (instant === null || typeof other !== "string") return undefined;
    const slash = other.match(/^(\d+)\/(\d\d)\/(\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)$/);
    const iso = slash
      ? `${slash[1]}-${slash[2]}-${slash[3]}T${slash[4]}${slash[5]}:${slash[6]}`
      : other;
    try {
      return Temporal.Instant.from(iso).equals(instant);
    } catch {
      return false;
    }
  },
]);

/** Rails' `Time.local(2004)`. */
const A_TIME = Temporal.Instant.from("2004-01-01T00:00:00Z");

/** Rails' `DATA`. */
const DATA: readonly unknown[] = [
  "a string",
  { a_number: 123, a_time: A_TIME, an_object: { key: "value" } },
  ["a string", 123, A_TIME, { key: "value" }],
];

const CustomSerializer: MessageSerializer = {
  dump(value: unknown): string {
    return `${JSON.stringify(value)}!`;
  },

  load(value: string): unknown {
    return JSON.parse(value.replace(/!$/, ""));
  },
};

/**
 * Rails' `SERIALIZERS`. Rails lists `JSON` and `ActiveSupport::JSON`
 * separately; trails' `:json` serializer is `ActiveSupport::JSON`, so those
 * two entries collapse into one.
 */
const SERIALIZERS: readonly (Format | MessageSerializer)[] = [
  "marshal",
  "json",
  "message_pack",
  CustomSerializer,
];

export function eachScenario<T>(
  makeCodec: (serializer: Format | MessageSerializer) => T,
  block: (data: unknown, codec: T) => void,
): void {
  for (const useMessageSerializerForMetadata of [false, true]) {
    usingMessageSerializerForMetadata(useMessageSerializerForMetadata, () => {
      for (const serializer of SERIALIZERS) {
        const codec = makeCodec(serializer);
        for (const data of DATA) {
          block(data, codec);
        }
      }
    });
  }
}

/** Rails' `make_codec` / `encode` / `decode`, which each including test supplies. */
export interface MetadataCodecHooks<T> {
  makeCodec(serializer: Format | MessageSerializer): T;
  encode(data: unknown, codec: T, options?: MetadataOptions): string;
  decode(message: string, codec: T, options?: ExpectedMetadataOptions): unknown;
}

/**
 * Rails' `MessageMetadataTests` — the module both `MessageVerifierMetadataTest`
 * and `MessageEncryptorMetadataTest` `include`.
 */
export function messageMetadataTests<T>(hooks: MetadataCodecHooks<T>): void {
  const { makeCodec, encode, decode } = hooks;

  const roundtrip = (
    data: unknown,
    codec: T,
    encodeOptions: MetadataOptions = {},
    decodeOptions: ExpectedMetadataOptions = {},
  ): unknown => decode(encode(data, codec, encodeOptions), codec, decodeOptions);

  const assertRoundtrip = (
    data: unknown,
    codec: T,
    encodeOptions: MetadataOptions = {},
    decodeOptions: ExpectedMetadataOptions = {},
  ): void => {
    expect(roundtrip(data, codec, encodeOptions, decodeOptions)).toEqual(data);
  };

  const assertNoRoundtrip = (
    data: unknown,
    codec: T,
    encodeOptions: MetadataOptions = {},
    decodeOptions: ExpectedMetadataOptions = {},
  ): void => {
    expect(roundtrip(data, codec, encodeOptions, decodeOptions)).toBeNull();
  };

  const each = (block: (data: unknown, codec: T) => void): void => eachScenario(makeCodec, block);

  it("message :purpose must match specified :purpose", () => {
    each((data, codec) => {
      assertRoundtrip(data, codec, { purpose: "x" }, { purpose: "x" });

      assertNoRoundtrip(data, codec, { purpose: "x" }, { purpose: "y" });
      assertNoRoundtrip(data, codec, { purpose: "x" }, {});
      assertNoRoundtrip(data, codec, {}, { purpose: "x" });
    });
  });

  // Rails' ":purpose can be a symbol" has no analogue here: JS has no Ruby
  // symbol, and `String(Symbol("x"))` is `"Symbol(x)"` rather than `"x"`, so a
  // JS symbol is not the string-interchangeable value that case asserts about.

  it("message expires with :expires_at", () => {
    freezeTime((travel) => {
      each((data, codec) => {
        const message = encode(data, codec, {
          expiresAt: currentTimeInstant().add({ seconds: 1 }),
        });

        travel({ milliseconds: 500 });
        expect(decode(message, codec)).toEqual(data);

        travel({ milliseconds: 500 });
        expect(decode(message, codec)).toBeNull();
      });
    });
  });

  it("message expires with :expires_in", () => {
    freezeTime((travel) => {
      each((data, codec) => {
        const message = encode(data, codec, { expiresIn: 1 });

        travel({ milliseconds: 500 });
        expect(decode(message, codec)).toEqual(data);

        travel({ milliseconds: 500 });
        expect(decode(message, codec)).toBeNull();
      });
    });
  });

  it(":expires_at overrides :expires_in", () => {
    freezeTime((travel) => {
      each((data, codec) => {
        const message = encode(data, codec, {
          expiresAt: currentTimeInstant().add({ hours: 1 }),
          expiresIn: 1,
        });

        travel({ minutes: 1 });
        expect(decode(message, codec)).toEqual(data);

        travel({ hours: 1 });
        expect(decode(message, codec)).toBeNull();
      });
    });
  });

  it("messages do not expire by default", () => {
    freezeTime((travel) => {
      each((data, codec) => {
        const message = encode(data, codec, { purpose: "x" });

        travel({ hours: 1000 * 365 * 24 });
        expect(decode(message, codec, { purpose: "x" })).toEqual(data);
      });
    });
  });

  it("expiration works with ActiveSupport.use_standard_json_time_format = false", () => {
    const original = Encoding.useStandardJsonTimeFormat;
    Encoding.useStandardJsonTimeFormat = false;
    try {
      each((data, codec) => {
        assertRoundtrip(data, codec, { expiresAt: currentTimeInstant().add({ hours: 1 }) });
      });
    } finally {
      Encoding.useStandardJsonTimeFormat = original;
    }
  });

  it("metadata works with NullSerializer", () => {
    const codec = makeCodec(NullSerializer);
    assertRoundtrip(
      "a string",
      codec,
      { purpose: "x", expiresIn: 365 * 24 * 60 * 60 },
      { purpose: "x" },
    );
  });

  it("messages with non-string purpose are readable", () => {
    each((data, codec) => {
      const message = encode(data, codec, { purpose: ["x", 1] });
      expect(decode(message, codec, { purpose: ["x", 1] })).toEqual(data);
    });
  });

  it("messages are readable regardless of use_message_serializer_for_metadata", () => {
    each((data, codec) => {
      const message = encode(data, codec, { purpose: "x" });
      const messageSetting = Metadata.useMessageSerializerForMetadata;

      usingMessageSerializerForMetadata(!messageSetting, () => {
        expect(decode(message, codec, { purpose: "x" })).toEqual(data);
      });
    });
  });
}
