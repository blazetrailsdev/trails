/**
 * The wire contract Psych supplies in Ruby.
 *
 * Rails' `AttributeSet::YAMLEncoder` hands the attributes to a `Psych::Coder`
 * and lets Psych dump the `Attribute` objects themselves
 * (`yaml_encoder.rb:13-19`). JS has no Psych, so the serialized shape and the
 * codec that writes it live here, outside the Rails-matched encoder file.
 */
export interface AttributeSetEnvelope {
  v: 1;
  /**
   * attr → registry type key (e.g. "string", "integer", "decimal"), or `null`
   * for `attr.with_type(nil)` (`yaml_encoder.rb:15`) — the attribute's type is
   * the model's default type for that name, so it is not written out.
   */
  types: Record<string, string | null>;
  /** attr → raw value before type-cast (valueBeforeTypeCast) */
  values: Record<string, unknown>;
  /** attrs that were Uninitialized when encoded */
  defaultAttributes?: string[];
}

export interface AttributeSetCodec {
  encode(envelope: AttributeSetEnvelope): string;
  decode(input: string): AttributeSetEnvelope;
}

export class AttributeSetCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributeSetCodecError";
  }
}
