import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { AttributeSetCoderError } from "../coder.js";
import type { AttributeSetCodec, AttributeSetEnvelope } from "../coder.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export const yamlCodec: AttributeSetCodec = {
  encode(envelope: AttributeSetEnvelope): string {
    return yamlStringify(envelope);
  },
  decode(input: string): AttributeSetEnvelope {
    const parsed: unknown = yamlParse(input);
    if (
      !isPlainObject(parsed) ||
      !("v" in parsed) ||
      !isPlainObject((parsed as Record<string, unknown>).types) ||
      !isPlainObject((parsed as Record<string, unknown>).values)
    ) {
      throw new AttributeSetCoderError(
        "yamlCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return parsed as unknown as AttributeSetEnvelope;
  },
};
