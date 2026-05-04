import { Attribute, Uninitialized } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import type { TypeRegistry } from "../type/registry.js";
import { jsonCodec } from "./codecs/json.js";

export interface AttributeSetEnvelope {
  v: 1;
  /** attr → registry type key (e.g. "string", "integer", "decimal") */
  types: Record<string, string>;
  /** attr → raw value before type-cast (valueBeforeTypeCast) */
  values: Record<string, unknown>;
  /**
   * Reserved for future use: type keys for attrs that existed in the envelope
   * but were absent from the schema at decode time. Not written by encode() in
   * this release — such attrs are stored in `types` alongside schema-matched
   * ones and kept as additional attributes on the decoded set.
   */
  additionalTypes?: Record<string, string>;
  /** attrs that should resolve to the schema default on decode */
  defaultAttributes?: string[];
}

export interface AttributeSetCodec {
  encode(envelope: AttributeSetEnvelope): string;
  decode(input: string): AttributeSetEnvelope;
}

export class AttributeSetCoderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributeSetCoderError";
  }
}

const warnedKeys = new Set<string>();

/**
 * Format-agnostic encoder/decoder for AttributeSet.
 * Delegates wire format to an injected codec (default: JSON).
 *
 * Schema-drift policy on decode:
 * - Unknown type key: falls back to "value" type + one-time console.warn per key (opt-out via silenceDriftWarnings).
 * - v mismatch: throws AttributeSetCoderError.
 * - Attr in envelope but not in schemaAttributes: kept as an additional attribute with the envelope type.
 * - Attr in schemaAttributes but not in envelope AND in defaultAttributes: restored from schema (preserves schema default).
 * - Attr in schemaAttributes but not in envelope AND not in defaultAttributes: set to Uninitialized.
 *
 * Type reconstruction on decode:
 * - When schemaAttributes is provided and the schema type name matches the envelope type key,
 *   the schema attr's type is used directly (preserving precision/scale/limit and AR-specific types).
 * - Otherwise the registry is queried by the envelope type key.
 *
 * Mirrors: ActiveModel::AttributeSet::YAMLEncoder
 */
export class AttributeSetCoder {
  private registry: TypeRegistry;
  private codec: AttributeSetCodec;
  private silenceDriftWarnings: boolean;

  constructor(
    registry: TypeRegistry,
    opts: { codec?: AttributeSetCodec; silenceDriftWarnings?: boolean } = {},
  ) {
    this.registry = registry;
    this.codec = opts.codec ?? jsonCodec;
    this.silenceDriftWarnings = opts.silenceDriftWarnings ?? false;
  }

  encode(set: AttributeSet): string {
    const types: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const defaultAttributes: string[] = [];

    set.forEach((attr, name) => {
      if (attr instanceof Uninitialized) {
        defaultAttributes.push(name);
        return;
      }
      types[name] = attr.type.name;
      values[name] = attr.valueBeforeTypeCast;
    });

    const envelope: AttributeSetEnvelope = { v: 1, types, values };
    if (defaultAttributes.length > 0) envelope.defaultAttributes = defaultAttributes;
    return this.codec.encode(envelope);
  }

  decode(input: string, schemaAttributes?: Map<string, Attribute>): AttributeSet {
    const envelope = this.codec.decode(input);

    if (envelope.v !== 1) {
      throw new AttributeSetCoderError(`envelope version v=${envelope.v} not supported`);
    }

    const attrs = new Map<string, Attribute>();

    for (const [name, typeKey] of Object.entries(envelope.types)) {
      const schemaAttr = schemaAttributes?.get(name);
      const schemaType =
        schemaAttr && !(schemaAttr instanceof Uninitialized) ? schemaAttr.type : undefined;

      let type;
      if (schemaType && schemaType.name === typeKey) {
        // Schema type matches envelope key — use the schema instance directly so
        // precision/scale/limit and AR-specific types (uuid, jsonb, etc.) are preserved.
        type = schemaType;
      } else {
        try {
          type = this.registry.lookup(typeKey);
        } catch {
          if (!this.silenceDriftWarnings && !warnedKeys.has(typeKey)) {
            warnedKeys.add(typeKey);
            console.warn(
              `AttributeSetCoder: unknown type key "${typeKey}" — falling back to "value" type`,
            );
          }
          type = this.registry.lookup("value");
        }
      }
      const rawValue = envelope.values[name];
      attrs.set(name, Attribute.fromUser(name, rawValue, type));
    }

    if (schemaAttributes) {
      const defaultAttrSet = new Set(envelope.defaultAttributes ?? []);
      for (const [name, schemaAttr] of schemaAttributes) {
        if (attrs.has(name)) continue;
        if (defaultAttrSet.has(name)) {
          attrs.set(
            name,
            schemaAttr instanceof Uninitialized ? schemaAttr : schemaAttr.withType(schemaAttr.type),
          );
        } else {
          attrs.set(
            name,
            schemaAttr instanceof Uninitialized
              ? schemaAttr
              : new Uninitialized(name, schemaAttr.type),
          );
        }
      }
    }

    return new AttributeSet(attrs);
  }
}
