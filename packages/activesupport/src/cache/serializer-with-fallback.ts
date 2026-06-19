/**
 * Mirrors Rails `ActiveSupport::Cache::SerializerWithFallback`
 * (cache/serializer_with_fallback.rb).
 *
 * Provides four serializers (passthrough, marshal_7_0, marshal_7_1,
 * message_pack) that share a prefix-dispatch `load` so any serializer can read
 * payloads written by any other.
 *
 * trails has no Ruby Marshal runtime; marshal_7_0 and marshal_7_1 are backed by
 * the fidelity `coder` (`coder.ts`) but keep Rails' wire-prefix framing so
 * cross-format dispatch still works.
 */

import { Entry } from "./entry.js";
import { Store } from "./index.js";
import { coder } from "./coder.js";
import { deflate, inflate } from "../gzip.js";
import { CacheSerializer } from "../message-pack/cache-serializer.js";

// Singleton used by message_pack serializer.
const messagePack = new CacheSerializer();

/** Thrown by `SerializerWithFallback.get` on unknown format. @internal */
export class KeyError extends Error {
  constructor(key: string) {
    super(`key not found: ${JSON.stringify(key)}`);
    this.name = "KeyError";
  }
}

/** Interface shared by all four serializers. @internal */
export interface Serializer {
  dump(entryOrValue: Entry | unknown): string | Entry;
  dumpCompressed?(entry: Entry, threshold: number): string | Entry;
  _load(dumped: string | Entry): unknown;
  dumped(dumped: unknown): boolean;
}

// Rails marshal_7_0 mark bytes (\x00 uncompressed, \x01 compressed).
const MARK_UNCOMPRESSED = "\x00";
const MARK_COMPRESSED = "\x01";

// Rails marshal_7_1 signature (\x04\x08 — the Ruby Marshal magic bytes).
const MARSHAL_SIGNATURE = "\x04\x08";

const passthroughWithFallback: Serializer = {
  dump(entry: Entry | unknown): Entry {
    return entry as Entry;
  },

  dumpCompressed(entry: Entry, threshold: number): Entry {
    return entry.compressed(threshold);
  },

  _load(entry: string | Entry): Entry {
    return entry as Entry;
  },

  dumped(dumped: unknown): boolean {
    return dumped instanceof Entry;
  },
};

const marshal70WithFallback: Serializer = {
  dump(entry: Entry | unknown): string {
    return MARK_UNCOMPRESSED + coder.dump((entry as Entry).pack());
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
    return MARK_UNCOMPRESSED + serialized;
  },

  _load(marked: string | Entry): Entry {
    const s = marked as string;
    const compressed = s[0] === MARK_COMPRESSED;
    const rest = s.slice(1);
    const payload = compressed ? inflate(rest) : rest;
    return Entry.unpack(coder.load(payload) as unknown[]);
  },

  dumped(dumped: unknown): boolean {
    return (
      typeof dumped === "string" &&
      (dumped[0] === MARK_UNCOMPRESSED || dumped[0] === MARK_COMPRESSED)
    );
  },
};

const marshal71WithFallback: Serializer = {
  dump(value: Entry | unknown): string {
    return MARSHAL_SIGNATURE + coder.dump(value);
  },

  _load(dumped: string | Entry): unknown {
    return coder.load((dumped as string).slice(MARSHAL_SIGNATURE.length));
  },

  dumped(dumped: unknown): boolean {
    return typeof dumped === "string" && dumped.startsWith(MARSHAL_SIGNATURE);
  },
};

const messagePackWithFallback: Serializer = {
  dump(value: Entry | unknown): string {
    return messagePack.dump(value).toString("latin1");
  },

  _load(dumped: string | Entry): unknown {
    const result = messagePack.load(Buffer.from(dumped as string, "latin1"));
    // CacheSerializer swallows MissingClassError and returns undefined (cache miss);
    // Rails returns nil, so convert undefined → null here.
    return result === undefined ? null : result;
  },

  dumped(dumped: unknown): boolean {
    return (
      typeof dumped === "string" && dumped.charCodeAt(0) === 0xcc && dumped.charCodeAt(1) === 0x80
    );
  },
};

const SERIALIZERS: Record<string, Serializer> = {
  passthrough: passthroughWithFallback,
  marshal_7_0: marshal70WithFallback,
  marshal_7_1: marshal71WithFallback,
  message_pack: messagePackWithFallback,
};

function sharedLoad(dumped: unknown): unknown {
  if (typeof dumped === "string") {
    if (messagePackWithFallback.dumped(dumped)) {
      return messagePackWithFallback._load(dumped);
    } else if (marshal71WithFallback.dumped(dumped)) {
      return marshal71WithFallback._load(dumped);
    } else if (marshal70WithFallback.dumped(dumped)) {
      return marshal70WithFallback._load(dumped);
    } else {
      Store.logger?.warn(
        `Unrecognized payload prefix ${JSON.stringify(dumped[0])}; deserializing as nil`,
      );
      return null;
    }
  } else if (passthroughWithFallback.dumped(dumped)) {
    return passthroughWithFallback._load(dumped as Entry);
  } else {
    Store.logger?.warn(`Unrecognized payload class ${typeof dumped}; deserializing as nil`);
    return null;
  }
}

/** Mirrors Rails `ActiveSupport::Cache::SerializerWithFallback`. @internal */
export const SerializerWithFallback = {
  SERIALIZERS,

  get(format: string): Serializer & { load(dumped: unknown): unknown } {
    const s = SERIALIZERS[format];
    if (!s) throw new KeyError(format);
    return { ...s, load: sharedLoad };
  },
};
