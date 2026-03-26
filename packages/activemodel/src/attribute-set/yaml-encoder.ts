import YAML from "yaml";
import { AttributeSet } from "./builder.js";

/**
 * Encodes and decodes an AttributeSet to/from YAML.
 *
 * Mirrors: ActiveModel::AttributeSet::YAMLEncoder
 */
export class YAMLEncoder {
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

  types(): Record<string, string> {
    return {};
  }
}
