export interface AttributeSetEnvelope {
  v: 1;
  types: Record<string, string | null>;
  values: Record<string, unknown>;
  defaultAttributes?: string[];
}

export interface AttributeSetCodec {
  encode(envelope: AttributeSetEnvelope): string;
  decode(input: string): AttributeSetEnvelope;
}

/** @noRailsEquivalent PERMANENT */
export class AttributeSetCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributeSetCodecError";
  }
}
