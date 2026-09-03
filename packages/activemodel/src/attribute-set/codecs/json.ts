import { AttributeSetCodecError, fromEnvelope, toEnvelope } from "./codec.js";
import type { AttributeSetCodec, AttributeSetCoder, AttributeSetEnvelope } from "./codec.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @noRailsEquivalent PERMANENT */
export const jsonCodec: AttributeSetCodec = {
  encode(coder: AttributeSetCoder): string {
    return JSON.stringify(toEnvelope(coder), (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
  },
  decode(input: string): AttributeSetCoder {
    const parsed: unknown = JSON.parse(input);
    if (
      !isPlainObject(parsed) ||
      !("v" in parsed) ||
      parsed.v !== 1 ||
      !isPlainObject(parsed.types) ||
      !isPlainObject(parsed.values)
    ) {
      throw new AttributeSetCodecError(
        "jsonCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return fromEnvelope(parsed as unknown as AttributeSetEnvelope);
  },
};
