import { cattrAccessor } from "@blazetrails/activesupport";
import { ArgumentError, bytes, strNew, toEnum, type Enumerator } from "@blazetrails/ruby-compat";

const DEFAULT_SEP = /& */;
const COMMON_SEP: Record<string, RegExp> = Object.assign(Object.create(null), {
  ";": /; */,
  ";,": /[;,] */,
  "&": /& */,
  "&;": /[&;] */,
});

export type QueryPair = [string, string | null];

export class QueryParser {
  declare static strictQueryStringSeparator: boolean | null | undefined;
  declare strictQueryStringSeparator: boolean | null | undefined;

  static {
    cattrAccessor.call(this, "strictQueryStringSeparator");
  }

  static eachPair(s: string | null | undefined, separator?: string | null): Enumerator<QueryPair>;
  static eachPair(
    s: string | null | undefined,
    separator: string | null | undefined,
    block: (k: string, v: string | null) => void,
  ): null;
  static eachPair(
    s: string | null | undefined,
    separator: string | null = null,
    block?: (k: string, v: string | null) => void,
  ): Enumerator<QueryPair> | null {
    if (!block) return toEnum(this, "eachPair", s, separator);

    s ??= "";

    let splitter: RegExp;
    if (separator) {
      splitter = COMMON_SEP[separator] ?? new RegExp(`[${escapeChars(separator)}] *`);
    } else {
      splitter = DEFAULT_SEP;
    }

    for (const part of s.split(splitter)) {
      if (part === "") continue;

      const eq = part.indexOf("=");
      let k: string;
      let v: string | null;
      if (eq === -1) {
        k = part;
        v = null;
      } else {
        k = part.slice(0, eq);
        v = part.slice(eq + 1);
      }

      k = decodeFormComponent(k);
      if (v !== null) v = decodeFormComponent(v);

      block(k, v);
    }

    return null;
  }
}

function escapeChars(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/** `URI.decode_www_form_component` (`vendor/ruby/v3.3.11/lib/uri/common.rb:370-372`, `:399-402`). */
function decodeFormComponent(str: string): string {
  if (/%(?![0-9a-fA-F]{2})/.test(str)) throw new ArgumentError(`invalid %-encoding (${str})`);
  const b = bytes(str.replace(/\+/g, " "));
  const decoded: number[] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x25) {
      decoded.push(parseInt(String.fromCharCode(b[i + 1], b[i + 2]), 16));
      i += 2;
    } else {
      decoded.push(b[i]);
    }
  }
  return strNew(decoded);
}
