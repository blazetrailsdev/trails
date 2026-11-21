import {
  ArgumentError,
  bytes as rbBytes,
  File,
  Hash,
  hashAref,
  IO,
  IOError,
  Marshal,
  NoMethodError,
  pack,
  rbEqq,
  unpack,
} from "@blazetrails/ruby-compat";
import { EncodingError } from "./encoding-error.js";

export class Codepoint {
  code: number | null = null;
  combiningClass: number;
  decompType: string | null = null;
  decompMapping: number[] | null = null;
  uppercaseMapping: number;
  lowercaseMapping: number;

  constructor() {
    this.combiningClass = 0;
    this.uppercaseMapping = 0;
    this.lowercaseMapping = 0;
  }

  swapcaseMapping(): number {
    return this.uppercaseMapping > 0 ? this.uppercaseMapping : this.lowercaseMapping;
  }
}

const WHITESPACE: readonly number[] = Object.freeze(
  [
    [0x0009, 0x000a, 0x000b, 0x000c, 0x000d],
    0x0020,
    0x0085,
    0x00a0,
    0x1680,
    0x180e,
    Array.from({ length: 0x200a - 0x2000 + 1 }, (_, i) => 0x2000 + i),
    0x2028,
    0x2029,
    0x202f,
    0x205f,
    0x3000,
  ].flat(),
);

const LEADERS_AND_TRAILERS: readonly number[] = [...WHITESPACE, 65279];

