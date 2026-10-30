import { Unicode as ActiveSupportUnicode } from "@blazetrails/activesupport";
import { ArgumentError, pack } from "@blazetrails/ruby-compat";
import { EncodingError } from "./encoding-error.js";

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
};

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

  inCharClass(codepoint: number | undefined, classes: BoundaryClass[]): boolean {
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
            Unicode.inCharClass(current, ["l", "v", "lv", "lvt"])) ||
          (Unicode.inCharClass(previous, ["lv", "v"]) &&
            Unicode.inCharClass(current, ["v", "t"])) ||
          (Unicode.inCharClass(previous, ["lvt", "t"]) && caseEq(database().boundary.t, current)) ||
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
    return ActiveSupportUnicode.tidyBytes(string, force);
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
        const c = String.fromCodePoint(codepoint);
        const mapped = mapping === ":uppercase_mapping" ? c.toUpperCase() : c.toLowerCase();
        const ncp = Array.from(mapped).length === 1 ? mapped.codePointAt(0)! : 0;
        if (ncp > 0) {
          return ncp;
        } else {
          return codepoint;
        }
      }),
      "U*",
    );
  },
};
