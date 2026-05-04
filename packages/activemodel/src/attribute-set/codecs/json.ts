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
 */
export const jsonCodec: AttributeSetCodec = {
  encode(envelope: AttributeSetEnvelope): string {
    return JSON.stringify(envelope);
  },
  decode(input: string): AttributeSetEnvelope {
    const parsed: unknown = JSON.parse(input);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("v" in parsed) ||
      !("types" in parsed) ||
      !("values" in parsed)
    ) {
      throw new AttributeSetCoderError(
        "jsonCodec.decode: input is not a valid AttributeSetEnvelope",
      );
    }
    return parsed as AttributeSetEnvelope;
  },
};