function codepointsToPattern(arrayOfCodepoints: readonly number[]): string {
  return arrayOfCodepoints
    .map((e) => pack([e], "U*").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

export class UnicodeDatabase {
  static ATTRIBUTES = [
    "codepoints",
    "compositionExclusion",
    "compositionMap",
    "boundary",
    "cp1252",
  ];

  private _codepoints: Hash<number, Codepoint>;
  private _compositionExclusion: number[];
  private _compositionMap: Hash<number, Hash<number, number>>;
  private _boundary: Hash<string, unknown>;
  private _cp1252: Hash<number, number>;

  constructor() {
    this._codepoints = new Hash<number, Codepoint>(new Codepoint());
    this._compositionExclusion = [];
    this._compositionMap = new Hash();
    this._boundary = new Hash();
    this._cp1252 = new Hash();
  }

  get codepoints(): Hash<number, Codepoint> {
    this.load();
    return this._codepoints;
  }
  set codepoints(value: Hash<number, Codepoint>) {
    this._codepoints = value;
  }
  get compositionExclusion(): number[] {
    this.load();
    return this._compositionExclusion;
  }
  set compositionExclusion(value: number[]) {
    this._compositionExclusion = value;
  }
  get compositionMap(): Hash<number, Hash<number, number>> {
    this.load();
    return this._compositionMap;
  }
  set compositionMap(value: Hash<number, Hash<number, number>>) {
    this._compositionMap = value;
  }
  get boundary(): Hash<string, unknown> {
    this.load();
    return this._boundary;
  }
  set boundary(value: Hash<string, unknown>) {
    this._boundary = value;
  }
  get cp1252(): Hash<number, number> {
    this.load();
    return this._cp1252;
  }
  set cp1252(value: Hash<number, number>) {
    this._cp1252 = value;
  }

  load(): void {
    try {
      /** @inventedArm if — PERMANENT */
      if (_unicodeTables instanceof Error) throw _unicodeTables;
      /** @missingRailsCall open — PERMANENT */
      [
        this._codepoints,
        this._compositionExclusion,
        this._compositionMap,
        this._boundary,
        this._cp1252,
      ] = Marshal.load(_unicodeTables) as [
        Hash<number, Codepoint>,
        number[],
        Hash<number, Hash<number, number>>,
        Hash<string, unknown>,
        Hash<number, number>,
      ];
    } catch (e) {
      throw new IOError(
        `Couldn't load the Unicode tables for UTF8Handler (${(e as Error).message}), Mail::Multibyte is unusable`,
      );
    }

    for (const [k] of this._boundary.entries()) {
      if (Array.isArray(this._boundary.get(k))) {
        Object.defineProperty(this._boundary.get(k), "caseEquals", {
          value(this: unknown[], other: unknown): boolean {
            return this.find((i) => rbEqq(i, other)) !== undefined ? true : false;
          },
        });
      }
    }

    for (const attrName of UnicodeDatabase.ATTRIBUTES) {
      const ivar = `_${attrName}` as const;
      Object.defineProperty(this, attrName, {
        configurable: true,
        get: () => this[ivar as keyof this],
        set: (value) => {
          (this as Record<string, unknown>)[ivar] = value;
        },
      });
    }
  }

  static dirname(): string {
    return File.dirname(decodeURIComponent(new URL(import.meta.url).pathname)) + "/../values/";
  }

  static filename(): string {
    return File.expandPath(File.join(UnicodeDatabase.dirname(), "unicode_tables.dat"));
  }
}

const _unicodeTables: Uint8Array | Error = await IO.binreadAsync(UnicodeDatabase.filename()).catch(
  (e: Error) => e,
);

let _defaultNormalizationForm = ":kc";

let _database: UnicodeDatabase | null = null;

function database(): UnicodeDatabase {
  return (_database ||= new UnicodeDatabase());
}

export const Unicode = {
  Codepoint,

  UnicodeDatabase,

  UNICODE_VERSION: "7.0.0",

  NORMALIZATION_FORMS: [":c", ":kc", ":d", ":kd"],

  get defaultNormalizationForm(): string {
    return _defaultNormalizationForm;
  },

  set defaultNormalizationForm(value: string) {
    _defaultNormalizationForm = value;
  },

  HANGUL_SBASE: 0xac00,
  HANGUL_LBASE: 0x1100,
  HANGUL_VBASE: 0x1161,
  HANGUL_TBASE: 0x11a7,
  HANGUL_LCOUNT: 19,
  HANGUL_VCOUNT: 21,
  HANGUL_TCOUNT: 28,
  HANGUL_NCOUNT: 21 * 28,
  HANGUL_SCOUNT: 11172,
  HANGUL_SLAST: 0xac00 + 11172,
  HANGUL_JAMO_FIRST: 0x1100,
  HANGUL_JAMO_LAST: 0x11ff,

  WHITESPACE,

  LEADERS_AND_TRAILERS,

  codepointsToPattern,

  TRAILERS_PAT: new RegExp(`(${codepointsToPattern(LEADERS_AND_TRAILERS)})+$`, "u"),

  LEADERS_PAT: new RegExp(`^(${codepointsToPattern(LEADERS_AND_TRAILERS)})+`, "u"),

  uUnpack(string: string): number[] {
    if (/\p{Cs}/u.test(string)) throw new EncodingError("malformed UTF-8 character");
    return Array.from(string, (c) => c.codePointAt(0)!);
  },

  isInCharClass(codepoint: number | undefined, classes: string[]): boolean {
    return classes.find((c) => rbEqq(hashAref(database().boundary, c), codepoint)) ? true : false;
  },

  gUnpack(string: string): number[][] {
    const codepoints = Unicode.uUnpack(string);
    const unpacked: number[][] = [];
    let pos = 0;
    let marker = 0;
    const eoc = codepoints.length;
    while (pos < eoc) {
      pos += 1;
      const previous = codepoints[pos - 1];
      const current = codepoints[pos];
      if (
        !(
          (previous === hashAref(database().boundary, ":cr") &&
            current === hashAref(database().boundary, ":lf")) ||
          (rbEqq(hashAref(database().boundary, ":l"), previous) &&
            Unicode.isInCharClass(current, [":l", ":v", ":lv", ":lvt"])) ||
          (Unicode.isInCharClass(previous, [":lv", ":v"]) &&
            Unicode.isInCharClass(current, [":v", ":t"])) ||
          (Unicode.isInCharClass(previous, [":lvt", ":t"]) &&
            rbEqq(hashAref(database().boundary, ":t"), current)) ||
          rbEqq(hashAref(database().boundary, ":extend"), current)
        )
      ) {
        unpacked.push(codepoints.slice(marker, pos));
        marker = pos;
      }
    }
    return unpacked;
  },

  gPack(unpacked: number[][]): string {
    return pack(unpacked.flat(), "U*");
  },

  reorderCharacters(codepoints: number[]): number[] {
    const length = codepoints.length - 1;
    let pos = 0;
    while (pos < length) {
      const [cp1, cp2] = [
        hashAref(database().codepoints, codepoints[pos]) as Codepoint,
        hashAref(database().codepoints, codepoints[pos + 1]) as Codepoint,
      ];
      if (cp1.combiningClass > cp2.combiningClass && cp2.combiningClass > 0) {
        codepoints.splice(pos, 2, cp2.code!, cp1.code!);
        pos += pos > 0 ? -1 : 1;
      } else {
        pos += 1;
      }
    }
    return codepoints;
  },

  decomposeCodepoints(type: string, codepoints: number[]): number[] {
    return codepoints.reduce<number[]>((decomposed, cp) => {
      let ncp: number[] | null;
      if (Unicode.HANGUL_SBASE <= cp && cp < Unicode.HANGUL_SLAST) {
        const sindex = cp - Unicode.HANGUL_SBASE;
        ncp = [];
        ncp.push(Unicode.HANGUL_LBASE + Math.floor(sindex / Unicode.HANGUL_NCOUNT));
        ncp.push(
          Unicode.HANGUL_VBASE +
            Math.floor((sindex % Unicode.HANGUL_NCOUNT) / Unicode.HANGUL_TCOUNT),
        );
        const tindex = sindex % Unicode.HANGUL_TCOUNT;
        if (tindex !== 0) ncp.push(Unicode.HANGUL_TBASE + tindex);
        decomposed.push(...ncp);
      } else if (
        (ncp = (hashAref(database().codepoints, cp) as Codepoint).decompMapping) != null &&
        ((hashAref(database().codepoints, cp) as Codepoint).decompType == null ||
          type === ":compatability")
      ) {
        decomposed.push(...Unicode.decomposeCodepoints(type, [...ncp]));
      } else {
        decomposed.push(cp);
      }
      return decomposed;
    }, []);
  },

  composeCodepoints(codepoints: number[]): number[] {
    let pos = 0;
    let eoa = codepoints.length - 1;
    let starterPos = 0;
    let starterChar = codepoints[0];
    let previousCombiningClass = -1;
    while (pos < eoa) {
      pos += 1;
      const lindex = starterChar - Unicode.HANGUL_LBASE;
      if (0 <= lindex && lindex < Unicode.HANGUL_LCOUNT) {
        const vcp = codepoints[starterPos + 1];
        const vindex = vcp == null ? -1 : vcp - Unicode.HANGUL_VBASE;
        if (0 <= vindex && vindex < Unicode.HANGUL_VCOUNT) {
          const tcp = codepoints[starterPos + 2];
          let tindex = tcp == null ? -1 : tcp - Unicode.HANGUL_TBASE;
          let j: number;
          if (0 <= tindex && tindex < Unicode.HANGUL_TCOUNT) {
            j = starterPos + 2;
            eoa -= 2;
          } else {
            tindex = 0;
            j = starterPos + 1;
            eoa -= 1;
          }
          codepoints.splice(
            starterPos,
            j - starterPos + 1,
            (lindex * Unicode.HANGUL_VCOUNT + vindex) * Unicode.HANGUL_TCOUNT +
              tindex +
              Unicode.HANGUL_SBASE,
          );
        }
        starterPos += 1;
        starterChar = codepoints[starterPos];
      } else {
        const currentChar = codepoints[pos];
        const current = hashAref(database().codepoints, currentChar) as Codepoint;
        if (current.combiningClass > previousCombiningClass) {
          let composition: number | null;
          const ref = hashAref(database().compositionMap, starterChar) as Hash<
            number,
            number
          > | null;
          if (ref != null) {
            composition = (hashAref(ref, currentChar) as number | null) ?? null;
          } else {
            composition = null;
          }
          if (composition != null) {
            codepoints[starterPos] = composition;
            starterChar = composition;
            codepoints.splice(pos, 1);
            eoa -= 1;
            pos -= 1;
            previousCombiningClass = -1;
          } else {
            previousCombiningClass = current.combiningClass;
          }
        } else {
          previousCombiningClass = current.combiningClass;
        }
        if (current.combiningClass === 0) {
          starterPos = pos;
          starterChar = codepoints[pos];
        }
      }
    }
    return codepoints;
  },

  tidyBytes(string: string, force: boolean = false): string {
    if (force) {
      return pack(
        unpack(
          pack(
            (unpack(Uint8Array.from(rbBytes(string)), "C*") as number[])
              .map((b) => tidyByte(b))
              .flat()
              .filter((x) => x != null),
            "C*",
          ),
          "U*",
        ),
        "U*",
      );
    }

    const bytes: (number | number[])[] = unpack(Uint8Array.from(rbBytes(string)), "C*") as number[];
    let contsExpected = 0;
    let lastLead = 0;

    bytes.forEach((_, i) => {
      const byte = bytes[i] as number;
      const isCont = byte > 127 && byte < 192;
      const isLead = byte > 191 && byte < 245;
      const isUnused = byte > 240;
      const isRestricted = byte > 244;

      if (isUnused || isRestricted) {
        bytes[i] = tidyByte(byte);
      } else if (isCont) {
        if (contsExpected === 0) bytes[i] = tidyByte(byte);
        else contsExpected -= 1;
      } else {
        if (contsExpected > 0) {
          for (let j = 1; j <= i - lastLead; j++) bytes[i - j] = tidyByte(bytes[i - j]);
          contsExpected = 0;
        }
        if (isLead) {
          if (i === bytes.length - 1) {
            bytes[i] = tidyByte(bytes.at(-1) as number);
          } else {
            contsExpected = byte < 224 ? 1 : byte < 240 ? 2 : 3;
            lastLead = i;
          }
        }
      }
    });
    return bytes.length === 0
      ? ""
      : pack(
          unpack(
            pack(
              bytes.flat().filter((x) => x != null),
              "C*",
            ),
            "U*",
          ),
          "U*",
        );
  },

  normalize(string: string, form: string | null = null): string {
    form ||= Unicode.defaultNormalizationForm;
    const codepoints = Unicode.uUnpack(string);
    let result: number[];
    switch (form) {
      case ":d":
        result = Unicode.reorderCharacters(Unicode.decomposeCodepoints(":canonical", codepoints));
        break;
      case ":c":
        result = Unicode.composeCodepoints(
          Unicode.reorderCharacters(Unicode.decomposeCodepoints(":canonical", codepoints)),
        );
        break;
      case ":kd":
        result = Unicode.reorderCharacters(
          Unicode.decomposeCodepoints(":compatability", codepoints),
        );
        break;
      case ":kc":
        result = Unicode.composeCodepoints(
          Unicode.reorderCharacters(Unicode.decomposeCodepoints(":compatability", codepoints)),
        );
        break;
      default:
        throw new ArgumentError(`${form.replace(/^:/, "")} is not a valid normalization variant`);
    }
    return pack(result, "U*");
  },

  applyMapping(string: string, mapping: ":uppercase_mapping" | ":lowercase_mapping"): string {
    return pack(
      Unicode.uUnpack(string).map((codepoint) => {
        const cp = hashAref(database().codepoints, codepoint) as Codepoint | null;
        let ncp: number | null;
        if (
          cp != null &&
          (ncp = mapping === ":uppercase_mapping" ? cp.uppercaseMapping : cp.lowercaseMapping) !=
            null &&
          ncp > 0
        ) {
          return ncp;
        } else {
          return codepoint;
        }
      }),
      "U*",
    );
  },
};

function tidyByte(byte: number | number[]): number[] {
  /** @inventedArm if — PERMANENT */
  if (typeof byte !== "number") {
    throw new NoMethodError("undefined method `<' for an instance of Array", "<");
  }
  if (byte < 160) {
    return unpack(
      Uint8Array.from(
        rbBytes(pack([(hashAref(database().cp1252, byte) as number | null) || byte], "U")),
      ),
      "C*",
    ) as number[];
  } else if (byte < 192) {
    return [194, byte];
  } else {
    return [195, byte - 64];
  }
}
