import { deprecator } from "../deprecator.js";
import { UploadedFile } from "./upload.js";
import { QueryParser, type QueryPair } from "./query-parser.js";
import { RequestUtils, type ParamHash, type ParamValue } from "../request/utils.js";
import { InvalidParameterError, ParameterTypeError, ParamsTooDeepError } from "./param-error.js";

export type EncodingTemplate = Record<string, string>;

/** @internal */
const LEADING_BRACKETS_COMPAT = false;

export class ParamBuilder {
  readonly paramDepthLimit: number;

  constructor(paramDepthLimit: number) {
    this.paramDepthLimit = paramDepthLimit;
  }

  static makeDefault(paramDepthLimit: number): ParamBuilder {
    return new ParamBuilder(paramDepthLimit);
  }

  static ignoreLeadingBrackets: boolean | null = null;

  static default: ParamBuilder = ParamBuilder.makeDefault(100);

  static fromQueryString(
    qs: string | null | undefined,
    options: { separator?: string | null; encodingTemplate?: EncodingTemplate | null } = {},
  ): ParamHash {
    return ParamBuilder.default.fromQueryString(qs, options);
  }

  static fromPairs(
    pairs: Iterable<QueryPair> | Iterable<[string, unknown]>,
    options: { encodingTemplate?: EncodingTemplate | null } = {},
  ): ParamHash {
    return ParamBuilder.default.fromPairs(pairs, options);
  }

  static fromHash(
    hash: ParamHash,
    options: { encodingTemplate?: EncodingTemplate | null } = {},
  ): ParamHash {
    return ParamBuilder.default.fromHash(hash, options);
  }

  fromQueryString(
    qs: string | null | undefined,
    options: { separator?: string | null; encodingTemplate?: EncodingTemplate | null } = {},
  ): ParamHash {
    return this.fromPairs(QueryParser.eachPair(qs, options.separator), {
      encodingTemplate: options.encodingTemplate,
    });
  }

  fromPairs(
    pairs: Iterable<QueryPair> | Iterable<[string, unknown]>,
    options: { encodingTemplate?: EncodingTemplate | null } = {},
  ): ParamHash {
    const params = this.makeParams();
    const encodingTemplate = options.encodingTemplate ?? null;

    try {
      for (const [k, rawV] of pairs) {
        let v = rawV as ParamValue;
        if (this.paramsHashType(v)) {
          v = new UploadedFile(v as never) as unknown as ParamValue;
        }
        this.storeNestedParam(params, k, v, 0, encodingTemplate);
      }
    } catch (e) {
      if (
        e instanceof URIError ||
        e instanceof RangeError ||
        (e instanceof Error &&
          (e.name === "ArgumentError" || e.message.startsWith("ArgumentError:")))
      ) {
        throw new InvalidParameterError(e.message);
      }
      throw e;
    }

    return params;
  }

  fromHash(
    hash: ParamHash,
    _options: { encodingTemplate?: EncodingTemplate | null } = {},
  ): ParamHash {
    return RequestUtils.normalizeEncodeParams(hash) as ParamHash;
  }

  /** @internal */
  storeNestedParam(
    params: ParamHash,
    name: string | null,
    v: ParamValue,
    depth: number,
    encodingTemplate: EncodingTemplate | null = null,
  ): ParamValue {
    return storeNestedParamImpl(this, params, name, v, depth, encodingTemplate);
  }

  /** @internal */
  makeParams(): ParamHash {
    return Object.create(null) as ParamHash;
  }

  /** @internal */
  newDepthLimit(paramDepthLimit: number): ParamBuilder {
    return new (this.constructor as typeof ParamBuilder)(paramDepthLimit);
  }

  /** @internal */
  paramsHashType(obj: unknown): obj is ParamHash {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return false;
    const proto = Object.getPrototypeOf(obj);
    return proto === null || proto === Object.prototype;
  }

  /** @internal */
  paramsHashHasKey(hash: ParamHash, key: string): boolean {
    if (key.includes("[]")) return false;
    let h: ParamValue = hash;
    for (const part of key.split(/[[\]]+/)) {
      if (part === "") continue;
      if (!this.paramsHashType(h) || !Object.hasOwn(h, part)) return false;
      h = h[part];
    }
    return true;
  }
}

