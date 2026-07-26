/**
 * Mirrors Rails `ActiveSupport::Messages::Codec` (messages/codec.rb) — the
 * shared base of `MessageEncryptor` and `MessageVerifier`. It turns a
 * `serializer:` symbol into one of the five
 * {@link SerializerWithFallback} serializers and owns the base64
 * encode/decode + serialize/deserialize pair both subclasses build on.
 *
 * Rails' `include Metadata` is not mirrored: `messages/metadata.rb` has no TS
 * counterpart yet, so `use_message_serializer_for_metadata?` (whose body is
 * `!@force_legacy_metadata_serializer && super`) has no `super` to call and is
 * omitted rather than stubbed. `@forceLegacyMetadataSerializer` is still
 * captured so the option survives once Metadata lands.
 */

import { SerializerWithFallback, type Format } from "./serializer-with-fallback.js";

/**
 * The serializer surface Codec itself needs. Rails only ever calls
 * `dump`/`load`, so a custom serializer object need not implement the full
 * {@link SerializerWithFallback} interface (which the five built-ins satisfy).
 *
 * @internal
 */
export interface MessageSerializer {
  dump(value: unknown): string;
  load(dumped: string): unknown;
}

/** Mirrors Ruby's `ArgumentError` — what `Base64.strict_decode64` raises. @internal */
export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * Ruby `throw`/`catch` with a symbol tag, which Codec uses to signal a bad
 * message out of `decode`/`deserialize` without raising. JS has no non-local
 * throw, so the tag rides on a real exception that
 * {@link Codec.catchAndIgnore} / {@link Codec.catchAndRaise} recognize.
 *
 * @internal
 */
export class Thrown extends Error {
  constructor(
    readonly tag: string,
    readonly value: unknown,
  ) {
    super(String(tag));
    this.name = "Thrown";
  }
}

/** Options accepted by every {@link Codec} subclass. @internal */
export interface CodecOptions {
  /** A {@link Format} name (Rails' `:marshal` etc.) or a serializer object. */
  serializer?: Format | MessageSerializer;
  urlSafe?: boolean;
  forceLegacyMetadataSerializer?: boolean;
}

/** Mirrors Rails `ActiveSupport::Messages::Codec`. @internal */
export class Codec {
  /**
   * Mirrors `class_attribute :default_serializer, default: :marshal`. Reading
   * it off `this.constructor` (rather than `Codec`) gives Ruby's per-subclass
   * override.
   */
  static defaultSerializer: Format | MessageSerializer = "marshal";

  /** @internal Rails: `attr_reader :serializer` (private). */
  protected readonly serializer: MessageSerializer;
  protected readonly urlSafe: boolean;
  protected readonly forceLegacyMetadataSerializer: boolean;

  constructor(options: CodecOptions = {}) {
    const ctor = this.constructor as typeof Codec;
    const serializer = options.serializer ?? ctor.defaultSerializer;
    this.serializer =
      typeof serializer === "string" ? SerializerWithFallback.get(serializer) : serializer;
    this.urlSafe = options.urlSafe ?? false;
    this.forceLegacyMetadataSerializer = options.forceLegacyMetadataSerializer ?? false;
  }

  /** @internal Rails: `Base64.urlsafe_encode64(data, padding: false)` / `strict_encode64`. */
  protected encode(data: string | Buffer, urlSafe: boolean = this.urlSafe): string {
    const buf = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    return urlSafe ? buf.toString("base64url") : buf.toString("base64");
  }

  /** @internal Rails: throws `:invalid_message_format` on a decode failure. */
  protected decode(encoded: string, urlSafe: boolean = this.urlSafe): Buffer {
    try {
      const alphabet = urlSafe ? /^[A-Za-z0-9\-_]*$/ : /^[A-Za-z0-9+/]*={0,2}$/;
      if (!alphabet.test(encoded)) throw new ArgumentError("invalid base64");
      return Buffer.from(encoded, urlSafe ? "base64url" : "base64");
    } catch (error) {
      throw new Thrown("invalid_message_format", error);
    }
  }

  protected serialize(data: unknown): string {
    return this.serializer.dump(data);
  }

  /** @internal Rails: throws `:invalid_message_serialization` on a load failure. */
  protected deserialize(serialized: string): unknown {
    try {
      return this.serializer.load(serialized);
    } catch (error) {
      throw new Thrown("invalid_message_serialization", error);
    }
  }

  protected catchAndIgnore<T>(throwable: string, block: () => T): T | null {
    try {
      return block();
    } catch (error) {
      if (error instanceof Thrown && error.tag === throwable) return null;
      throw error;
    }
  }

  protected catchAndRaise<T>(
    throwable: string,
    options: { as?: new (message: string) => Error },
    block: () => T,
  ): T {
    try {
      return block();
    } catch (error) {
      if (error instanceof Thrown && error.tag === throwable) {
        const thrown = error.value;
        throw options.as
          ? new options.as(thrown instanceof Error ? thrown.message : String(thrown))
          : thrown;
      }
      throw error;
    }
  }
}
