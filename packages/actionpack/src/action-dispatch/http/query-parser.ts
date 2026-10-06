import { ArgumentError, bytes, strNew } from "@blazetrails/ruby-compat";

const DEFAULT_SEP = /& */;
const COMMON_SEP: Record<string, RegExp> = Object.assign(Object.create(null), {
  ";": /; */,
  ";,": /[;,] */,
  "&": /& */,
  "&;": /[&;] */,
});

export type QueryPair = [string, string | null];

export class QueryParser {
  static strictQueryStringSeparator: boolean | null = null;

  static *eachPair(s: string | null | undefined, separator?: string | null): Generator<QueryPair> {
    const str = s ?? "";

    let splitter: RegExp;
    if (separator) {
      splitter = COMMON_SEP[separator] ?? new RegExp(`[${escapeChars(separator)}] *`);
    } else {
      splitter = DEFAULT_SEP;
    }

    for (const part of str.split(splitter)) {
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

      yield [k, v];
    }
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
