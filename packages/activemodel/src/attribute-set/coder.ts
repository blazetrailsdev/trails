import { Attribute, Uninitialized } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import { typeRegistry, type TypeRegistry } from "../type/registry.js";
import type { Type } from "../type/value.js";
import { jsonCodec } from "./codecs/json.js";

export interface AttributeSetEnvelope {
  v: 1;
  /**
   * attr → registry type key (e.g. "string", "integer", "decimal"), or `null`
   * for `attr.with_type(nil)` (`yaml_encoder.rb:15`) — the attribute's type is
   * the model's default type for that name, so it is not written out.
   */
  types: Record<string, string | null>;
  /** attr → raw value before type-cast (valueBeforeTypeCast) */
  values: Record<string, unknown>;
  /** attrs that were Uninitialized when encoded */
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
 * Mirrors: ActiveModel::AttributeSet::YAMLEncoder
 *
 * Rails takes the model's `attribute_types` as `default_types` and drops the
 * type from any attribute whose type is that default (`yaml_encoder.rb:13-19`),
 * restoring it on the way back in (`:23-33`). trails keeps that contract.
 *
 * Two things Rails gets from Psych and trails has to carry itself, both
 * consequences of the wire format rather than choices:
 *
 * - Psych dumps a non-default `Type` object inline; JSON cannot, so a
 *   non-default type travels as its registry key and comes back through
 *   `registry`. An unknown key falls back to the "value" type with a one-time
 *   warning per key (opt out with `silenceDriftWarnings`).
 * - Psych round-trips an `Attribute::Uninitialized` as itself; a JSON envelope
 *   has no value to carry for one, so those names are listed in
 *   `defaultAttributes` and rebuilt as `Uninitialized` on decode.
 */
export class AttributeSetCoder {
  private defaultTypes: Record<string, Type>;
  private registry: TypeRegistry;
  private codec: AttributeSetCodec;
  private silenceDriftWarnings: boolean;

  constructor(
    defaultTypes: Record<string, Type>,
    opts: {
      registry?: TypeRegistry;
      codec?: AttributeSetCodec;
      silenceDriftWarnings?: boolean;
    } = {},
  ) {
    this.defaultTypes = defaultTypes;
    this.registry = opts.registry ?? typeRegistry;
    this.codec = opts.codec ?? jsonCodec;
    this.silenceDriftWarnings = opts.silenceDriftWarnings ?? false;
  }

  encode(attributeSet: AttributeSet): string {
    const types: Record<string, string | null> = {};
    const values: Record<string, unknown> = {};
    const defaultAttributes: string[] = [];

    attributeSet.forEach((attr, name) => {
      if (attr instanceof Uninitialized) {
        defaultAttributes.push(name);
        return;
      }
      // `attr.type.equal?(default_types[attr.name]) ? attr.with_type(nil) : attr`
      // (`yaml_encoder.rb:14-18`).
      types[name] = attr.type === this.defaultTypes[name] ? null : attr.type.name;
      values[name] = attr.valueBeforeTypeCast;
    });

    const envelope: AttributeSetEnvelope = { v: 1, types, values };
    if (defaultAttributes.length > 0) envelope.defaultAttributes = defaultAttributes;
    return this.codec.encode(envelope);
  }

  decode(input: string): AttributeSet {
    const envelope = this.codec.decode(input);

    if (envelope.v !== 1) {
      throw new AttributeSetCoderError(`envelope version v=${envelope.v} not supported`);
    }

    const attributesHash = new Map<string, Attribute>();

    for (const [name, typeKey] of Object.entries(envelope.types)) {
      // `attr = attr.with_type(default_types[attr.name]) if attr.type.nil?`
      // (`yaml_encoder.rb:27-29`).
      const type = typeKey == null ? this.defaultTypes[name] : this.lookupType(typeKey);
      attributesHash.set(name, Attribute.fromUser(name, envelope.values[name], type));
    }

    for (const name of envelope.defaultAttributes ?? []) {
      attributesHash.set(name, Attribute.uninitialized(name, this.defaultTypes[name]));
    }

    return new AttributeSet(attributesHash);
  }

  private lookupType(typeKey: string): Type {
    try {
      return this.registry.lookup(typeKey);
    } catch {
      if (!this.silenceDriftWarnings && !warnedKeys.has(typeKey)) {
        warnedKeys.add(typeKey);
        console.warn(
          `AttributeSetCoder: unknown type key "${typeKey}" — falling back to "value" type`,
        );
      }
      return this.registry.lookup("value");
    }
  }
}
