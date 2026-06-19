// Cache serialization strategy (story: cache-serialization-marshal-vs-json).
//
// Rails serializes cache values with `Marshal.dump`/`Marshal.load`
// (cache/entry.rb:90,124, cache/coder.rb). Ruby Marshal is a wire format for
// Ruby objects; there is no Ruby runtime in trails and no Marshal-encoded store
// for us to interoperate with, so byte-for-byte Marshal compatibility is both
// infeasible and serves no consumer.
//
// We therefore converge on the dimension of Marshal that actually matters for a
// cache: round-trip *type fidelity*. Plain `JSON.stringify`/`JSON.parse` — what
// PR #3621 used as a placeholder — silently drops or mangles the values Marshal
// preserves: `undefined` (elided in objects, `null`-ified in arrays), `Date`
// (flattened to an ISO string), `bigint` (throws), and non-finite numbers
// (`NaN`/`±Infinity` → `null`). This codec is the trails Marshal-equivalent: a
// type-tagging JSON serializer that survives those cases.
//
// It is deliberately NOT Ruby-wire-compatible. Remaining cache-serialization
// convergence — the MessagePack serializer, `SerializerWithFallback`, and
// wiring the concrete stores (MemoryStore/FileStore/entry-record) through this
// Coder rather than their own ad-hoc JSON — is tracked as pending convergence
// by `activesupport-messagepack-port` and `cache-entry-remaining-methods`.

// Special values are encoded as a compact 1- or 2-element array whose head is a
// short sentinel code: `["~#d", 1750000000000]` for a Date, `["~#u"]` for
// undefined, etc. This keeps per-tag overhead to a handful of bytes (vs. the
// ~30 a `{ "__type__": …, "value": … }` object would repeat for every Date in
// a record). Because tags are arrays, plain objects never collide and pass
// through untouched; only a real array whose head is itself a sentinel string
// needs escaping (see ARRAY_ESCAPE below).
// entry.ts imports `coder` from here; `LazyEntry` extends `Entry` lazily (see
// lazyEntryClass) so this cyclic import is never dereferenced at module-eval.
import { Entry } from "./entry.js";

const PREFIX = "~#";
const UNDEF = "~#u";
const BIGINT = "~#b";
const DATE = "~#d";
const NUMBER = "~#n";
const ARRAY_ESCAPE = "~#a";

function looksTagged(head: unknown): head is string {
  return typeof head === "string" && head.startsWith(PREFIX);
}

function encode(value: unknown): unknown {
  if (value === undefined) return [UNDEF];
  if (value === null) return null;

  const type = typeof value;
  if (type === "bigint") return [BIGINT, (value as bigint).toString()];
  if (type === "number") {
    const n = value as number;
    if (Number.isNaN(n)) return [NUMBER, "NaN"];
    if (n === Infinity) return [NUMBER, "Infinity"];
    if (n === -Infinity) return [NUMBER, "-Infinity"];
    return n;
  }
  if (type !== "object") return value;

  // boundary: cache values are arbitrary JS objects; a real JS Date must be
  // preserved with full fidelity, so we tag it explicitly here.
  if (value instanceof Date) return [DATE, value.getTime()];

  if (Array.isArray(value)) {
    const encoded = value.map(encode);
    // A genuine array whose head encodes to a sentinel string would be misread
    // as a tag on the way back, so prefix it with the escape marker.
    return looksTagged(encoded[0]) ? [ARRAY_ESCAPE, ...encoded] : encoded;
  }

  const encoded: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    encoded[key] = encode((value as Record<string, unknown>)[key]);
  }
  return encoded;
}

function decode(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;

  if (Array.isArray(node)) {
    const head = node[0];
    if (looksTagged(head)) {
      switch (head) {
        case UNDEF:
          return undefined;
        case BIGINT:
          return BigInt(node[1] as string);
        case DATE:
          // boundary: restoring the JS Date tagged on the way out.
          return new Date(node[1] as number);
        case NUMBER: {
          const v = node[1] as string;
          return v === "NaN" ? NaN : v === "Infinity" ? Infinity : -Infinity;
        }
        case ARRAY_ESCAPE:
          return node.slice(1).map(decode);
      }
    }
    return node.map(decode);
  }

  const decoded: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    decoded[key] = decode((node as Record<string, unknown>)[key]);
  }
  return decoded;
}

/**
 * The trails Marshal-equivalent cache serializer. Mirrors the `dump`/`load`
 * surface of Rails' `Cache::Coder` while preserving JS type fidelity (Date,
 * undefined, bigint, NaN/±Infinity) that plain JSON would lose.
 *
 * @internal
 */
export const coder = {
  dump(value: unknown): string {
    return JSON.stringify(encode(value));
  },
  load(dumped: string): unknown {
    return decode(JSON.parse(dumped));
  },
};

/** Serializer surface a {@link Coder} wraps. @internal */
export interface CoderSerializer {
  dump(value: unknown): string;
  load(dumped: string): unknown;
  dumpCompressed?(entry: Entry, threshold: number): string;
}

/** @internal */
export interface CoderCompressor {
  deflate(value: string): string;
  inflate(value: string): string;
}

// Rails' Coder framing (coder.rb): a signature prefix lets `load` tell framed
// payloads from a bare legacy dump; the type byte flags serializer + compression
// and the header carries expires_at/version. Rails packs a fixed-width binary
// header; trails has no Ruby wire to interop with, so we frame with a JSON header
// (control-char-free) and a NUL separator — the first NUL after the signature.
const SIGNATURE = "\x00\x11";
const HEADER_SEP = "\x00";
const OBJECT_DUMP_TYPE = 0x01;
const STRING_TYPE = 0x02;
const COMPRESSED_FLAG = 0x80;

