/**
 * Mirrors Rails `ActiveSupport::Messages::Metadata` (messages/metadata.rb) —
 * the metadata envelope shared by `MessageVerifier` and `MessageEncryptor`:
 * `expires_at:` / `expires_in:` / `purpose:` are wrapped under a `"_rails"`
 * key, either through the codec's own serializer (the modern format) or through
 * a JSON envelope carrying a Base64 string of the serialized message (the
 * legacy, dual-serialized format).
 *
 * Rails mixes this in with `include Metadata`; see `Codec` for why the TS port
 * extends it instead.
 */

import { coder } from "../cache/coder.js";
import { ActiveSupportJSON } from "../json.js";
import { MessagePack } from "../message-pack/index.js";
import { Temporal } from "../temporal.js";
import { currentTimeInstant } from "../time-travel.js";
import type { MessageSerializer } from "./codec.js";
import { SERIALIZERS, Thrown } from "./serializer-with-fallback.js";

/** `purpose` is `unknown` because Rails only ever compares it through `to_s`. */
export interface MetadataOptions {
  expiresAt?: Temporal.Instant | null;
  expiresIn?: number | null;
  purpose?: unknown;
}

/** Metadata options accepted when reading a message. */
export interface ExpectedMetadataOptions {
  purpose?: unknown;
}

/**
 * Rails' `nil.to_s` is `""`, and `hash["pur"].to_s != purpose.to_s` leans on
 * that to treat a missing purpose and an unspecified purpose as equal.
 */
function toS(value: unknown): string {
  return value == null ? "" : String(value);
}

/**
 * Ruby's `if value` / `any? { |k, v| v }` reject only `nil` and `false` — `0`
 * and `""` are truthy there, so JS truthiness would silently drop
 * `expires_in: 0` and `purpose: ""`.
 */
function isPresent(value: unknown): boolean {
  return value != null && value !== false;
}

export abstract class Metadata {
  /**
   * Rails: `singleton_class.attr_accessor :use_message_serializer_for_metadata`.
   * @internal
   */
  static useMessageSerializerForMetadata = false;

  /**
   * Rails also lists `ActiveSupport::JSON`, `::JSON`, and `Marshal`. In trails a
   * codec serializer is an object with `dump`/`load`; `ActiveSupportJSON` exposes
   * `encode`/`decode`, so it can never be one, and `coder` is the Marshal
   * analogue (see serializer-with-fallback.ts). Rails appends
   * `ActiveSupport::MessagePack` from an `on_load(:message_pack)` hook; message_pack
   * is a bundled dep here, so it is listed unconditionally.
   */
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
      // Ruby's `iso8601(3)` — millisecond precision, `Z`-suffixed.
      return expiry?.toString({ smallestUnit: "millisecond" });
    }

    return expiry;
  }

  /**
   * Rails picks `Time.iso8601` or the laxer `Time.parse` on
   * `ActiveSupport.use_standard_json_time_format`. trails has no such setting
   * yet, so only the standard (ISO 8601) branch exists.
   */
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
