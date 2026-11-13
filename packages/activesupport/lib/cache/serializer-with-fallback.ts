import {
  b,
  byteslice,
  fetch,
  Hash,
  LoadError,
  Marshal,
  ArgumentError,
  rbInspect,
  rbModToS,
  rbObjClass,
  rbStrPlus,
  rbStrStartWith,
} from "@blazetrails/ruby-compat";

import { extend, include } from "@blazetrails/ruby-compat/include";
import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";
import { Store } from "./store.js";
import { deflate, inflate } from "../gzip.js";
import { ActiveSupport } from "../namespaces.js";

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
    if (MessagePackWithFallback.dumped(dumped)) {
      return MessagePackWithFallback._load(dumped);
    } else if (Marshal71WithFallback.dumped(dumped)) {
      return Marshal71WithFallback._load(dumped);
    } else if (Marshal70WithFallback.dumped(dumped)) {
      return Marshal70WithFallback._load(dumped);
    } else {
      Store.logger?.warn(
        `Unrecognized payload prefix ${rbInspect(byteslice(b(dumped), 0))}; deserializing as nil`,
      );
      return null;
    }
  } else if (PassthroughWithFallback.dumped(dumped as Entry)) {
    return PassthroughWithFallback._load(dumped as Entry);
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
    return Marshal.load(payload);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    throw new DeserializationError(error.message);
  }
}

/** @internal */
export const SerializerWithFallback = { load, marshalLoad } as {
  load(dumped: unknown): unknown;
  marshalLoad(payload: string | Uint8Array): unknown;
  SERIALIZERS: Hash<string, Serializer>;
  get(format: string): Serializer;
  PassthroughWithFallback: Serializer;
  Marshal70WithFallback: Serializer;
  Marshal71WithFallback: Serializer;
  MessagePackWithFallback: Serializer;
};

const MARK_UNCOMPRESSED = "\x00";
const MARK_COMPRESSED = "\x01";

const MARSHAL_SIGNATURE = "\x04\x08";

export const PassthroughWithFallback = {
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
include(PassthroughWithFallback, SerializerWithFallback);
extend(PassthroughWithFallback, PassthroughWithFallback);
SerializerWithFallback.PassthroughWithFallback = PassthroughWithFallback;

export const Marshal70WithFallback = {
  dump(entry: Entry | unknown): Uint8Array {
    return rbStrPlus(
      b(MARK_UNCOMPRESSED),
      Marshal.dump((entry as Entry).pack(), -1, true),
    ) as Uint8Array;
  },

  dumpCompressed(entry: Entry, threshold: number): Uint8Array {
    const dumped = Marshal.dump(entry.pack(), -1, true);

    if (dumped.length >= threshold) {
      const compressed = deflate(dumped);
      if (compressed.length < dumped.length) {
        return rbStrPlus(b(MARK_COMPRESSED), compressed) as Uint8Array;
      }
    }

    return rbStrPlus(b(MARK_UNCOMPRESSED), dumped) as Uint8Array;
  },

  _load(this: Serializer, marked: string | Uint8Array | Entry): Entry {
    let dumped = b(marked as string | Uint8Array).subarray(1);
    if (rbStrStartWith(marked as string | Uint8Array, MARK_COMPRESSED)) dumped = inflate(dumped);
    return Entry.unpack(this.marshalLoad(dumped) as unknown[]);
  },

  dumped(dumped: string | Uint8Array | Entry): boolean {
    return (
      rbStrStartWith(dumped as string | Uint8Array, MARK_UNCOMPRESSED) ||
      rbStrStartWith(dumped as string | Uint8Array, MARK_COMPRESSED)
    );
  },
} as Serializer;
include(Marshal70WithFallback, SerializerWithFallback);
extend(Marshal70WithFallback, Marshal70WithFallback);
SerializerWithFallback.Marshal70WithFallback = Marshal70WithFallback;

export const Marshal71WithFallback = {
  dump(value: Entry | unknown): Uint8Array {
    return Marshal.dump(value, -1, true);
  },

  _load(this: Serializer, dumped: string | Uint8Array | Entry): unknown {
    return this.marshalLoad(dumped as string | Uint8Array);
  },

  dumped(dumped: string | Uint8Array | Entry): boolean {
    return rbStrStartWith(dumped as string | Uint8Array, MARSHAL_SIGNATURE);
  },
} as Serializer;
include(Marshal71WithFallback, SerializerWithFallback);
extend(Marshal71WithFallback, Marshal71WithFallback);
SerializerWithFallback.Marshal71WithFallback = Marshal71WithFallback;

export const MessagePackWithFallback = {
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

  /** @missingRailsCall silence_warnings — PERMANENT */
  isAvailable(): boolean {
    return ActiveSupport.MessagePack !== undefined;
  },
} as Serializer;
include(MessagePackWithFallback, SerializerWithFallback);
extend(MessagePackWithFallback, MessagePackWithFallback);
SerializerWithFallback.MessagePackWithFallback = MessagePackWithFallback;

const SERIALIZERS = new Hash<string, Serializer>()
  .set("passthrough", PassthroughWithFallback)
  .set("marshal_7_0", Marshal70WithFallback)
  .set("marshal_7_1", Marshal71WithFallback)
  .set("message_pack", MessagePackWithFallback);

SerializerWithFallback.SERIALIZERS = SERIALIZERS;
extend(SerializerWithFallback, {
  /** @missingRailsCall require — PERMANENT */
  get(format: string): Serializer {
    if (format.includes("message_pack") && ActiveSupport.MessagePack === undefined) {
      throw new LoadError("cannot load such file -- active_support/message_pack");
    }

    return fetch(SERIALIZERS, format) as Serializer;
  },
});
