import {
  ArgumentError,
  Hash,
  LoadError,
  fetch,
  Marshal,
  RuntimeError,
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
  key: Format;
  format(): Format;
  dump(object: unknown): string | Uint8Array;
  _load(dumped: string | Uint8Array): unknown;
  dumped(dumped: string | Uint8Array): boolean;
  load(dumped: string | Uint8Array): unknown;
  /** @internal */
  detectFormat(dumped: string | Uint8Array): Format | undefined;
  /** @internal */
  fallback(format: Format): boolean;
}

function load(this: Serializer, dumped: string | Uint8Array): unknown {
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
}

/** @internal */
function detectFormat(dumped: string | Uint8Array): Format | undefined {
  if (messagePackWithFallback.dumped(dumped)) {
    return "message_pack";
  } else if (marshalWithFallback.dumped(dumped)) {
    return "marshal";
  } else if (jsonWithFallback.dumped(dumped)) {
    return "json";
  }
  return undefined;
}

/** @internal */
function fallback(format: Format): boolean {
  return format !== "marshal";
}

function allowMarshalFallback(format: Format): boolean {
  return fallback(format) || format === "marshal";
}

const serializerWithFallback = { load, detectFormat, fallback };

const MARSHAL_SIGNATURE = "\x04\x08";

const marshalWithFallback: Serializer = {
  ...serializerWithFallback,
  key: "marshal",
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
};

const JSON_START_WITH = /^(?:[{["]|-?\d|true|false|null)/;

const jsonWithFallback: Serializer = {
  ...serializerWithFallback,
  key: "json",
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

  detectFormat(dumped: string | Uint8Array): Format | undefined {
    return detectFormat(dumped) ?? "json";
  },
};

const jsonWithFallbackAllowMarshal: Serializer = {
  ...jsonWithFallback,
  key: "json_allow_marshal",
  fallback: allowMarshalFallback,
};

const messagePackWithFallback: Serializer = {
  ...serializerWithFallback,
  key: "message_pack",
  format(): Format {
    return "message_pack";
  },

  dump(object: unknown): Uint8Array {
    return ActiveSupport.MessagePack!.dump(object);
  },

  _load(dumped: string | Uint8Array): unknown {
    return ActiveSupport.MessagePack!.load(dumped);
  },

  dumped(dumped: string | Uint8Array): boolean {
    return isAvailable() && ActiveSupport.MessagePack!.isSignature(dumped);
  },
};

/**
 * @missingRailsCall require — PERMANENT
 * @internal
 */
function isAvailable(): boolean {
  return ActiveSupport.MessagePack !== undefined;
}

const messagePackWithFallbackAllowMarshal: Serializer = {
  ...messagePackWithFallback,
  key: "message_pack_allow_marshal",
  fallback: allowMarshalFallback,
};

/** @internal */
export const SERIALIZERS = new Hash<Format, Serializer>()
  .set("marshal", marshalWithFallback)
  .set("json", jsonWithFallback)
  .set("json_allow_marshal", jsonWithFallbackAllowMarshal)
  .set("message_pack", messagePackWithFallback)
  .set("message_pack_allow_marshal", messagePackWithFallbackAllowMarshal);

/** @internal */
export const SerializerWithFallback = {
  SERIALIZERS,

  /** @missingRailsCall require — PERMANENT */
  get(format: string): Serializer {
    if (format.includes("message_pack") && ActiveSupport.MessagePack === undefined) {
      throw new LoadError("cannot load such file -- active_support/message_pack");
    }

    return fetch(SERIALIZERS, format as Format) as Serializer;
  },
};
