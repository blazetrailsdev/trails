import { AttributeSetCoderError } from "../coder.js";
import type { AttributeSetCodec, AttributeSetEnvelope } from "../coder.js";

/**
 * Default JSON codec for AttributeSetCoder.
 *
 * Known JSON format limitations (Rails YAMLEncoder stores full Ruby objects
 * and is not subject to these constraints):
 * - Type constructor params (precision, scale, limit) are not preserved — type
 *   is reconstructed from the registry with default params on decode.
 * - Binary attributes with non-string raw values (Uint8Array, Buffer) are not
 *   JSON-serializable and will corrupt on round-trip.
 * - Float specials (NaN, Infinity, -Infinity) serialize to null via
 *   JSON.stringify and decode as null.
 * - Symbol-valued raw values (e.g. DateInfinity sentinel) are silently dropped
 *   by JSON.stringify; those attributes decode with undefined raw value.
 */
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
      !isPlainObject((parsed as Record<string, unknown>).types) ||
      !isPlainObject((parsed as Record<string, unknown>).values)
    ) {
      throw new AttributeSetCoderError(
        "jsonCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return parsed as unknown as AttributeSetEnvelope;
  },
};
