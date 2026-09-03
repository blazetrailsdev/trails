import { Temporal } from "@blazetrails/date";
import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";

const PREFIX = "~#";
const UNDEF = "~#u";
const BIGINT = "~#b";
const DATE = "~#d";
const INSTANT = "~#i";
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
  if (value instanceof Date) return [DATE, value.getTime()];

  // boundary: Ruby Marshal round-trips a Time, and `Temporal.Instant` is the
  if (value instanceof Temporal.Instant) return [INSTANT, value.toString()];

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
  load(dumped: string): unknown {
    return decode(JSON.parse(escapeControlChars(dumped)));
  },
};

/** @internal */
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

const SIGNATURE = "\x00\x11";
const HEADER_SEP = "\x00";
const OBJECT_DUMP_TYPE = 0x01;
const STRING_TYPE = 0x02;
const COMPRESSED_FLAG = 0x80;

const stringDeserializer: CoderSerializer = {
  dump: (value) => value as string,
  load: (dumped) => dumped,
};

type LazyEntryOptions = { version: string | null; expiresAt: number | null };
let lazyEntry:
  | (new (s: CoderSerializer, c: CoderCompressor | null, p: string, o: LazyEntryOptions) => Entry)
  | undefined;

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

  private typeForString(value: unknown): number | undefined {
    return typeof value === "string" ? STRING_TYPE : undefined;
  }

  private dumpVersion(version: string): string {
    return version;
  }

  private loadVersion(dumpedVersion: string): string {
    return dumpedVersion;
  }

  private tryCompress(string: string, threshold: number): string | undefined {
    if (this.compressor && Buffer.byteLength(string) >= threshold) {
      const compressed = this.compressor.deflate(string);
      if (compressed.length < Buffer.byteLength(string)) return compressed;
    }
    return undefined;
  }
}
