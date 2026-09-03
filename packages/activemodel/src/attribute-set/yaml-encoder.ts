import { Attribute, Uninitialized } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import { typeRegistry } from "../type/registry.js";
import { defaultValue } from "../type.js";
import type { Type } from "../type/value.js";
import type { AttributeSetEnvelope } from "./codecs/codec.js";

const warnedKeys = new Set<string>();

export class YAMLEncoder {
  private defaultTypes: Record<string, Type>;

  constructor(defaultTypes: Record<string, Type>) {
    this.defaultTypes = defaultTypes;
  }

  encode(attributeSet: AttributeSet, coder: AttributeSetEnvelope): void {
    const attributes: Attribute[] = [];
    attributeSet.eachValue((attr) => {
      attributes.push(attr);
    });

    const defaultAttributes = attributes
      .filter((attr) => attr instanceof Uninitialized)
      .map((attr) => attr.name);

    const conciseAttributes = attributes.filter((attr) => !(attr instanceof Uninitialized));

    coder.v = 1;
    coder.types = Object.fromEntries(
      conciseAttributes.map((attr) => [
        attr.name,
        attr.type === this.defaultTypes[attr.name] ? null : attr.type.name,
      ]),
    );
    coder.values = Object.fromEntries(
      conciseAttributes.map((attr) => [attr.name, attr.valueBeforeTypeCast]),
    );
    if (defaultAttributes.length > 0) coder.defaultAttributes = defaultAttributes;
  }

  decode(coder: AttributeSetEnvelope): AttributeSet {
    const attributesHash: Record<string, Attribute> = Object.fromEntries(
      Object.entries(coder.types).map(([name, typeKey]) => {
        let type: Type;
        if (typeKey == null) {
          type = this.defaultTypes[name];
        } else {
          try {
            type = typeRegistry.lookup(typeKey);
          } catch {
            if (!warnedKeys.has(typeKey)) {
              warnedKeys.add(typeKey);
              console.warn(
                `YAMLEncoder: unknown type key "${typeKey}" — falling back to "value" type`,
              );
            }
            type = defaultValue();
          }
        }
        return [name, Attribute.fromUser(name, coder.values[name], type)];
      }),
    );

    for (const name of coder.defaultAttributes ?? []) {
      attributesHash[name] = Attribute.uninitialized(name, this.defaultTypes[name]);
    }

    return new AttributeSet(attributesHash);
  }
}
