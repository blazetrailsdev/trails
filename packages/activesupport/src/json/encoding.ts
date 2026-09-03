import { fetch } from "@blazetrails/ruby-compat";
import { asJson, Float, isPlainObject } from "../core-ext/object/json.js";
import { isEmpty } from "@blazetrails/ruby-compat";

export interface EncodeOptions {
  only?: string | number | Array<string | number>;
  except?: string | number | Array<string | number>;
  escapeHtmlEntities?: boolean;
  [key: string]: unknown;
}

export class JSONGemEncoder {
  readonly options: EncodeOptions;

  constructor(options?: EncodeOptions | null) {
    this.options = options ?? {};
  }

  encode(value: unknown): string {
    if (!isEmpty(this.options)) {
      value = asJson(value, this.options);
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
    } else if (typeof value === "number") {
      return Float.asJson(value);
    } else if (value instanceof Map || isPlainObject(value as object)) {
      const result: Record<string, unknown> = {};
      const entries = value instanceof Map ? value.entries() : Object.entries(value as object);
      for (const [k, v] of entries) {
        result[String(k)] = this.jsonify(v);
      }
      return result;
    } else if (Array.isArray(value)) {
      return value.map((v) => this.jsonify(v));
    } else {
      return this.jsonify(asJson(value));
    }
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
