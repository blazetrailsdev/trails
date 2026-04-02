import YAML from "yaml";
import { AttributeSet } from "../attribute-set.js";

/**
 * Encodes and decodes an AttributeSet to/from YAML.
 *
 * Mirrors: ActiveModel::AttributeSet::YAMLEncoder
 */
export class YAMLEncoder {
  private defaultTypes: Record<string, unknown>;

  constructor(defaultTypes: Record<string, unknown> = {}) {
    this.defaultTypes = defaultTypes;
  }

  encode(set: AttributeSet): string {
    return YAML.stringify(set.toHash());
  }

  decode(encoded: string): Record<string, unknown> {
    const parsed = YAML.parse(encoded);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.getPrototypeOf(parsed) !== Object.prototype
    ) {
      throw new globalThis.Error("YAMLEncoder.decode expected a YAML mapping (object)");
    }
    return parsed as Record<string, unknown>;
  }

  types(): Record<string, unknown> {
    return { ...this.defaultTypes };
  }
}
