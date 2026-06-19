import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { AttributeSetCoderError } from "../coder.js";
import type { AttributeSetCodec, AttributeSetEnvelope } from "../coder.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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
      throw new AttributeSetCoderError(
        "yamlCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return parsed as unknown as AttributeSetEnvelope;
  },
};
