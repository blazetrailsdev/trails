import type { Attribute } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import type { ValueType } from "../type/value.js";

export class YAMLEncoder {
  private defaultTypes: Record<string, ValueType>;

  constructor(defaultTypes: Record<string, ValueType>) {
    this.defaultTypes = defaultTypes;
  }

  encode(attributeSet: AttributeSet, coder: Record<string, unknown>): void {
    const eachValue: Attribute[] = [];
    attributeSet.eachValue((attr) => eachValue.push(attr));

    coder["concise_attributes"] = eachValue.map((attr) => {
      if (attr.type === this.defaultTypes[attr.name!]) {
        return attr.withType(null);
      } else {
        return attr;
      }
    });
  }

  decode(coder: Record<string, unknown>): AttributeSet {
    if (coder["attributes"] != null) {
      return coder["attributes"] as AttributeSet;
    } else {
      const attributesHash = Object.fromEntries(
        (coder["concise_attributes"] as Attribute[]).map((attr) => {
          if (attr.type == null) {
            attr = attr.withType(this.defaultTypes[attr.name!]);
          }
          return [attr.name, attr];
        }),
      );
      return new AttributeSet(attributesHash);
    }
  }
}
