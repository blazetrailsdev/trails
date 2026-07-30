import { coder } from "../cache/coder.js";
import { ActiveSupportJSON } from "../json.js";
import { MessagePack } from "../message-pack/index.js";
import { Temporal } from "../temporal.js";
import { currentTimeInstant } from "../time-travel.js";
import type { MessageSerializer } from "./codec.js";
import { SERIALIZERS, Thrown } from "./serializer-with-fallback.js";

export interface MetadataOptions {
  expiresAt?: Temporal.Instant | null;
  expiresIn?: number | null;
  purpose?: unknown;
}

export interface ExpectedMetadataOptions {
  purpose?: unknown;
}

function toS(value: unknown): string {
  return value == null ? "" : String(value);
}

function isPresent(value: unknown): boolean {
  return value != null && value !== false;
}

export abstract class Metadata {
  /** @internal */
  static useMessageSerializerForMetadata = false;

  static readonly ENVELOPE_SERIALIZERS: readonly unknown[] = [
    ...Object.values(SERIALIZERS),
    coder,
    MessagePack,
  ];

  static readonly TIMESTAMP_SERIALIZERS: readonly unknown[] = [
    SERIALIZERS.message_pack,
    SERIALIZERS.message_pack_allow_marshal,
    MessagePack,
  ];

  protected abstract readonly serializer: MessageSerializer;
  protected abstract encode(data: string | Buffer, urlSafe?: boolean): string;
  protected abstract decode(encoded: string, urlSafe?: boolean): Buffer;
  protected abstract serialize(data: unknown): string;
  protected abstract deserialize(serialized: string): unknown;

  protected serializeWithMetadata(data: unknown, metadata: MetadataOptions = {}): string {
    const hasMetadata = Object.values(metadata).some(isPresent);

    if (hasMetadata && !this.useMessageSerializerForMetadata()) {
      const dataString = this.serializeToJsonSafeString(data);
      const envelope = this.wrapInMetadataLegacyEnvelope({ message: dataString }, metadata);
      return this.serializeToJson(envelope);
    } else {
      const wrapped = hasMetadata ? this.wrapInMetadataEnvelope({ data }, metadata) : data;
      return this.serialize(wrapped);
    }
  }

  protected deserializeWithMetadata(
    message: string,
    expectedMetadata: ExpectedMetadataOptions = {},
  ): unknown {
    if (this.dualSerializedMetadataEnvelopeJson(message)) {
      const envelope = this.deserializeFromJson(message);
      const extracted = this.extractFromMetadataEnvelope(envelope, expectedMetadata);
      return this.deserializeFromJsonSafeString(extracted.message as string);
    } else {
      const deserialized = this.deserialize(message);
      if (this.metadataEnvelope(deserialized)) {
        return this.extractFromMetadataEnvelope(deserialized, expectedMetadata).data;
      } else if (!Object.values(expectedMetadata).some(isPresent)) {
        return deserialized;
      } else {
        throw new Thrown("invalid_message_content", "missing metadata");
      }
    }
  }

  protected useMessageSerializerForMetadata(): boolean {
    return (
      Metadata.useMessageSerializerForMetadata &&
      Metadata.ENVELOPE_SERIALIZERS.includes(this.serializer)
    );
  }

  protected wrapInMetadataEnvelope(
    hash: Record<string, unknown>,
    { expiresAt = null, expiresIn = null, purpose = null }: MetadataOptions = {},
  ): Record<string, unknown> {
    const expiry = this.pickExpiry(expiresAt, expiresIn);
    if (isPresent(expiry)) hash.exp = expiry;
    if (isPresent(purpose)) hash.pur = toS(purpose);
    return { _rails: hash };
  }

  protected wrapInMetadataLegacyEnvelope(
    hash: Record<string, unknown>,
    { expiresAt = null, expiresIn = null, purpose = null }: MetadataOptions = {},
  ): Record<string, unknown> {
    const expiry = this.pickExpiry(expiresAt, expiresIn);
    hash.exp = expiry ?? null;
    hash.pur = purpose ?? null;
    return { _rails: hash };
  }

  protected extractFromMetadataEnvelope(
    envelope: unknown,
    { purpose = null }: ExpectedMetadataOptions = {},
  ): Record<string, unknown> {
    const hash = (envelope as Record<string, unknown>)._rails as Record<string, unknown>;

    if (isPresent(hash.exp)) {
      const expiry = this.parseExpiry(hash.exp as string | Temporal.Instant);
      if (Temporal.Instant.compare(currentTimeInstant(), expiry) >= 0) {
        throw new Thrown("invalid_message_content", "expired");
      }
    }

    if (toS(hash.pur) !== toS(purpose)) {
      throw new Thrown("invalid_message_content", "mismatched purpose");
    }

    return hash;
  }

  protected metadataEnvelope(object: unknown): boolean {
    return typeof object === "object" && object !== null && "_rails" in object;
  }

  protected dualSerializedMetadataEnvelopeJson(string: string): boolean {
    return string.startsWith('{"_rails":{"message":');
  }

  protected pickExpiry(
    expiresAt: Temporal.Instant | null | undefined,
    expiresIn: number | null | undefined,
  ): Temporal.Instant | string | undefined {
    let expiry: Temporal.Instant | undefined;
    if (isPresent(expiresAt)) {
      expiry = expiresAt!;
    } else if (isPresent(expiresIn)) {
      expiry = currentTimeInstant().add({ milliseconds: Math.round(expiresIn! * 1000) });
    }

    if (!Metadata.TIMESTAMP_SERIALIZERS.includes(this.serializer)) {
      return expiry?.toString({ smallestUnit: "millisecond" });
    }

    return expiry;
  }

  protected parseExpiry(expiresAt: string | Temporal.Instant): Temporal.Instant {
    if (typeof expiresAt !== "string") {
      return expiresAt;
    } else {
      return Temporal.Instant.from(expiresAt);
    }
  }

  protected serializeToJson(data: unknown): string {
    return ActiveSupportJSON.encode(data);
  }

  protected deserializeFromJson(serialized: string): unknown {
    try {
      return ActiveSupportJSON.decode(serialized);
    } catch (error) {
      // Throw :invalid_message_format instead of :invalid_message_serialization
      // because here a parse error is due to a bad message rather than an
      // incompatible `self.serializer`.
      throw new Thrown("invalid_message_format", error);
    }
  }

  protected serializeToJsonSafeString(data: unknown): string {
    return this.encode(this.serialize(data), false);
  }

  protected deserializeFromJsonSafeString(string: string): unknown {
    return this.deserialize(this.decode(string, false).toString("latin1"));
  }
}
