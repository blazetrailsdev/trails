import { AttributeSetCodecError } from "./codec.js";
import type { AttributeSetCodec, AttributeSetEnvelope } from "./codec.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export const jsonCodec: AttributeSetCodec = {
  encode(envelope: AttributeSetEnvelope): string {
    return JSON.stringify(envelope, (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
  },
  decode(input: string): AttributeSetEnvelope {
    const parsed: unknown = JSON.parse(input);
    if (
      !isPlainObject(parsed) ||
      !("v" in parsed) ||
      !isPlainObject(parsed.types) ||
      !isPlainObject(parsed.values)
    ) {
      throw new AttributeSetCodecError(
        "jsonCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return parsed as unknown as AttributeSetEnvelope;
  },
};
