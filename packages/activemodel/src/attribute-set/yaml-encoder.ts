import { Attribute, Uninitialized } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import { typeRegistry, type TypeRegistry } from "../type/registry.js";
import { defaultValue } from "../type.js";
import type { Type } from "../type/value.js";
import { jsonCodec } from "./codecs/json.js";
import {
  AttributeSetCodecError,
  type AttributeSetCodec,
  type AttributeSetEnvelope,
} from "./codecs/codec.js";

const warnedKeys = new Set<string>();

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

  decode(coder: string): AttributeSet {
    const envelope = this.codec.decode(coder);

    if (envelope.v !== 1) {
      throw new AttributeSetCodecError(`envelope version v=${envelope.v} not supported`);
    }

    const attributesHash: Record<string, Attribute> = Object.fromEntries(
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
            type = defaultValue();
          }
        }
        return [name, Attribute.fromUser(name, envelope.values[name], type)];
      }),
    );

    for (const name of envelope.defaultAttributes ?? []) {
      attributesHash[name] = Attribute.uninitialized(name, this.defaultTypes[name]);
    }

    return new AttributeSet(attributesHash);
  }
}
