import { StringIO, Zlib, b, getZlib } from "@blazetrails/ruby-compat";

export class Stream extends StringIO {
  static toString(): string {
    return "ActiveSupport::Gzip::Stream";
  }

  constructor(string = "") {
    super(string);
    this.setEncoding("BINARY");
  }

  override close(): void {
    this.rewind();
  }
}

export namespace Gzip {
  export type StreamType = Stream;

  export function decompress(source: Buffer | string): string {
    const input = typeof source === "string" ? Buffer.from(source, "latin1") : source;
    return Buffer.from(getZlib().gunzip(input)).toString("utf8");
  }

  export function compress(
    source: string,
    level: number = Zlib.DEFAULT_COMPRESSION,
    strategy: number = Zlib.DEFAULT_STRATEGY,
  ): string {
    return Buffer.from(getZlib().gzip(Buffer.from(source), level, strategy)).toString("latin1");
  }
}

export function deflate(source: string | Uint8Array): Uint8Array {
  return getZlib().deflate(typeof source === "string" ? b(source) : source);
}

export function inflate(source: string | Uint8Array): Uint8Array {
  return getZlib().inflate(typeof source === "string" ? b(source) : source);
}
