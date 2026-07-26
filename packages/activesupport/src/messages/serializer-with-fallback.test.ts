import { describe, it, expect } from "vitest";
import { Notifications } from "../notifications.js";
import { ActiveSupportJSON } from "../json.js";
import { coder } from "../cache/coder.js";
import { MessagePack } from "../message-pack/index.js";
import {
  KeyError,
  SERIALIZERS,
  SerializerWithFallback,
  type Format,
  type Serializer,
} from "./serializer-with-fallback.js";

const FORMATS = Object.keys(SERIALIZERS) as Format[];

function serializer(format: Format): Serializer {
  return SerializerWithFallback.get(format);
}

const MARSHAL_SIGNATURE = "\x04\x08";
const marshalModule = {
  load: (dumped: string) => coder.load(dumped.slice(MARSHAL_SIGNATURE.length)),
};
const jsonModule = { load: (dumped: string) => ActiveSupportJSON.decode(dumped) };
const messagePackModule = {
  load: (dumped: string) => MessagePack.load(Buffer.from(dumped, "latin1")),
};

function assertRoundtrip(
  serializerUnderTest: Serializer,
  deserializer: { load(dumped: string): unknown } = serializerUnderTest,
): void {
  const value = [{ a_boolean: false, a_number: 123 }];
  expect(deserializer.load(serializerUnderTest.dump(value))).toEqual(value);
}

describe("MessagesSerializerWithFallbackTest", () => {
  it(":marshal serializer dumps objects using Marshal format", () => {
    assertRoundtrip(serializer("marshal"), marshalModule);
  });

  it(":json serializer dumps objects using JSON format", () => {
    assertRoundtrip(serializer("json"), jsonModule);
    assertRoundtrip(serializer("json_allow_marshal"), jsonModule);
  });

  it(":message_pack serializer dumps objects using MessagePack format", () => {
    assertRoundtrip(serializer("message_pack"), messagePackModule);
    assertRoundtrip(serializer("message_pack_allow_marshal"), messagePackModule);
  });

  it("every serializer can load every non-Marshal format", () => {
    for (const dumping of FORMATS.filter((format) => format !== "marshal")) {
      for (const loading of FORMATS) {
        assertRoundtrip(serializer(dumping), serializer(loading));
      }
    }
  });

  it("only :marshal and :*_allow_marshal serializers can load Marshal format", () => {
    const marshalLoadingFormats = FORMATS.filter((format) => /(?:^|_allow_)marshal/.test(format));
    expect(marshalLoadingFormats.length).toBeGreaterThan(1);

    for (const loading of marshalLoadingFormats) {
      assertRoundtrip(serializer("marshal"), serializer(loading));
    }

    const marshalled = serializer("marshal").dump({});

    for (const loading of FORMATS.filter((format) => !marshalLoadingFormats.includes(format))) {
      expect(() => serializer(loading).load(marshalled)).toThrow(/unsupported/i);
    }
  });

  it(":json serializer recognizes regular JSON", () => {
    for (const value of [null, false, true, 0, 1, -1, 0.0, 1.0, -1.0, 0.1, -0.1, "", [], {}]) {
      const dumped = serializer("json").dump(value);
      expect(serializer("json").dumped(dumped)).toBe(true);
    }
  });

  it(":json serializer can load irregular JSON", () => {
    const value = { foo: "bar" };
    const dumped = serializer("json").dump(value);

    expect(serializer("json").load(` /* comment */ ${dumped}`)).toEqual(value);
  });

  it("notifies when serializer falls back to loading an alternate format", async () => {
    const value = { foo: "bar" };
    const dumped = serializer("json").dump(value);

    const payloads: Record<string, unknown>[] = [];
    await Notifications.subscribed(
      (_name, _start, _finish, _id, payload) => {
        payloads.push(payload as Record<string, unknown>);
      },
      "message_serializer_fallback.active_support",
      () => {
        serializer("marshal").load(dumped);
      },
    );

    expect(payloads.length).toBe(1);
    expect(payloads[0].serializer).toBe("marshal");
    expect(payloads[0].fallback).toBe("json");
    expect(payloads[0].serialized).toBe(dumped);
    expect(payloads[0].deserialized).toEqual(value);
  });

  it("raises on invalid format name", () => {
    expect(() => SerializerWithFallback.get("invalid_format")).toThrow(KeyError);
  });
});
