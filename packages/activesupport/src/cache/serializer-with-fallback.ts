import {
  b,
  byteslice,
  fetch,
  Hash,
  LoadError,
  rbInspect,
  rbModToS,
  rbObjClass,
  rbStrPlus,
  rbStrStartWith,
} from "@blazetrails/ruby-compat";

import { extend, include, rbModConstSet } from "@blazetrails/ruby-compat/include";
import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";
import { Store } from "./store.js";
import { coder } from "./coder.js";
import { deflate, inflate } from "../gzip.js";
import { ActiveSupport } from "../namespaces.js";

/**
 * `Marshal.dump` answers an ASCII-8BIT String — its buffer is
 * `rb_str_buf_new(0)` (`vendor/ruby/v3.3.11/marshal.c:1241`), and it sends `binmode`
 * to an IO port (`marshal.c:1246`) —
 * so a serialized cache payload is BYTES: what `File.atomic_write` writes and
 * `File.binread` reads back at `file_store.rb:124,127`. trails' Marshal stand-in
 * answers JSON text, so its bytes are taken here, an ASCII-8BIT `Uint8Array`,
 * rather than leaving the payload a decoded String the byte-exact pair cannot
 * round-trip.
 *
 * @internal
 */
function toBinary(text: string): Uint8Array {
  return b(text);
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export interface Serializer {
  dump(entryOrValue: Entry | unknown): Uint8Array | Entry;
  dumpCompressed?(entry: Entry, threshold: number): Uint8Array | Entry;
  _load(dumped: string | Uint8Array | Entry): unknown;
  dumped(dumped: string | Uint8Array | Entry): boolean;
  load(dumped: unknown): unknown;
  /** @internal */
  marshalLoad(payload: string | Uint8Array): unknown;
  /** @internal */
  isAvailable?(): boolean;
}

function load(dumped: unknown): unknown {
  if (typeof dumped === "string" || dumped instanceof Uint8Array) {
    if (messagePackWithFallback.dumped(dumped)) {
      return messagePackWithFallback._load(dumped);
    } else if (marshal71WithFallback.dumped(dumped)) {
      return marshal71WithFallback._load(dumped);
    } else if (marshal70WithFallback.dumped(dumped)) {
      return marshal70WithFallback._load(dumped);
    } else {
      Store.logger?.warn(
        `Unrecognized payload prefix ${rbInspect(byteslice(b(dumped), 0))}; deserializing as nil`,
      );
      return null;
    }
  } else if (passthroughWithFallback.dumped(dumped as Entry)) {
    return passthroughWithFallback._load(dumped as Entry);
  } else {
    Store.logger?.warn(
      `Unrecognized payload class ${rbModToS(rbObjClass(dumped))}; deserializing as nil`,
    );
    return null;
  }
}

/** @internal */
function marshalLoad(payload: string | Uint8Array): unknown {
  try {
    return coder.load(payload);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new DeserializationError(error.message);
  }
}

/** @internal */
export const SerializerWithFallback = { load, marshalLoad } as {
  load(dumped: unknown): unknown;
  marshalLoad(payload: string | Uint8Array): unknown;
  SERIALIZERS: Hash<string, Serializer>;
  get(format: string): Serializer;
};

const MARK_UNCOMPRESSED = "\x00";
const MARK_COMPRESSED = "\x01";

const MARSHAL_SIGNATURE = "\x04\x08";

const passthroughWithFallback = {
  dump(entry: Entry | unknown): Entry {
    return entry as Entry;
  },

  dumpCompressed(entry: Entry, threshold: number): Entry {
    return entry.compressed(threshold);
  },

  _load(entry: string | Uint8Array | Entry): Entry {
    return entry as Entry;
  },

  dumped(dumped: string | Uint8Array | Entry): boolean {
    return dumped instanceof Entry;
  },
} as Serializer;
include(passthroughWithFallback, SerializerWithFallback);
extend(passthroughWithFallback, passthroughWithFallback);

const marshal70WithFallback = {
  dump(entry: Entry | unknown): Uint8Array {
    return rbStrPlus(
      b(MARK_UNCOMPRESSED),
      toBinary(coder.dump((entry as Entry).pack())),
    ) as Uint8Array;
  },

  dumpCompressed(entry: Entry, threshold: number): Uint8Array {
    const serialized = toBinary(coder.dump(entry.pack()));
    if (serialized.length >= threshold) {
      const compressed = deflate(serialized);
      if (compressed.length < serialized.length) {
        return rbStrPlus(b(MARK_COMPRESSED), compressed) as Uint8Array;
      }
    }
    return rbStrPlus(b(MARK_UNCOMPRESSED), serialized) as Uint8Array;
  },

  _load(this: Serializer, marked: string | Uint8Array | Entry): Entry {
    const s = b(marked as string | Uint8Array);
    const compressed = rbStrStartWith(s, MARK_COMPRESSED);
    const rest = s.subarray(1);
    const payload = compressed ? inflate(rest) : rest;
    return Entry.unpack(this.marshalLoad(payload) as unknown[]);
  },

  dumped(dumped: string | Uint8Array | Entry): boolean {
    return (
      rbStrStartWith(dumped as string | Uint8Array, MARK_UNCOMPRESSED) ||
      rbStrStartWith(dumped as string | Uint8Array, MARK_COMPRESSED)
    );
  },
} as Serializer;
include(marshal70WithFallback, SerializerWithFallback);
extend(marshal70WithFallback, marshal70WithFallback);

const marshal71WithFallback = {
  dump(value: Entry | unknown): Uint8Array {
    return rbStrPlus(b(MARSHAL_SIGNATURE), toBinary(coder.dump(value))) as Uint8Array;
  },

  _load(this: Serializer, dumped: string | Uint8Array | Entry): unknown {
    return this.marshalLoad(b(dumped as string | Uint8Array).subarray(MARSHAL_SIGNATURE.length));
  },

  dumped(dumped: string | Uint8Array | Entry): boolean {
    return rbStrStartWith(dumped as string | Uint8Array, MARSHAL_SIGNATURE);
  },
} as Serializer;
include(marshal71WithFallback, SerializerWithFallback);
extend(marshal71WithFallback, marshal71WithFallback);

const messagePackWithFallback = {
  dump(value: Entry | unknown): Uint8Array {
    return ActiveSupport.MessagePack!.CacheSerializer.dump(value);
  },

  _load(dumped: string | Uint8Array | Entry): unknown {
    const result = ActiveSupport.MessagePack!.CacheSerializer.load(dumped as string | Uint8Array);
    return result === undefined ? null : result;
  },

  dumped(this: Serializer, dumped: string | Uint8Array | Entry): boolean {
    return (
      this.isAvailable!() && ActiveSupport.MessagePack!.isSignature(dumped as string | Uint8Array)
    );
  },

  /** @missingRailsCall require — PERMANENT */
  isAvailable(): boolean {
    return ActiveSupport.MessagePack !== undefined;
  },
} as Serializer;
include(messagePackWithFallback, SerializerWithFallback);
extend(messagePackWithFallback, messagePackWithFallback);

const SERIALIZERS = new Hash<string, Serializer>()
  .set("passthrough", passthroughWithFallback)
  .set("marshal_7_0", marshal70WithFallback)
  .set("marshal_7_1", marshal71WithFallback)
  .set("message_pack", messagePackWithFallback);

rbModConstSet(SerializerWithFallback, "SERIALIZERS", SERIALIZERS);
extend(SerializerWithFallback, {
  /** @missingRailsCall require — PERMANENT */
  get(format: string): Serializer {
    if (format.includes("message_pack") && ActiveSupport.MessagePack === undefined) {
      throw new LoadError("cannot load such file -- active_support/message_pack");
    }

    return fetch(SERIALIZERS, format) as Serializer;
  },
});
