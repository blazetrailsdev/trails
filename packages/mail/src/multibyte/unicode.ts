import { Unicode as ActiveSupportUnicode } from "@blazetrails/activesupport";
import { ArgumentError, pack } from "@blazetrails/ruby-compat";
import { EncodingError } from "../multibyte.js";

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

  uUnpack(string: string): number[] {
    if (/\p{Cs}/u.test(string)) throw new EncodingError("malformed UTF-8 character");
    return Array.from(string, (c) => c.codePointAt(0)!);
  },

  /** @missingRailsCall in_char_class? — PERMANENT */
  gUnpack(string: string): number[][] {
    Unicode.uUnpack(string);
    return Array.from(new Intl.Segmenter().segment(string), (s) => Unicode.uUnpack(s.segment));
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

  /** @missingRailsCall reorder_characters — PERMANENT */
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

  /** @internal */
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
