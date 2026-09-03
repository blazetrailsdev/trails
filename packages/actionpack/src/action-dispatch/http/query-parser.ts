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

function decodeFormComponent(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, " "));
}
