import {
  ArgumentError,
  Hash,
  LoadError,
  fetch,
  Marshal,
  RuntimeError,
  extend,
  include,
  rbCallSuper,
  rbRegMatchP,
  rbStrStartWith,
} from "@blazetrails/ruby-compat";

import { Notifications } from "../notifications.js";
import { ActiveSupportJSON } from "../json.js";
import { ActiveSupport } from "../namespaces.js";

/** @internal */
export type Format =
  | "marshal"
  | "json"
  | "json_allow_marshal"
  | "message_pack"
  | "message_pack_allow_marshal";

export { ArgumentError, RuntimeError };

/** @internal */
export class Thrown extends Error {
  constructor(
    readonly tag: string,
    readonly value: unknown,
  ) {
    super(String(tag));
    this.name = "Thrown";
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export interface Serializer {
  format(): Format;
  dump(object: unknown): string | Uint8Array;
  _load(dumped: string | Uint8Array): unknown;
  dumped(dumped: string | Uint8Array): boolean;
  load(dumped: string | Uint8Array): unknown;
  /** @internal */
  detectFormat(dumped: string | Uint8Array): Format | undefined;
  /** @internal */
  fallback(format: Format): boolean;
  /** @internal */
  isAvailable?(): boolean;
}

/** @internal */
export const SerializerWithFallback = {
  load(this: Serializer, dumped: string | Uint8Array): unknown {
    const format = this.detectFormat(dumped);

    if (format === this.format()) {
      return this._load(dumped);
    } else if (format && this.fallback(format)) {
      const payload: Record<string, unknown> = {
        serializer: SERIALIZERS.key(this),
        fallback: format,
        serialized: dumped,
      };
      return Notifications.instrument(
        "message_serializer_fallback.active_support",
        payload,
        (p) => (p.deserialized = SERIALIZERS.get(format)!._load(dumped)),
      );
    } else {
      throw new RuntimeError("Unsupported serialization format");
    }
  },

  /** @internal */
  detectFormat(dumped: string | Uint8Array): Format | undefined {
    if (MessagePackWithFallback.dumped(dumped)) {
      return "message_pack";
    } else if (MarshalWithFallback.dumped(dumped)) {
      return "marshal";
    } else if (JsonWithFallback.dumped(dumped)) {
      return "json";
    }
    return undefined;
  },

  /** @internal */
  fallback(format: Format): boolean {
    return format !== "marshal";
  },
} as {
  load(dumped: string | Uint8Array): unknown;
  detectFormat(dumped: string | Uint8Array): Format | undefined;
  fallback(format: Format): boolean;
  SERIALIZERS: Hash<Format, Serializer>;
  get(format: string): Serializer;
  AllowMarshal: { fallback(format: Format): boolean };
  MarshalWithFallback: Serializer;
  JsonWithFallback: Serializer;
  JsonWithFallbackAllowMarshal: Serializer;
  MessagePackWithFallback: Serializer;
  MessagePackWithFallbackAllowMarshal: Serializer;
};

/** @internal */
export const AllowMarshal = {
  /** @internal */
  fallback(this: Serializer, format: Format): boolean {
    return (rbCallSuper(this, AllowMarshal.fallback, format) as boolean) || format === "marshal";
  },
};
SerializerWithFallback.AllowMarshal = AllowMarshal;

const MARSHAL_SIGNATURE = "\x04\x08";

export const MarshalWithFallback = {
  format(): Format {
    return "marshal";
  },

  dump(object: unknown): Uint8Array {
    return Marshal.dump(object);
  },

  _load(dumped: string | Uint8Array): unknown {
    return Marshal.load(dumped);
  },

  dumped(dumped: string | Uint8Array): boolean {
    return rbStrStartWith(dumped, MARSHAL_SIGNATURE);
  },
} as Serializer;
include(MarshalWithFallback, SerializerWithFallback);
extend(MarshalWithFallback, MarshalWithFallback);
SerializerWithFallback.MarshalWithFallback = MarshalWithFallback;

const JSON_START_WITH = /^(?:[{["]|-?\d|true|false|null)/;

export const JsonWithFallback = {
  format(): Format {
    return "json";
  },

  dump(object: unknown): string {
    return ActiveSupportJSON.encode(object);
  },

  _load(dumped: string | Uint8Array): unknown {
    return ActiveSupportJSON.decode(dumped);
  },

  dumped(dumped: string | Uint8Array): boolean {
    return rbRegMatchP(JSON_START_WITH, dumped);
  },

  /** @internal */
  detectFormat(dumped: string | Uint8Array): Format | undefined {
    let format: Format | undefined;
    if (MessagePackWithFallback.dumped(dumped)) {
      format = "message_pack";
    } else if (MarshalWithFallback.dumped(dumped)) {
      format = "marshal";
    } else if (JsonWithFallback.dumped(dumped)) {
      format = "json";
    }
    return format ?? "json";
  },
} as Serializer;
include(JsonWithFallback, SerializerWithFallback);
extend(JsonWithFallback, JsonWithFallback);
SerializerWithFallback.JsonWithFallback = JsonWithFallback;

export const JsonWithFallbackAllowMarshal = {} as Serializer;
include(JsonWithFallbackAllowMarshal, JsonWithFallback);
include(JsonWithFallbackAllowMarshal, AllowMarshal);
extend(JsonWithFallbackAllowMarshal, JsonWithFallbackAllowMarshal);
SerializerWithFallback.JsonWithFallbackAllowMarshal = JsonWithFallbackAllowMarshal;

export const MessagePackWithFallback = {
  format(): Format {
    return "message_pack";
  },

  dump(object: unknown): Uint8Array {
    return ActiveSupport.MessagePack!.dump(object);
  },

  _load(dumped: string | Uint8Array): unknown {
    return ActiveSupport.MessagePack!.load(dumped);
  },

  dumped(this: Serializer, dumped: string | Uint8Array): boolean {
    return this.isAvailable!() && ActiveSupport.MessagePack!.isSignature(dumped);
  },

  /**
   * @missingRailsCall silence_warnings — PERMANENT
   * @internal
   */
  isAvailable(): boolean {
    return ActiveSupport.MessagePack !== undefined;
  },
} as Serializer;
include(MessagePackWithFallback, SerializerWithFallback);
extend(MessagePackWithFallback, MessagePackWithFallback);
SerializerWithFallback.MessagePackWithFallback = MessagePackWithFallback;

export const MessagePackWithFallbackAllowMarshal = {} as Serializer;
include(MessagePackWithFallbackAllowMarshal, MessagePackWithFallback);
include(MessagePackWithFallbackAllowMarshal, AllowMarshal);
extend(MessagePackWithFallbackAllowMarshal, MessagePackWithFallbackAllowMarshal);
SerializerWithFallback.MessagePackWithFallbackAllowMarshal = MessagePackWithFallbackAllowMarshal;

/** @internal */
export const SERIALIZERS = new Hash<Format, Serializer>()
  .set("marshal", MarshalWithFallback)
  .set("json", JsonWithFallback)
  .set("json_allow_marshal", JsonWithFallbackAllowMarshal)
  .set("message_pack", MessagePackWithFallback)
  .set("message_pack_allow_marshal", MessagePackWithFallbackAllowMarshal);

SerializerWithFallback.SERIALIZERS = SERIALIZERS;
extend(SerializerWithFallback, {
  /** @missingRailsCall require — PERMANENT */
  get(format: string): Serializer {
    if (format.includes("message_pack") && ActiveSupport.MessagePack === undefined) {
      throw new LoadError("cannot load such file -- active_support/message_pack");
    }

    return fetch(SERIALIZERS, format as Format) as Serializer;
  },
});
