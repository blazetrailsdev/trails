import { Unicode as ActiveSupportUnicode } from "@blazetrails/activesupport";
import {
  ArgumentError,
  bytes as rbBytes,
  NoMethodError,
  pack,
  unpack,
} from "@blazetrails/ruby-compat";
import { EncodingError } from "./encoding-error.js";
import { LOWERCASE_MAPPING, UPPERCASE_MAPPING } from "./simple-case-mappings.generated.js";

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

type BoundaryClass = "cr" | "lf" | "l" | "v" | "lv" | "lvt" | "t" | "extend";

function inRanges(...ranges: [number, number][]): (cp: number) => boolean {
  return (cp) => ranges.some(([a, b]) => a <= cp && cp <= b);
}

function isHangulSyllable(cp: number, lv: boolean): boolean {
  return 0xac00 <= cp && cp <= 0xd7a3 && ((cp - 0xac00) % 28 === 0) === lv;
}

const _database = {
  boundary: {
    cr: 0x0d,
    lf: 0x0a,
    l: inRanges([0x1100, 0x115f], [0xa960, 0xa97c]),
    v: inRanges([0x1160, 0x11a7], [0xd7b0, 0xd7c6]),
    t: inRanges([0x11a8, 0x11ff], [0xd7cb, 0xd7fb]),
    lv: (cp: number) => isHangulSyllable(cp, true),
    lvt: (cp: number) => isHangulSyllable(cp, false),
    extend: (cp: number) => /\p{Grapheme_Extend}/u.test(String.fromCodePoint(cp)),
  } as Record<BoundaryClass, number | ((cp: number) => boolean)>,
  cp1252: Object.fromEntries(
    Array.from({ length: 32 }, (_, i) => [
      0x80 + i,
      new TextDecoder("windows-1252").decode(Uint8Array.of(0x80 + i)).codePointAt(0)!,
    ]),
  ) as Record<number, number>,
};

function tidyByte(byte: number | number[]): number[] {
  /** @inventedArm if — PERMANENT */
  if (typeof byte !== "number") {
    throw new NoMethodError("undefined method `<' for an instance of Array", "<");
  }
  if (byte < 160) {
    return unpack(
      Uint8Array.from(rbBytes(pack([database().cp1252[byte] || byte], "U"))),
      "C*",
    ) as number[];
  } else if (byte < 192) {
    return [194, byte];
  } else {
    return [195, byte - 64];
  }
}

function caseEq(
  matcher: number | ((cp: number) => boolean),
  codepoint: number | undefined,
): boolean {
  if (codepoint === undefined) return false;
  return typeof matcher === "number" ? matcher === codepoint : matcher(codepoint);
}

function database(): typeof _database {
  return _database;
}

export const Unicode = {
  UNICODE_VERSION: "7.0.0",

  NORMALIZATION_FORMS: [":c", ":kc", ":d", ":kd"],

  defaultNormalizationForm: ":kc",

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

  isInCharClass(codepoint: number | undefined, classes: BoundaryClass[]): boolean {
    return classes.find((c) => caseEq(database().boundary[c], codepoint)) ? true : false;
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
          (previous === database().boundary.cr && current === database().boundary.lf) ||
          (caseEq(database().boundary.l, previous) &&
            Unicode.isInCharClass(current, ["l", "v", "lv", "lvt"])) ||
          (Unicode.isInCharClass(previous, ["lv", "v"]) &&
            Unicode.isInCharClass(current, ["v", "t"])) ||
          (Unicode.isInCharClass(previous, ["lvt", "t"]) &&
            caseEq(database().boundary.t, current)) ||
          caseEq(database().boundary.extend, current)
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

  decomposeCodepoints(type: string, codepoints: number[]): number[] {
    return ActiveSupportUnicode.decompose(
      type === ":compatability" ? ":compatibility" : type,
      codepoints,
    );
  },

  composeCodepoints(codepoints: number[]): number[] {
    return ActiveSupportUnicode.compose(codepoints);
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
        ) as number[],
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
          ) as number[],
          "U*",
        );
  },

  normalize(string: string, form: string | null = null): string {
    form ||= Unicode.defaultNormalizationForm;
    const codepoints = Unicode.uUnpack(string);
    let result: number[];
    switch (form) {
      case ":d":
        result = Unicode.decomposeCodepoints(":canonical", codepoints);
        break;
      case ":c":
        result = Unicode.composeCodepoints(Unicode.decomposeCodepoints(":canonical", codepoints));
        break;
      case ":kd":
        result = Unicode.decomposeCodepoints(":compatability", codepoints);
        break;
      case ":kc":
        result = Unicode.composeCodepoints(
          Unicode.decomposeCodepoints(":compatability", codepoints),
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
        const ncp = (mapping === ":uppercase_mapping" ? UPPERCASE_MAPPING : LOWERCASE_MAPPING).get(
          codepoint,
        );
        if (ncp != null && ncp > 0) {
          return ncp;
        } else {
          return codepoint;
        }
      }),
      "U*",
    );
  },
};
