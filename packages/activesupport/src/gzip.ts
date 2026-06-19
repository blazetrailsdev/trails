import { gzipSync, gunzipSync, deflateSync, inflateSync, constants } from "node:zlib";

export class Stream {
  private _buffer: Buffer;
  private _position: number;

  constructor(data?: Buffer | string) {
    this._buffer = data
      ? Buffer.isBuffer(data)
        ? data
        : Buffer.from(data, "latin1")
      : Buffer.alloc(0);
    this._position = 0;
  }

  get string(): string {
    return this._buffer.toString("latin1");
  }

  get buffer(): Buffer {
    return this._buffer;
  }

  write(data: Buffer | string): number {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1");
    this._buffer = Buffer.concat([this._buffer, buf]);
    this._position = this._buffer.length;
    return buf.length;
  }

  rewind(): void {
    this._position = 0;
  }

  close(): void {
    this.rewind();
  }

  read(): Buffer {
    const result = this._buffer.subarray(this._position);
    this._position = this._buffer.length;
    return result;
  }
}

export namespace Gzip {
  export type StreamType = Stream;

  export function decompress(source: Buffer | string): string {
    const input = typeof source === "string" ? Buffer.from(source, "latin1") : source;
    return gunzipSync(input).toString("utf8");
  }

  export function compress(
    source: string,
    level: number = constants.Z_DEFAULT_COMPRESSION,
    strategy: number = constants.Z_DEFAULT_STRATEGY,
  ): string {
    return gzipSync(source, { level, strategy }).toString("latin1");
  }
}

// zlib-framed DEFLATE (RFC 1950), matching Ruby's Zlib::Deflate.deflate /
// Zlib::Inflate.inflate — distinct from the gzip-framed Gzip namespace above
// and from headerless raw DEFLATE (RFC 1951 / deflateRawSync).
export function deflate(source: string): string {
  return deflateSync(Buffer.from(source, "utf8")).toString("latin1");
}

export function inflate(source: string): string {
  return inflateSync(Buffer.from(source, "latin1")).toString("utf8");
}
