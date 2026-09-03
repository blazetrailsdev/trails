import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { AttributeSetCodecError, fromEnvelope, toEnvelope } from "./codec.js";
import type { AttributeSetCodec, AttributeSetCoder, AttributeSetEnvelope } from "./codec.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @noRailsEquivalent PERMANENT */
export const yamlCodec: AttributeSetCodec = {
  encode(coder: AttributeSetCoder): string {
    return yamlStringify(toEnvelope(coder), (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
  },
  decode(input: string): AttributeSetCoder {
    const parsed: unknown = yamlParse(input);
    if (
      !isPlainObject(parsed) ||
      !("v" in parsed) ||
      parsed.v !== 1 ||
      !isPlainObject(parsed.types) ||
      !isPlainObject(parsed.values)
    ) {
      throw new AttributeSetCodecError(
        "yamlCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return fromEnvelope(parsed as unknown as AttributeSetEnvelope);
  },
};
