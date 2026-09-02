import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { AttributeSetCodecError } from "./codec.js";
import type { AttributeSetCodec, AttributeSetEnvelope } from "./codec.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @noRailsEquivalent PERMANENT */
export const yamlCodec: AttributeSetCodec = {
  encode(envelope: AttributeSetEnvelope): string {
    return yamlStringify(envelope, (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
  },
  decode(input: string): AttributeSetEnvelope {
    const parsed: unknown = yamlParse(input);
    if (
      !isPlainObject(parsed) ||
      !("v" in parsed) ||
      !isPlainObject(parsed.types) ||
      !isPlainObject(parsed.values)
    ) {
      throw new AttributeSetCodecError(
        "yamlCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return parsed as unknown as AttributeSetEnvelope;
  },
};
