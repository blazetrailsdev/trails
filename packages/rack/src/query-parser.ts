export class ParameterTypeError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ParameterTypeError";
  }
}

class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

export class InvalidParameterError extends ArgumentError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParameterError";
  }
}

export class QueryLimitError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "QueryLimitError";
  }
}

export const ParamsTooDeepError = QueryLimitError;
export type ParamsTooDeepError = QueryLimitError;

export class Params extends Object {
  [key: string]: any;
  toParamsHash(): Record<string, any> {
    return Object.assign(Object.create(null), this);
  }
}

const DEFAULT_SEP = /& */;
const COMMON_SEP: Record<string, RegExp> = {
  ";": /; */,
  ";,": /[;,] */,
  "&": /& */,
};

const BYTESIZE_LIMIT = 4194304;
const PARAMS_LIMIT = 4096;

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class QueryParser {
  readonly paramDepthLimit: number;
  private readonly bytesizeLimit: number;
  private readonly paramsLimit: number;
  private readonly paramsClass: typeof Params;

  static makeDefault(
    paramDepthLimit: number,
    options: { bytesizeLimit?: number; paramsLimit?: number } = {},
  ): QueryParser {
    return new QueryParser(
      Params,
      paramDepthLimit,
      options.bytesizeLimit ?? BYTESIZE_LIMIT,
      options.paramsLimit ?? PARAMS_LIMIT,
    );
  }

  constructor(
    paramsClass: typeof Params,
    paramDepthLimit: number,
    bytesizeLimit: number = BYTESIZE_LIMIT,
    paramsLimit: number = PARAMS_LIMIT,
  ) {
    this.paramsClass = paramsClass;
    this.paramDepthLimit = paramDepthLimit;
    this.bytesizeLimit = bytesizeLimit;
    this.paramsLimit = paramsLimit;
  }

  parseQuery(
    qs: string | null | undefined,
    separator?: string | null,
  ): Record<string, string | string[] | null> {
    if (!qs) return {};
    const str = this.checkQueryString(qs, separator);
    const sep = separator ? (COMMON_SEP[separator] ?? new RegExp(`[${separator}] *`)) : DEFAULT_SEP;
    const result: Record<string, string | string[] | null> = {};

    for (const p of str.split(sep)) {
      if (!p) continue;
      const eqIdx = p.indexOf("=");
      let k: string, v: string | null;
      if (eqIdx === -1) {
        k = unescape(p);
        v = null;
      } else {
        k = unescape(p.substring(0, eqIdx));
        v = unescape(p.substring(eqIdx + 1));
      }
      if (k in result) {
        const cur = result[k];
        if (Array.isArray(cur)) {
          cur.push(v as string);
        } else {
          result[k] = [cur as string, v as string];
        }
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  parseNestedQuery(qs: string | null | undefined, separator?: string | null): Record<string, any> {
    const params = this.makeParams();
    if (!qs) return params.toParamsHash();

    try {
      const str = this.checkQueryString(qs, separator);
      const sep = separator
        ? (COMMON_SEP[separator] ?? new RegExp(`[${separator}] *`))
        : DEFAULT_SEP;

      for (const p of str.split(sep)) {
        if (!p) continue;
        const eqIdx = p.indexOf("=");
        let k: string, v: string | null;
        if (eqIdx === -1) {
          k = unescape(p);
          v = null;
        } else {
          k = unescape(p.substring(0, eqIdx));
          v = unescape(p.substring(eqIdx + 1));
        }
        this._normalizeParams(params, k, v, 0);
      }
    } catch (e) {
      if (e instanceof TypeError && !(e instanceof ParameterTypeError)) {
        throw new InvalidParameterError(e.message);
      }
      throw e;
    }

    return params.toParamsHash();
  }

  normalizeParams(params: any, name: string, v: string | null, _depth?: number): void {
    this._normalizeParams(params, name, v, 0);
  }

  makeParams(): Params {
    return new this.paramsClass();
  }

  newDepthLimit(paramDepthLimit: number): QueryParser {
    return new QueryParser(this.paramsClass, paramDepthLimit, this.bytesizeLimit, this.paramsLimit);
  }

  private checkQueryString(qs: string, _sep: string | null | undefined): string {
    const bytesize = new TextEncoder().encode(qs).length;
    if (bytesize > this.bytesizeLimit) {
      throw new QueryLimitError(
        `total query size (${bytesize}) exceeds limit (${this.bytesizeLimit})`,
      );
    }
    const paramCount = (qs.match(/&/g) || []).length;
    if (paramCount >= this.paramsLimit) {
      throw new QueryLimitError(
        `total number of query parameters (${paramCount + 1}) exceeds limit (${this.paramsLimit})`,
      );
    }
    return qs;
  }

  private _normalizeParams(params: any, name: string, v: string | null, depth: number): void {
    if (depth >= this.paramDepthLimit) throw new QueryLimitError("param depth limit exceeded");
    if (!name) return;
    if (DANGEROUS_KEYS.has(name)) return;

    if (!name.includes("[")) {
      if (name === "") return;
      params[name] = v;
      return;
    }

    // Only match names with a non-empty prefix followed by complete bracket segments.
    // Malformed inputs like "b[=3" or "[a]=2" fail the match and are stored as-is.
    const match = name.match(/^([^[]*)((?:\[[^\]]*\])*)$/);
    if (!match || !match[1]) {
      params[name] = v;
      return;
    }

    const prefix = match[1];
    if (DANGEROUS_KEYS.has(prefix)) return;
    const rest = match[2];

    if (!rest) {
      params[prefix] = v;
      return;
    }

    // Check for trailing content after all complete brackets (e.g. "g[h]i=8")
    const brackets = rest.match(/\[[^\]]*\]/g) || [];
    const fullBrackets = brackets.join("");
    const afterBrackets = rest.substring(fullBrackets.length);

    if (afterBrackets) {
      const segs = [prefix, ...brackets.map((b) => b.slice(1, -1))];
      const lastKey = segs.pop()! + afterBrackets;
      let cur = params;
      for (const k of segs) {
        if (!(k in cur) || typeof cur[k] !== "object" || Array.isArray(cur[k])) {
          cur[k] = Object.create(null);
        }
        cur = cur[k];
      }
      if (!DANGEROUS_KEYS.has(lastKey)) cur[lastKey] = v;
      return;
    }

    const keys = brackets.map((b) => b.slice(1, -1));
    this._setNestedValue(params, prefix, keys, v, depth);
  }

  private _setNestedValue(
    params: any,
    prefix: string,
    keys: string[],
    v: string | null,
    depth: number,
  ): void {
    if (depth >= this.paramDepthLimit) throw new QueryLimitError("param depth limit exceeded");
    if (DANGEROUS_KEYS.has(prefix)) return;

    if (keys.length === 0) {
      params[prefix] = v;
      return;
    }

    const firstKey = keys[0];
    const restKeys = keys.slice(1);

    if (firstKey === "") {
      if (!(prefix in params)) params[prefix] = [];
      const arr = params[prefix];
      if (!Array.isArray(arr)) {
        throw new ParameterTypeError(
          `expected Array (got ${arr?.constructor?.name ?? typeof arr}) for param \`${prefix}'`,
        );
      }
      if (restKeys.length === 0) {
        arr.push(v);
      } else {
        if (arr.length === 0 || this._shouldStartNewHash(arr[arr.length - 1], restKeys)) {
          arr.push(Object.create(null));
        }
        this._setNestedValue(arr[arr.length - 1], restKeys[0], restKeys.slice(1), v, depth + 1);
      }
      return;
    }

    if (!(prefix in params)) params[prefix] = Object.create(null);
    const container = params[prefix];
    if (typeof container === "string" || container === null) {
      throw new ParameterTypeError(`expected Hash (got String) for param \`${prefix}'`);
    }
    if (Array.isArray(container)) {
      throw new ParameterTypeError(
        `expected Array (got ${container.constructor.name}) for param \`${prefix}'`,
      );
    }
    this._setNestedValue(container, firstKey, restKeys, v, depth + 1);
  }

  private _shouldStartNewHash(lastItem: any, keys: string[]): boolean {
    if (typeof lastItem !== "object" || lastItem === null || Array.isArray(lastItem)) return true;
    let current = lastItem;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === "") return false;
      if (keys[i] in current) {
        if (i === keys.length - 1) return true;
        current = current[keys[i]];
        if (typeof current !== "object" || current === null || Array.isArray(current)) return true;
      } else {
        return false;
      }
    }
    return false;
  }
}

function unescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, " "));
}
