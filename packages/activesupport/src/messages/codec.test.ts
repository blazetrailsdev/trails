import { describe, expect, it } from "vitest";

import { Codec, type CodecOptions, type MessageSerializer } from "./codec.js";
import { SerializerWithFallback } from "./serializer-with-fallback.js";

class ExposedCodec extends Codec {
  get exposedSerializer(): MessageSerializer {
    return this.serializer;
  }
}

function makeCodec(options: CodecOptions = {}): ExposedCodec {
  return new ExposedCodec(options);
}

function assertSerializer(serializer: MessageSerializer, codec: ExposedCodec): void {
  expect(codec.exposedSerializer).toBe(serializer);
}

describe("Messages::Codec", () => {
  it("::default_serializer determines the default serializer", () => {
    const original = Codec.defaultSerializer;
    try {
      Codec.defaultSerializer = "marshal";
      assertSerializer(SerializerWithFallback.get("marshal"), makeCodec());

      Codec.defaultSerializer = "json";
      assertSerializer(SerializerWithFallback.get("json"), makeCodec());
    } finally {
      Codec.defaultSerializer = original;
    }
  });

  it(":serializer option resolves symbols via SerializerWithFallback", () => {
    for (const symbol of ["marshal", "json", "json_allow_marshal"] as const) {
      assertSerializer(SerializerWithFallback.get(symbol), makeCodec({ serializer: symbol }));
    }
  });
});
