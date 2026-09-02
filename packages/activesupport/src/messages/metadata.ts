import { coder } from "../cache/coder.js";
import { ActiveSupportJSON } from "../json.js";
import { Encoding } from "../json/encoding.js";
import { MessagePack } from "../message-pack/index.js";
import { Temporal } from "@blazetrails/date";
import { currentTimeInstant } from "../time-travel.js";
import type { MessageSerializer } from "./codec.js";
import { ArgumentError, SERIALIZERS, Thrown } from "./serializer-with-fallback.js";

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
  /** Mirrors: Metadata.use_message_serializer_for_metadata (messages/metadata.rb:10). */
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
  protected abstract encode(data: string | Buffer, options?: { urlSafe?: boolean }): string;
  protected abstract decode(encoded: string, options?: { urlSafe?: boolean }): Buffer;
  protected abstract serialize(data: unknown): unknown;
  protected abstract deserialize(serialized: string): unknown;

  protected serializeWithMetadata(data: unknown, metadata: MetadataOptions = {}): unknown {
    const hasMetadata = Object.values(metadata).some(isPresent);

    if (hasMetadata && !this.useMessageSerializerForMetadata()) {
      const dataString = this.serializeToJsonSafeString(data);
      const envelope = this.wrapInMetadataLegacyEnvelope({ message: dataString }, metadata);
      return this.serializeToJson(envelope);
    } else {
      if (hasMetadata) data = this.wrapInMetadataEnvelope({ data }, metadata);
      return this.serialize(data);
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

  /**
   * @missingRailsCall utc — PERMANENT: `Time.now.utc >= parse_expiry(...)`
   *   (messages/metadata.rb:81). trails reads the clock as a
   *   `Temporal.Instant`, which by construction carries no offset to drop, so
   *   `Time#utc` has no receiver here to call it on — the same seat that makes
   *   `advance` and `iso8601` below PERMANENT.
   */
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

  /**
   * @missingRailsCall utc — PERMANENT: `expires_at.utc` / `Time.now.utc.advance(...)`
   *   (messages/metadata.rb:100-105). Same seat as `extractFromMetadataEnvelope`
   *   above: the expiry is a `Temporal.Instant`, absolute by construction, so
   *   there is no offset for `Time#utc` to drop and no receiver to call it on.
   * @missingRailsCall advance — PERMANENT: Rails advances a `Time` with
   *   `Time.now.utc.advance(seconds:)`; trails' `Time` analogue is
   *   `Temporal.Instant`, whose equivalent is `add({ milliseconds })`.
   */
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

  /**
   * @missingRailsCall iso8601 — PERMANENT: Rails parses with `Time.iso8601`; trails parses
   *   the same ISO 8601 string with `Temporal.Instant.from`.
   * @missingRailsCall parse — PERMANENT: Both branches are ported; Ruby's lenient
   *   `Time.parse` has no Temporal equivalent, so the non-standard-format branch
   *   parses with `new Date(...)` and converts to a `Temporal.Instant`, which is
   *   the same parse under a different call name.
   */
  protected parseExpiry(expiresAt: string | Temporal.Instant): Temporal.Instant {
    if (typeof expiresAt !== "string") {
      return expiresAt;
    } else if (Encoding.useStandardJsonTimeFormat) {
      return Temporal.Instant.from(expiresAt);
    } else {
      // boundary: Ruby's lenient `Time.parse` has no Temporal equivalent; `Date` parses
      // the non-ISO string and the result is handed straight back as an `Instant`.
      const parsed = new Date(expiresAt).getTime();
      if (Number.isNaN(parsed))
        throw new ArgumentError(`no time information in ${JSON.stringify(expiresAt)}`);
      return Temporal.Instant.fromEpochMilliseconds(parsed);
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
    // Ruby's `encode` is `::Base64.strict_encode64`, which raises on anything
    // but a String — the narrowing `serializer.dump`'s duck type does not state
    // (messages/codec.rb:35-37).
    return this.encode(this.serialize(data) as string, { urlSafe: false });
  }

  protected deserializeFromJsonSafeString(string: string): unknown {
    return this.deserialize(this.decode(string, { urlSafe: false }).toString("latin1"));
  }
}
