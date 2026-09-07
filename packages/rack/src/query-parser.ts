import { ArgumentError, include, rbObjClass } from "@blazetrails/ruby-compat";
import { BadRequest } from "./bad-request.js";
export class ParameterTypeError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ParameterTypeError";
  }
}
include(ParameterTypeError, BadRequest);

export class InvalidParameterError extends ArgumentError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParameterError";
  }
}
include(InvalidParameterError, BadRequest);

export class QueryLimitError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "QueryLimitError";
  }
}
include(QueryLimitError, BadRequest);

export const ParamsTooDeepError = QueryLimitError;
export type ParamsTooDeepError = QueryLimitError;

export class Params {
  [key: string]: any;
  declare toParamsHash: () => Record<string, any>;

  constructor() {
    const params: Record<string, any> = Object.create(null);
    Object.defineProperty(params, "toParamsHash", {
      value: (): Record<string, any> => Object.assign(Object.create(null), params),
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return params as Params;
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      Object.getPrototypeOf(value) === null &&
      typeof (value as Params).toParamsHash === "function"
    );
  }
}

const DEFAULT_SEP = /& */;
const COMMON_SEP: Record<string, RegExp> = {
  ";": /; */,
  ";,": /[;,] */,
  "&": /& */,
};

function escapedSepRe(sep: string): RegExp {
  return new RegExp(`[${sep.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}] *`);
}

const BYTESIZE_LIMIT = 4194304;
const PARAMS_LIMIT = 4096;

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
    if (!qs) return Object.create(null);
    const str = this.checkQueryString(qs, separator);
    const sep = separator ? (COMMON_SEP[separator] ?? escapedSepRe(separator)) : DEFAULT_SEP;
    const result: Record<string, string | string[] | null> = Object.create(null);

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
      if (Object.hasOwn(result, k)) {
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
    if (!qs) return Object.create(null);
    const params = this.makeParams();

    try {
      const str = this.checkQueryString(qs, separator);
      const sep = separator ? (COMMON_SEP[separator] ?? escapedSepRe(separator)) : DEFAULT_SEP;

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
      if (e instanceof URIError) {
        throw new InvalidParameterError((e as Error).message);
      }
      throw e;
    }

    return Object.assign(Object.create(null), params);
  }

  normalizeParams(params: any, name: string, v: unknown, _depth?: number): void {
    this._normalizeParams(params, name, v, 0);
  }

  makeParams(): Params {
    return new this.paramsClass();
  }

  newDepthLimit(paramDepthLimit: number): QueryParser {
    return new QueryParser(this.paramsClass, paramDepthLimit, this.bytesizeLimit, this.paramsLimit);
  }

  private checkQueryString(qs: string, sep: string | null | undefined): string {
    const bytesize = new TextEncoder().encode(qs).length;
    if (bytesize > this.bytesizeLimit) {
      throw new QueryLimitError(
        `total query size (${bytesize}) exceeds limit (${this.bytesizeLimit})`,
      );
    }
    const sepChars = sep || "&";
    const sepRe = new RegExp(`[${sepChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}]`, "g");
    let paramCount = 0;
    while (sepRe.exec(qs) !== null) paramCount++;
    if (paramCount >= this.paramsLimit) {
      throw new QueryLimitError(
        `total number of query parameters (${paramCount + 1}) exceeds limit (${this.paramsLimit})`,
      );
    }
    return qs;
  }

  private _normalizeParams(params: any, name: string | null, v: unknown, depth: number): any {
    if (depth >= this.paramDepthLimit) throw new ParamsTooDeepError("param depth limit exceeded");

    let k: string;
    let after: string;
    let start: number;
    if (name == null) {
      k = after = "";
    } else if (depth === 0) {
      if ((start = name.indexOf("[", 1)) !== -1) {
        k = name.substring(0, start);
        after = name.substring(start);
      } else {
        k = name;
        after = "";
      }
    } else if (name.startsWith("[]")) {
      k = "[]";
      after = name.substring(2);
    } else if (name.startsWith("[") && (start = name.indexOf("]", 1)) !== -1) {
      k = name.substring(1, start);
      after = name.substring(start + 1);
    } else {
      k = name;
      after = "";
    }

    if (k === "") return;

    if (after === "") {
      if (k === "[]" && depth !== 0) {
        return [v];
      } else {
        params[k] = v;
      }
    } else if (after === "[") {
      params[name!] = v;
    } else if (after === "[]") {
      params[k] ??= [];
      if (!Array.isArray(params[k])) {
        throw new ParameterTypeError(
          `expected Array (got ${rbObjClass(params[k])}) for param \`${k}'`,
        );
      }
      params[k].push(v);
    } else if (after.startsWith("[]")) {
      let childKey: string;
      if (
        !(
          after[2] === "[" &&
          after.endsWith("]") &&
          (childKey = after.substring(3, after.length - 1)) !== "" &&
          !childKey.includes("[") &&
          !childKey.includes("]")
        )
      ) {
        childKey = after.substring(2);
      }
      params[k] ??= [];
      if (!Array.isArray(params[k])) {
        throw new ParameterTypeError(
          `expected Array (got ${rbObjClass(params[k])}) for param \`${k}'`,
        );
      }
      const last = params[k][params[k].length - 1];
      if (this.isParamsHashType(last) && !this.isParamsHashHasKey(last, childKey!)) {
        this._normalizeParams(last, childKey!, v, depth + 1);
      } else {
        params[k].push(this._normalizeParams(this.makeParams(), childKey!, v, depth + 1));
      }
    } else {
      params[k] ??= this.makeParams();
      if (!this.isParamsHashType(params[k])) {
        throw new ParameterTypeError(
          `expected Hash (got ${rbObjClass(params[k])}) for param \`${k}'`,
        );
      }
      params[k] = this._normalizeParams(params[k], after, v, depth + 1);
    }

    return params;
  }

  /** @internal */
  private isParamsHashType(obj: any): boolean {
    return obj instanceof this.paramsClass;
  }

  /** @internal */
  private isParamsHashHasKey(hash: any, key: string): boolean {
    if (/\[\]/.test(key)) return false;
    let h: any = hash;
    for (const part of key.split(/[[\]]+/)) {
      if (part === "") continue;
      if (!this.isParamsHashType(h) || !Object.hasOwn(h, part)) return false;
      h = h[part];
    }
    return true;
  }
}

/** @internal */
function unescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, " "));
}