// Rails stores UTF-8/BINARY/US-ASCII strings as the payload verbatim (skipping
// the serializer); JS strings carry no encoding tag, so trails collapses all of
// them onto one string fast path whose deserializer is the identity.
const stringDeserializer: CoderSerializer = {
  dump: (value) => value as string,
  load: (dumped) => dumped,
};

type LazyEntryOptions = { version: string | null; expiresAt: number | null };
let lazyEntry:
  | (new (s: CoderSerializer, c: CoderCompressor | null, p: string, o: LazyEntryOptions) => Entry)
  | undefined;

// Rails' Coder::LazyEntry: an Entry whose value stays serialized (and
// compressed) until first read. Defined lazily to keep the cyclic Entry import
// safe (see the import note above).
function lazyEntryClass(): NonNullable<typeof lazyEntry> {
  return (lazyEntry ??= class LazyEntry extends Entry {
    private _lazySerializer: CoderSerializer;
    private _lazyCompressor: CoderCompressor | null;
    private _resolved = false;

    constructor(
      serializer: CoderSerializer,
      compressor: CoderCompressor | null,
      payload: string,
      options: LazyEntryOptions,
    ) {
      super(payload, options);
      this._lazySerializer = serializer;
      this._lazyCompressor = compressor;
    }

    override get value(): unknown {
      if (!this._resolved) {
        const raw = this._lazyCompressor
          ? this._lazyCompressor.inflate(this._value as string)
          : (this._value as string);
        this._value = this._lazySerializer.load(raw);
        this._resolved = true;
      }
      return this._value;
    }
  });
}

/**
 * The trails equivalent of Rails' `Cache::Coder`: wraps a serializer +
 * compressor, framing entries so `load` can lazily deserialize/decompress and
 * fall back to a bare serializer dump. Framing is not Ruby-wire-compatible.
 * @internal
 */
export class Coder {
  private legacySerializer: boolean;

  constructor(
    private serializer: CoderSerializer,
    private compressor: CoderCompressor | null,
    options: { legacySerializer?: boolean } = {},
  ) {
    this.legacySerializer = options.legacySerializer ?? false;
  }

  dump(entry: Entry): string {
    if (this.legacySerializer) return this.serializer.dump(entry);
    return this.dumpCompressed(entry, Infinity);
  }

  dumpCompressed(entry: Entry, threshold: number): string {
    if (this.legacySerializer) return this.serializer.dumpCompressed!(entry, threshold);

    const value = entry.value;
    let type = this.typeForString(value);
    let payload: string;
    if (type !== undefined) {
      payload = value as string;
    } else {
      type = OBJECT_DUMP_TYPE;
      payload = this.serializer.dump(value);
    }

    const compressed = this.tryCompress(payload, threshold);
    if (compressed !== undefined) {
      payload = compressed;
      type |= COMPRESSED_FLAG;
    }

    const version = entry.version === null ? null : this.dumpVersion(entry.version);
    const header = JSON.stringify([type, entry.expiresAt ?? -1, version]);
    return SIGNATURE + header + HEADER_SEP + payload;
  }

  load(dumped: unknown): unknown {
    if (!this.isSignature(dumped)) return this.serializer.load(dumped as string);

    const rest = dumped.slice(SIGNATURE.length);
    const sep = rest.indexOf(HEADER_SEP);
    const [type, rawExpiresAt, rawVersion] = JSON.parse(rest.slice(0, sep)) as [
      number,
      number,
      string | null,
    ];
    const payload = rest.slice(sep + 1);

    const expiresAt = rawExpiresAt < 0 ? null : rawExpiresAt;
    const version = rawVersion === null ? null : this.loadVersion(rawVersion);
    const compressor = type & COMPRESSED_FLAG ? this.compressor : null;
    const serializer =
      (type & ~COMPRESSED_FLAG) === STRING_TYPE ? stringDeserializer : this.serializer;

    return new (lazyEntryClass())(serializer, compressor, payload, { version, expiresAt });
  }

  private isSignature(dumped: unknown): dumped is string {
    return typeof dumped === "string" && dumped.startsWith(SIGNATURE);
  }

  // Rails keys a String's encoding (UTF-8/BINARY/US-ASCII) to a type byte so the
  // value is stored as the payload verbatim. JS strings carry no encoding tag,
  // so every string takes the single fast path; anything else returns undefined
  // and falls through to the serializer.
  private typeForString(value: unknown): number | undefined {
    return typeof value === "string" ? STRING_TYPE : undefined;
  }

  // Rails packs the version, Marshal-encoding non-UTF-8 / Marshal-signature
  // strings. trails carries the version as a plain string in the JSON header, so
  // there is nothing to pack — the analog is the identity, and Rails'
  // Marshal-version branch is N/A here (no Ruby wire).
  private dumpVersion(version: string): string {
    return version;
  }

  private loadVersion(dumpedVersion: string): string {
    return dumpedVersion;
  }

  private tryCompress(payload: string, threshold: number): string | undefined {
    if (this.compressor && Buffer.byteLength(payload) >= threshold) {
      const compressed = this.compressor.deflate(payload);
      if (compressed.length < Buffer.byteLength(payload)) return compressed;
    }
    return undefined;
  }
}
