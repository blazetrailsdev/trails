import { Temporal } from "@blazetrails/date";
import {
  Encoding,
  Marshal,
  Range,
  b,
  forceEncoding,
  pack,
  rbObjEncoding,
  byteslice,
  rbStrPlus,
  rbStrStartWith,
  unpack1,
} from "@blazetrails/ruby-compat";
import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";

const PREFIX = "~#";
const UNDEF = "~#u";
const BIGINT = "~#b";
const DATE = "~#d";
const INSTANT = "~#i";
const NUMBER = "~#n";
const ARRAY_ESCAPE = "~#a";
const BYTES = "~#B";

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
  if (value instanceof Date) return [DATE, value.getTime()];

  // boundary: Ruby Marshal round-trips a Time, and `Temporal.Instant` is the
  if (value instanceof Temporal.Instant) return [INSTANT, value.toString()];

  if (value instanceof Uint8Array) return [BYTES, Array.from(value)];

  if (Array.isArray(value)) {
    const encoded = value.map(encode);
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
        case INSTANT:
          return Temporal.Instant.from(node[1] as string);
        case NUMBER: {
          const v = node[1] as string;
          return v === "NaN" ? NaN : v === "Infinity" ? Infinity : -Infinity;
        }
        case ARRAY_ESCAPE:
          return node.slice(1).map(decode);
        case BYTES:
          return Uint8Array.from(node[1] as number[]);
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

const CONTROL_CHAR_ESCAPE = /\\u00[01][0-9a-f]/g;

function unescapeControlChars(json: string): string {
  return json.replace(CONTROL_CHAR_ESCAPE, (escape) =>
    String.fromCharCode(parseInt(escape.slice(2), 16)),
  );
}

function escapeControlChars(dumped: string): string {
  let escaped = "";
  for (const char of dumped) {
    const code = char.charCodeAt(0);
    escaped += code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return escaped;
}

/** @internal */
export const coder = {
  dump(value: unknown): string {
    return unescapeControlChars(JSON.stringify(encode(value)));
  },
  load(dumped: string | Uint8Array): unknown {
    const text = typeof dumped === "string" ? dumped : new TextDecoder().decode(dumped);
    return decode(JSON.parse(escapeControlChars(text)));
  },
};

/** @internal */
export interface CoderSerializer {
  dump(value: unknown): string | Uint8Array;
  load(dumped: string | Uint8Array): unknown;
  dumpCompressed?(entry: Entry, threshold: number): string | Uint8Array;
}

/** @internal */
export interface CoderCompressor {
  deflate(value: string | Uint8Array): string | Uint8Array;
  inflate(value: string | Uint8Array): string | Uint8Array;
}

const SIGNATURE = b("\x00\x11");

const OBJECT_DUMP_TYPE = 0x01;

const STRING_ENCODINGS = new Map<number, string>([
  [0x02, "UTF-8"],
  [0x03, "BINARY"],
  [0x04, "US-ASCII"],
]);

const COMPRESSED_FLAG = 0x80;

const PACKED_TEMPLATE = "CEl<";
const PACKED_TYPE_TEMPLATE = `@${SIGNATURE.length}C`;
const PACKED_EXPIRES_AT_TEMPLATE = `@${pack([0], PACKED_TYPE_TEMPLATE).length}E`;
const PACKED_VERSION_LENGTH_TEMPLATE = `@${pack([0], PACKED_EXPIRES_AT_TEMPLATE).length}l<`;
const PACKED_VERSION_INDEX = pack([0], PACKED_VERSION_LENGTH_TEMPLATE).length;

const MARSHAL_SIGNATURE = b("\x04\x08");

class StringDeserializer implements CoderSerializer {
  static toString(): string {
    return "ActiveSupport::Cache::Coder::StringDeserializer";
  }

  constructor(private encoding: string) {}

  dump(value: unknown): string {
    return value as string;
  }

  load(payload: string | Uint8Array): string | Uint8Array {
    return forceEncoding(payload, this.encoding);
  }
}

const STRING_DESERIALIZERS = new Map(
  [...STRING_ENCODINGS].map(([type, encoding]) => [type, new StringDeserializer(encoding)]),
);

type LazyEntryOptions = { version: string | Uint8Array | null; expiresAt: number | null };
let lazyEntry:
  | (new (
      s: CoderSerializer,
      c: CoderCompressor | null,
      p: string | Uint8Array,
      o: LazyEntryOptions,
    ) => Entry)
  | undefined;

function lazyEntryClass(): NonNullable<typeof lazyEntry> {
  return (lazyEntry ??= class LazyEntry extends Entry {
    private _lazySerializer: CoderSerializer;
    private _lazyCompressor: CoderCompressor | null;
    private _resolved = false;

    constructor(
      serializer: CoderSerializer,
      compressor: CoderCompressor | null,
      payload: string | Uint8Array,
      options: LazyEntryOptions,
    ) {
      super(payload, options);
      this._lazySerializer = serializer;
      this._lazyCompressor = compressor;
    }

    override get value(): unknown {
      if (!this._resolved) {
        const raw = this._lazyCompressor
          ? this._lazyCompressor.inflate(this._value as string | Uint8Array)
          : (this._value as string | Uint8Array);
        this._value = this._lazySerializer.load(raw);
        this._resolved = true;
      }
      return this._value;
    }

    override isMismatched(version: string | null | undefined): boolean {
      try {
        const mismatched = super.isMismatched(version);
        if (!mismatched) void this.value;
        return mismatched;
      } catch (error) {
        if (error instanceof DeserializationError) return true;
        throw error;
      }
    }
  });
}

/** @internal */
export class Coder {
  static toString(): string {
    return "ActiveSupport::Cache::Coder";
  }

  private legacySerializer: boolean;

  constructor(
    private serializer: CoderSerializer,
    private compressor: CoderCompressor | null,
    options: { legacySerializer?: boolean } = {},
  ) {
    this.legacySerializer = options.legacySerializer ?? false;
  }

  dump(entry: Entry): string | Uint8Array {
    if (this.legacySerializer) return this.serializer.dump(entry);

    return this.dumpCompressed(entry, Infinity);
  }

  /** @missingRailsArgs b — PERMANENT */
  dumpCompressed(entry: Entry, threshold: number): string | Uint8Array {
    if (this.legacySerializer) return this.serializer.dumpCompressed!(entry, threshold);

    let type = this.typeForString(entry.value);
    let payload: string | Uint8Array;
    if (type !== undefined) {
      payload = b(entry.value as string | Uint8Array);
    } else {
      type = OBJECT_DUMP_TYPE;
      payload = this.serializer.dump(entry.value);
    }

    const compressed = this.tryCompress(payload, threshold);
    if (compressed !== undefined) {
      payload = compressed;
      type = type | COMPRESSED_FLAG;
    }

    const expiresAt = entry.expiresAt ?? -1.0;

    const version = entry.version != null ? this.dumpVersion(entry.version) : null;
    const versionLength = version?.length ?? -1;

    let packed: string | Uint8Array = b(SIGNATURE);
    packed = rbStrPlus(packed, pack([type, expiresAt, versionLength], PACKED_TEMPLATE));
    if (version != null) packed = rbStrPlus(packed as Uint8Array, version);
    packed = rbStrPlus(packed as Uint8Array, payload);
    return packed;
  }

  load(dumped: unknown): unknown {
    if (!this.isSignature(dumped)) return this.serializer.load(dumped as string | Uint8Array);

    const type = unpack1(dumped, PACKED_TYPE_TEMPLATE)!;
    let expiresAt = unpack1(dumped, PACKED_EXPIRES_AT_TEMPLATE);
    const versionLength = unpack1(dumped, PACKED_VERSION_LENGTH_TEMPLATE)!;

    if (expiresAt! < 0) expiresAt = null;
    const version =
      versionLength >= 0
        ? this.loadVersion(byteslice(dumped, PACKED_VERSION_INDEX, versionLength)!)
        : null;
    const payload = byteslice(
      dumped,
      new Range(PACKED_VERSION_INDEX + Math.max(versionLength, 0), null),
    )!;

    const compressor = (type & COMPRESSED_FLAG) > 0 ? this.compressor : null;
    const serializer = STRING_DESERIALIZERS.get(type & ~COMPRESSED_FLAG) ?? this.serializer;

    return new (lazyEntryClass())(serializer, compressor, payload, { version, expiresAt });
  }

  private isSignature(dumped: unknown): dumped is Uint8Array {
    return dumped instanceof Uint8Array && rbStrStartWith(dumped, SIGNATURE);
  }

  private typeForString(value: unknown): number | undefined {
    if (!(typeof value === "string" || value instanceof Uint8Array)) return undefined;
    const encoding = rbObjEncoding(value);
    for (const [type, name] of STRING_ENCODINGS) if (Encoding.find(name) === encoding) return type;
    return undefined;
  }

  private tryCompress(
    string: string | Uint8Array,
    threshold: number,
  ): string | Uint8Array | undefined {
    if (this.compressor && b(string).length >= threshold) {
      const compressed = this.compressor.deflate(string);
      if (b(compressed).length < b(string).length) return compressed;
    }
    return undefined;
  }

  private dumpVersion(version: string | Uint8Array): Uint8Array {
    if (rbObjEncoding(version) !== Encoding.UTF_8 || rbStrStartWith(version, MARSHAL_SIGNATURE)) {
      return Marshal.dump(version);
    } else {
      return b(version);
    }
  }

  private loadVersion(dumpedVersion: Uint8Array): string | Uint8Array {
    if (rbStrStartWith(dumpedVersion, MARSHAL_SIGNATURE)) {
      return Marshal.load(dumpedVersion) as string | Uint8Array;
    } else {
      return forceEncoding(dumpedVersion, "UTF-8");
    }
  }
}