function classNameOf(v: unknown): string {
  if (v === null) return "NilClass";
  if (Array.isArray(v)) return "Array";
  if (typeof v === "string") return "String";
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto === null || proto === Object.prototype) return "Hash";
    return v.constructor?.name ?? "Object";
  }
  return typeof v;
}

function storeNestedParamImpl(
  self: ParamBuilder,
  params: ParamHash,
  name: string | null,
  v: ParamValue,
  depth: number,
  encodingTemplate: EncodingTemplate | null,
): ParamValue {
  if (depth >= self.paramDepthLimit) throw new ParamsTooDeepError("param depth limit exceeded");

  let k: string;
  let after: string;

  if (name === null || name === undefined) {
    k = after = "";
  } else if (depth === 0) {
    const ignoreLeading = ParamBuilder.ignoreLeadingBrackets;
    if (ignoreLeading === true || (ignoreLeading === null && LEADING_BRACKETS_COMPAT)) {
      const m = name.match(/^([[\]]*)([^[\]]+)\]*/);
      if (m) {
        k = m[2];
        const matched = m[0];
        after = name.slice(matched.length);
        if (ignoreLeading !== true && (k !== matched || (after !== "" && !after.startsWith("[")))) {
          deprecator().warn(
            `Skipping over leading brackets in parameter name ${JSON.stringify(name)} is deprecated and will parse differently in Rails 8.1 or Rack 3.0.`,
          );
        }
      } else {
        k = name;
        after = "";
      }
    } else {
      const start = name.indexOf("[", 1);
      if (start !== -1) {
        k = name.slice(0, start);
        after = name.slice(start);
      } else {
        k = name;
        after = "";
      }
    }
  } else if (name.startsWith("[]")) {
    k = "[]";
    after = name.slice(2);
  } else if (name.startsWith("[")) {
    const end = name.indexOf("]", 1);
    if (end !== -1) {
      k = name.slice(1, end);
      after = name.slice(end + 1);
    } else {
      k = name;
      after = "";
    }
  } else {
    k = name;
    after = "";
  }

  if (k === "") return params;

  void encodingTemplate;

  if (after === "") {
    if (k === "[]" && depth !== 0) {
      return v !== null || !RequestUtils.performDeepMunge ? [v] : [];
    }
    params[k] = v;
  } else if (after === "[") {
    params[name as string] = v;
  } else if (after === "[]") {
    if (!Object.hasOwn(params, k)) params[k] = [];
    const arr = params[k];
    if (!Array.isArray(arr)) {
      throw new ParameterTypeError(`expected Array (got ${classNameOf(arr)}) for param \`${k}'`);
    }
    if (v !== null || !RequestUtils.performDeepMunge) arr.push(v);
  } else if (after.startsWith("[]")) {
    let childKey: string;
    if (after[2] === "[" && after.endsWith("]")) {
      const candidate = after.slice(3, after.length - 1);
      if (candidate !== "" && !candidate.includes("[") && !candidate.includes("]")) {
        childKey = candidate;
      } else {
        childKey = after.slice(2);
      }
    } else {
      childKey = after.slice(2);
    }
    if (!Object.hasOwn(params, k)) params[k] = [];
    const arr = params[k];
    if (!Array.isArray(arr)) {
      throw new ParameterTypeError(`expected Array (got ${classNameOf(arr)}) for param \`${k}'`);
    }
    const last = arr[arr.length - 1];
    if (self.paramsHashType(last) && !self.paramsHashHasKey(last, childKey)) {
      self.storeNestedParam(last, childKey, v, depth + 1);
    } else {
      arr.push(self.storeNestedParam(self.makeParams(), childKey, v, depth + 1));
    }
  } else {
    if (!Object.hasOwn(params, k)) params[k] = self.makeParams();
    const child = params[k];
    if (!self.paramsHashType(child)) {
      throw new ParameterTypeError(`expected Hash (got ${classNameOf(child)}) for param \`${k}'`);
    }
    params[k] = self.storeNestedParam(child, after, v, depth + 1);
  }

  return params;
}
