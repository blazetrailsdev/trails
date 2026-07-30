import { Metadata } from "./metadata.js";
import { SerializerWithFallback, Thrown, type Format } from "./serializer-with-fallback.js";

export interface MessageSerializer {
  dump(value: unknown): string;
  load(dumped: string): unknown;
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

export interface CodecOptions {
  serializer?: Format | MessageSerializer;
  urlSafe?: boolean;
  forceLegacyMetadataSerializer?: boolean;
}

export class Codec extends Metadata {
  static defaultSerializer: Format | MessageSerializer = "marshal";

  protected override readonly serializer: MessageSerializer;
  protected readonly urlSafe: boolean;
  protected readonly forceLegacyMetadataSerializer: boolean;

  constructor(options: CodecOptions = {}) {
    super();
    const ctor = this.constructor as typeof Codec;
    const serializer = options.serializer ?? ctor.defaultSerializer;
    this.serializer =
      typeof serializer === "string" ? SerializerWithFallback.get(serializer) : serializer;
    this.urlSafe = options.urlSafe ?? false;
    this.forceLegacyMetadataSerializer = options.forceLegacyMetadataSerializer ?? false;
  }

  protected override encode(data: string | Buffer, urlSafe: boolean = this.urlSafe): string {
    const buf = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    return urlSafe ? buf.toString("base64url") : buf.toString("base64");
  }

  protected override decode(encoded: string, urlSafe: boolean = this.urlSafe): Buffer {
    try {
      let str = encoded;
      if (urlSafe && !str.endsWith("=") && str.length % 4 !== 0) {
        str = str.padEnd((str.length + 3) & ~3, "=");
      }

      const alphabet = urlSafe ? /^[A-Za-z0-9\-_]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
      if (!alphabet.test(str) || str.length % 4 !== 0) {
        throw new ArgumentError("invalid base64");
      }
      return Buffer.from(str, urlSafe ? "base64url" : "base64");
    } catch (error) {
      throw new Thrown("invalid_message_format", error);
    }
  }

  protected override serialize(data: unknown): string {
    return this.serializer.dump(data);
  }

  protected override deserialize(serialized: string): unknown {
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

  protected override useMessageSerializerForMetadata(): boolean {
    return !this.forceLegacyMetadataSerializer && super.useMessageSerializerForMetadata();
  }
}
