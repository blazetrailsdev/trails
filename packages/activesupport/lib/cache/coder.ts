import { pack, unpack1 } from "@blazetrails/ruby-compat/array";
import { Encoding } from "@blazetrails/ruby-compat/encoding";
import { transformValues } from "@blazetrails/ruby-compat/hash";
import { Marshal } from "@blazetrails/ruby-compat/marshal";
import { Range } from "@blazetrails/ruby-compat/range";
import { b } from "@blazetrails/ruby-compat/string/b";
import { byteslice } from "@blazetrails/ruby-compat/string/byte-methods";
import { forceEncoding, rbObjEncoding } from "@blazetrails/ruby-compat/string/force-encoding";
import { rbStrPlus } from "@blazetrails/ruby-compat/string/method-table";
import { rbStrStartWith } from "@blazetrails/ruby-compat/string/sub";
import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";
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
  constructor(private encoding: string) {}

  dump(value: unknown): string {
    return value as string;
  }

  load(payload: string | Uint8Array): string | Uint8Array {
    return forceEncoding(payload, this.encoding);
  }
}

const STRING_DESERIALIZERS = transformValues(
  STRING_ENCODINGS,
  (encoding) => new StringDeserializer(encoding),
);

type LazyEntryOptions = { version: string | Uint8Array | null; expiresAt: number | null };

/** @internal */
export class LazyEntry extends Entry {
  private serializer: CoderSerializer;
  private compressor: CoderCompressor | null;
  private resolved: boolean;

  constructor(
    serializer: CoderSerializer,
    compressor: CoderCompressor | null,
    payload: string | Uint8Array,
    options: LazyEntryOptions,
  ) {
    super(payload, options);
    this.serializer = serializer;
    this.compressor = compressor;
    this.resolved = false;
  }

  /** @missingRailsName value — PERMANENT */
  override get value(): unknown {
    if (!this.resolved) {
      this._value = this.serializer.load(
        this.compressor
          ? this.compressor.inflate(this._value as string | Uint8Array)
          : (this._value as string | Uint8Array),
      );
      this.resolved = true;
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
}

/** @internal */
export class Coder {
  static LazyEntry = LazyEntry;

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

    return new LazyEntry(serializer, compressor, payload, { version, expiresAt });
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
