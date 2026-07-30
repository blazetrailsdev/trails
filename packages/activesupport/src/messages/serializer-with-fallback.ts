/**
 * Mirrors Rails `ActiveSupport::Messages::SerializerWithFallback`
 * (messages/serializer_with_fallback.rb).
 *
 * Five serializers (marshal, json, json_allow_marshal, message_pack,
 * message_pack_allow_marshal) that share a `load` which sniffs the dumped
 * payload's format and, when it isn't the serializer's own, deserializes it
 * through the matching serializer while instrumenting
 * `message_serializer_fallback.active_support`.
 *
 * trails has no Ruby Marshal runtime, so the `:marshal` format is backed by the
 * fidelity `coder` (`cache/coder.ts`) — the same trails Marshal-equivalent the
 * cache serializers use — behind Rails' `\x04\x08` Marshal signature so
 * cross-format detection still works. `MessagePackWithFallback#available?` is
 * likewise constant-true: message_pack is a bundled dep here, with no dynamic
 * require to rescue.
 */

import { Notifications } from "../notifications.js";
import { ActiveSupportJSON } from "../json.js";
import { coder } from "../cache/coder.js";
import { MessagePack } from "../message-pack/index.js";

/** Format names keyed in {@link SERIALIZERS}. @internal */
export type Format =
  | "marshal"
  | "json"
  | "json_allow_marshal"
  | "message_pack"
  | "message_pack_allow_marshal";

/**
 * Mirror of Ruby's `RuntimeError` — what Rails' bare
 * `raise "Unsupported serialization format"` produces. @internal
 */
export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

/** Thrown by `SerializerWithFallback.get` on an unknown format. @internal */
export class KeyError extends Error {
  constructor(key: string) {
    super(`key not found: ${JSON.stringify(key)}`);
    this.name = "KeyError";
  }
}

/**
 * Stand-in for Ruby's `throw`/`catch` — the non-local exit `Codec` and
 * `Metadata` use for `:invalid_message_format`, `:invalid_message_serialization`,
 * and `:invalid_message_content`. It lives in this leaf module rather than
 * `codec.ts` so `metadata.ts` — which `Codec` extends — can throw it without an
 * import cycle back through `codec.ts`. @internal
 */
export class Thrown extends Error {
  constructor(
    readonly tag: string,
    readonly value: unknown,
  ) {
    super(String(tag));
    this.name = "Thrown";
  }
}

/** The surface every serializer in {@link SERIALIZERS} exposes. @internal */
export interface Serializer {
  /**
   * The serializer's own key in {@link SERIALIZERS}. Rails recovers this with
   * `SERIALIZERS.key(self)`; the `*_allow_marshal` variants inherit `format`
   * from the serializer they wrap, so the key is a separate field here.
   */
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

/** Mirrors Rails `ActiveSupport::Messages::SerializerWithFallback`. @internal */
export const SerializerWithFallback = {
  SERIALIZERS,

  /** Mirrors Rails' `SerializerWithFallback[format]`. */
  get(format: string): Serializer {
    const serializer = SERIALIZERS[format as Format];
    if (!serializer) throw new KeyError(format);
    return serializer;
  },
};
