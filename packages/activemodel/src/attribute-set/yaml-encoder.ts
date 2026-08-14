import { Attribute, Uninitialized } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import { typeRegistry, type TypeRegistry } from "../type/registry.js";
import type { Type } from "../type/value.js";
import { jsonCodec } from "./codecs/json.js";
import {
  AttributeSetCodecError,
  type AttributeSetCodec,
  type AttributeSetEnvelope,
} from "./codecs/codec.js";

const warnedKeys = new Set<string>();

/**
 * Mirrors: ActiveModel::AttributeSet::YAMLEncoder
 *
 * Attempts to do more intelligent YAML dumping of an
 * ActiveModel::AttributeSet to reduce the size of the resulting string.
 *
 * Rails takes the model's `attribute_types` as `default_types` and encodes an
 * attribute whose type is that default as `attr.with_type(nil)`
 * (`yaml_encoder.rb:14-18`), restoring the default type on the way back in
 * (`:27-29`). trails writes that missing type as a `null` envelope key.
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
export class YAMLEncoder {
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
    const attributes: Attribute[] = [];
    attributeSet.eachValue((attr) => {
      attributes.push(attr);
    });

    const defaultAttributes = attributes
      .filter((attr) => attr instanceof Uninitialized)
      .map((attr) => attr.name);

    const conciseAttributes = attributes.filter((attr) => !(attr instanceof Uninitialized));
    const types = Object.fromEntries(
      conciseAttributes.map((attr) => [
        attr.name,
        attr.type === this.defaultTypes[attr.name] ? null : attr.type.name,
      ]),
    );
    const values = Object.fromEntries(
      conciseAttributes.map((attr) => [attr.name, attr.valueBeforeTypeCast]),
    );

    const envelope: AttributeSetEnvelope = { v: 1, types, values };
    if (defaultAttributes.length > 0) envelope.defaultAttributes = defaultAttributes;
    return this.codec.encode(envelope);
  }

  decode(input: string): AttributeSet {
    const envelope = this.codec.decode(input);

    if (envelope.v !== 1) {
      throw new AttributeSetCodecError(`envelope version v=${envelope.v} not supported`);
    }

    const attributesHash = new Map<string, Attribute>(
      Object.entries(envelope.types).map(([name, typeKey]) => {
        let type: Type;
        if (typeKey == null) {
          type = this.defaultTypes[name];
        } else {
          try {
            type = this.registry.lookup(typeKey);
          } catch {
            if (!this.silenceDriftWarnings && !warnedKeys.has(typeKey)) {
              warnedKeys.add(typeKey);
              console.warn(
                `YAMLEncoder: unknown type key "${typeKey}" — falling back to "value" type`,
              );
            }
            type = this.registry.lookup("value");
          }
        }
        return [name, Attribute.fromUser(name, envelope.values[name], type)];
      }),
    );

    for (const name of envelope.defaultAttributes ?? []) {
      attributesHash.set(name, Attribute.uninitialized(name, this.defaultTypes[name]));
    }

    return new AttributeSet(attributesHash);
  }
}
