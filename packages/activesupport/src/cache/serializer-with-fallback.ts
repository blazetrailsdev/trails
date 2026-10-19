import {
  byteslice,
  fetch,
  Hash,
  LoadError,
  rbInspect,
  rbModToS,
  rbObjClass,
} from "@blazetrails/ruby-compat";

import { Module, extend, rbModConstSet } from "@blazetrails/ruby-compat/include";
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
 * answers JSON text, so its bytes are taken here — one character per byte —
 * rather than leaving the payload a decoded String the byte-exact pair cannot
 * round-trip.
 *
 * @internal
 */
function toBinary(text: string): string {
  return Buffer.from(text, "utf8").toString("latin1");
}

/** @internal */
function fromBinary(binary: string): string {
  return Buffer.from(binary, "latin1").toString("utf8");
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export interface Serializer {
  dump(entryOrValue: Entry | unknown): string | Entry;
  dumpCompressed?(entry: Entry, threshold: number): string | Entry;
  _load(dumped: string | Entry): unknown;
  dumped(dumped: string | Entry): boolean;
  load(dumped: unknown): unknown;
  /** @internal */
  marshalLoad(payload: string): unknown;
  /** @internal */
  isAvailable?(): boolean;
}

/** @internal */
export const SerializerWithFallback = new Module().include({
  load(dumped: unknown): unknown {
    if (typeof dumped === "string") {
      if (messagePackWithFallback.dumped(dumped)) {
        return messagePackWithFallback._load(dumped);
      } else if (marshal71WithFallback.dumped(dumped)) {
        return marshal71WithFallback._load(dumped);
      } else if (marshal70WithFallback.dumped(dumped)) {
        return marshal70WithFallback._load(dumped);
      } else {
        Store.logger?.warn(
          `Unrecognized payload prefix ${rbInspect(byteslice(dumped, 0))}; deserializing as nil`,
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
  },

  /** @internal */
  marshalLoad(payload: string): unknown {
    try {
      return coder.load(payload);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new DeserializationError(error.message);
    }
  },
}) as Module & {
  load(dumped: unknown): unknown;
  marshalLoad(payload: string): unknown;
  SERIALIZERS: Hash<string, Serializer>;
  get(format: string): Serializer;
};

const MARK_UNCOMPRESSED = "\x00";
const MARK_COMPRESSED = "\x01";

const MARSHAL_SIGNATURE = "\x04\x08";

const passthroughWithFallback = new Module().include(SerializerWithFallback).include({
  dump(entry: Entry | unknown): Entry {
    return entry as Entry;
  },

  dumpCompressed(entry: Entry, threshold: number): Entry {
    return entry.compressed(threshold);
  },

  _load(entry: string | Entry): Entry {
    return entry as Entry;
  },

  dumped(dumped: string | Entry): boolean {
    return dumped instanceof Entry;
  },
}) as Module & Serializer;
extend(passthroughWithFallback, passthroughWithFallback);

const marshal70WithFallback = new Module().include(SerializerWithFallback).include({
  dump(entry: Entry | unknown): string {
    return MARK_UNCOMPRESSED + toBinary(coder.dump((entry as Entry).pack()));
  },

  dumpCompressed(entry: Entry, threshold: number): string {
    const serialized = coder.dump(entry.pack());
    const serializedByteSize = Buffer.byteLength(serialized);
    if (serializedByteSize >= threshold) {
      const compressed = deflate(serialized);
      if (compressed.length < serializedByteSize) {
        return MARK_COMPRESSED + compressed;
      }
    }
    return MARK_UNCOMPRESSED + toBinary(serialized);
  },

  _load(this: Serializer, marked: string | Entry): Entry {
    const s = marked as string;
    const compressed = s[0] === MARK_COMPRESSED;
    const rest = s.slice(1);
    const payload = compressed ? inflate(rest) : fromBinary(rest);
    return Entry.unpack(this.marshalLoad(payload) as unknown[]);
  },

  dumped(dumped: string | Entry): boolean {
    return (
      (dumped as string).startsWith(MARK_UNCOMPRESSED) ||
      (dumped as string).startsWith(MARK_COMPRESSED)
    );
  },
}) as Module & Serializer;
extend(marshal70WithFallback, marshal70WithFallback);

const marshal71WithFallback = new Module().include(SerializerWithFallback).include({
  dump(value: Entry | unknown): string {
    return MARSHAL_SIGNATURE + toBinary(coder.dump(value));
  },

  _load(this: Serializer, dumped: string | Entry): unknown {
    return this.marshalLoad(fromBinary((dumped as string).slice(MARSHAL_SIGNATURE.length)));
  },

  dumped(dumped: string | Entry): boolean {
    return (dumped as string).startsWith(MARSHAL_SIGNATURE);
  },
}) as Module & Serializer;
extend(marshal71WithFallback, marshal71WithFallback);

const messagePackWithFallback = new Module().include(SerializerWithFallback).include({
  dump(value: Entry | unknown): string {
    return Buffer.from(ActiveSupport.MessagePack!.CacheSerializer.dump(value)).toString("latin1");
  },

  _load(dumped: string | Entry): unknown {
    const result = ActiveSupport.MessagePack!.CacheSerializer.load(
      Buffer.from(dumped as string, "latin1"),
    );
    return result === undefined ? null : result;
  },

  dumped(this: Serializer, dumped: string | Entry): boolean {
    return (
      this.isAvailable!() &&
      ActiveSupport.MessagePack!.isSignature(Buffer.from(dumped as string, "latin1"))
    );
  },

  /** @missingRailsCall require — PERMANENT */
  isAvailable(): boolean {
    return ActiveSupport.MessagePack !== undefined;
  },
}) as Module & Serializer;
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
