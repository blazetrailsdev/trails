import type { Attribute } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import type { Type } from "../type/value.js";
import type { AttributeSetCoder } from "./codecs/codec.js";

export class YAMLEncoder {
  private defaultTypes: Record<string, Type>;

  constructor(defaultTypes: Record<string, Type>) {
    this.defaultTypes = defaultTypes;
  }

  encode(attributeSet: AttributeSet, coder: AttributeSetCoder): void {
    const eachValue: Attribute[] = [];
    attributeSet.eachValue((attr) => eachValue.push(attr));

    coder.conciseAttributes = eachValue.map((attr) => {
      if (attr.type === this.defaultTypes[attr.name]) {
        return attr.withType(null);
      } else {
        return attr;
      }
    });
  }

  decode(coder: AttributeSetCoder): AttributeSet {
    if (coder.attributes != null) {
      return coder.attributes;
    } else {
      const attributesHash = Object.fromEntries(
        coder.conciseAttributes!.map((attr) => {
          if (attr.type == null) {
            attr = attr.withType(this.defaultTypes[attr.name]);
          }
          return [attr.name, attr];
        }),
      );
      return new AttributeSet(attributesHash);
    }
  }
}
