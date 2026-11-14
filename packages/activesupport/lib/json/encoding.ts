import { fetch, rbObjDup, toS } from "@blazetrails/ruby-compat";
import { asJson, Float, isPlainObject } from "../core-ext/object/json.js";

export interface EncodeOptions {
  only?: string | number | Array<string | number>;
  except?: string | number | Array<string | number>;
  escapeHtmlEntities?: boolean;
  [key: string]: unknown;
}

export class JSONGemEncoder {
  static toString(): string {
    return "ActiveSupport::JSON::Encoding::JSONGemEncoder";
  }

  readonly options: EncodeOptions;

  constructor(options?: EncodeOptions | null) {
    this.options = options ?? {};
  }

  encode(value: unknown): string {
    if (Object.keys(this.options).length !== 0) {
      value = asJson(value, Object.freeze(rbObjDup(this.options)));
    }
    let json = this.stringify(this.jsonify(value));

    const escapeHtmlEntities = fetch<unknown>(
      this.options as Record<string, unknown>,
      "escapeHtmlEntities",
      Encoding.escapeHtmlEntitiesInJson,
    );
    if (escapeHtmlEntities != null && escapeHtmlEntities !== false) {
      json = json.replaceAll(">", "\\u003e");
      json = json.replaceAll("<", "\\u003c");
      json = json.replaceAll("&", "\\u0026");
    }
    json = json.replaceAll("\u2028", "\\u2028");
    json = json.replaceAll("\u2029", "\\u2029");
    return json;
  }

  private jsonify(value: unknown): unknown {
    if (
      typeof value === "string" ||
      typeof value === "bigint" ||
      value == null ||
      value === true ||
      value === false
    ) {
      return value;
    } else if (typeof value === "number" || value instanceof Number) {
      return Float.asJson(value as number);
    } else if (value instanceof Map) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of value) {
        result[toS(k)] = this.jsonify(v);
      }
      return result;
    } else if (isPlainObject(value as object)) {
      return this._jsonifyPlainObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      return this._jsonifyArray(value);
    } else {
      return this.jsonify(asJson(value));
    }
  }

  /** @perf 18% — PERMANENT */
  private _jsonifyPlainObject(value: Record<string, unknown>): unknown {
    let result: Record<string, unknown> | null = null;
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = value[k];
      const jsonified = this.jsonify(v);
      if (result === null) {
        if (jsonified === v) continue;
        result = {};
        for (let j = 0; j < i; j++) result[keys[j]] = value[keys[j]];
      }
      result[k] = jsonified;
    }
    return result ?? value;
  }

  /** @perf 18% — PERMANENT */
  private _jsonifyArray(value: unknown[]): unknown {
    let result: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      const jsonified = this.jsonify(v);
      if (result === null) {
        if (jsonified === v) continue;
        result = value.slice(0, i);
      }
      result.push(jsonified);
    }
    return result ?? value;
  }

  /** @missingRailsCall generate — PERMANENT */
  private stringify(jsonified: unknown): string {
    return JSON.stringify(jsonified) ?? "null";
  }
}

let _useStandardJsonTimeFormat = true;
let _escapeHtmlEntitiesInJson = true;
let _jsonEncoder: typeof JSONGemEncoder = JSONGemEncoder;
let _timePrecision = 3;

export class Encoding {
  static get useStandardJsonTimeFormat(): boolean {
    return _useStandardJsonTimeFormat;
  }

  static set useStandardJsonTimeFormat(value: boolean) {
    _useStandardJsonTimeFormat = value;
  }

  static get escapeHtmlEntitiesInJson(): boolean {
    return _escapeHtmlEntitiesInJson;
  }

  static set escapeHtmlEntitiesInJson(value: boolean) {
    _escapeHtmlEntitiesInJson = value;
  }

  static get timePrecision(): number {
    return _timePrecision;
  }

  static set timePrecision(value: number) {
    _timePrecision = value;
  }

  static get jsonEncoder(): typeof JSONGemEncoder {
    return _jsonEncoder;
  }

  static set jsonEncoder(value: typeof JSONGemEncoder) {
    _jsonEncoder = value;
  }
}
