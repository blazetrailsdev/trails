import { ArgumentError, KeyError, RuntimeError } from "@blazetrails/ruby-compat";

import { Notifications } from "../notifications.js";
import { ActiveSupportJSON } from "../json.js";
import { coder } from "../cache/coder.js";
import { MessagePack } from "../message-pack/index.js";

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
  dump(object: unknown): string;
  _load(dumped: string): unknown;
  dumped(dumped: string): boolean;
  load(dumped: string): unknown;
  /** @internal */
  detectFormat(dumped: string): Format | undefined;
  /** @internal */
  fallback(format: Format): boolean;
}

function load(this: Serializer, dumped: string): unknown {
  const format = this.detectFormat(dumped);

  if (format === this.format()) {
    return this._load(dumped);
  } else if (format && this.fallback(format)) {
    const payload: Record<string, unknown> = {
      serializer: this.key,
      fallback: format,
      serialized: dumped,
    };
    return Notifications.instrument(
      "message_serializer_fallback.active_support",
      payload,
      (p) => (p.deserialized = SERIALIZERS[format]._load(dumped)),
    );
  } else {
    throw new RuntimeError("Unsupported serialization format");
  }
}

/** @internal */
function detectFormat(dumped: string): Format | undefined {
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

  dump(object: unknown): string {
    return MARSHAL_SIGNATURE + Buffer.from(coder.dump(object), "utf8").toString("latin1");
  },

  _load(dumped: string): unknown {
    return coder.load(
      Buffer.from(dumped.slice(MARSHAL_SIGNATURE.length), "latin1").toString("utf8"),
    );
  },

  dumped(dumped: string): boolean {
    return dumped.startsWith(MARSHAL_SIGNATURE);
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
    return Buffer.from(ActiveSupportJSON.encode(object), "utf8").toString("latin1");
  },

  _load(dumped: string): unknown {
    return ActiveSupportJSON.decode(Buffer.from(dumped, "latin1").toString("utf8"));
  },

  dumped(dumped: string): boolean {
    return JSON_START_WITH.test(dumped);
  },

  detectFormat(dumped: string): Format | undefined {
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

  dump(object: unknown): string {
    return MessagePack.dump(object).toString("latin1");
  },

  _load(dumped: string): unknown {
    return MessagePack.load(Buffer.from(dumped, "latin1"));
  },

  dumped(dumped: string): boolean {
    return isAvailable() && MessagePack.isSignature(Buffer.from(dumped, "latin1"));
  },
};

/** @internal */
function isAvailable(): boolean {
  return true;
}

const messagePackWithFallbackAllowMarshal: Serializer = {
  ...messagePackWithFallback,
  key: "message_pack_allow_marshal",
  fallback: allowMarshalFallback,
};

/** @internal */
export const SERIALIZERS: Record<Format, Serializer> = {
  marshal: marshalWithFallback,
  json: jsonWithFallback,
  json_allow_marshal: jsonWithFallbackAllowMarshal,
  message_pack: messagePackWithFallback,
  message_pack_allow_marshal: messagePackWithFallbackAllowMarshal,
};

/** @internal */
export const SerializerWithFallback = {
  SERIALIZERS,

  get(format: string): Serializer {
    const serializer = SERIALIZERS[format as Format];
    if (!serializer) throw new KeyError(`key not found: ${JSON.stringify(format)}`);
    return serializer;
  },
};
