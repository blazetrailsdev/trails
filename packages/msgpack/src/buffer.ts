import {
  ArgumentError,
  EOFError,
  Hash,
  rbFSend,
  rbModConstSet,
  rbObjClassname,
  rbObjIsKindOf,
  rbObjRespondTo,
  stringValue,
  TypeError,
} from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";

const MSGPACK_BUFFER_STRING_WRITE_REFERENCE_DEFAULT = 512 * 1024;
const MSGPACK_BUFFER_STRING_WRITE_REFERENCE_MINIMUM = 256;
const MSGPACK_BUFFER_STRING_READ_REFERENCE_DEFAULT = 256;
const MSGPACK_BUFFER_STRING_READ_REFERENCE_MINIMUM = 256;
const MSGPACK_BUFFER_IO_BUFFER_SIZE_DEFAULT = 32 * 1024;
const MSGPACK_BUFFER_IO_BUFFER_SIZE_MINIMUM = 1024;
const MSGPACK_RMEM_PAGE_SIZE = 4 * 1024;

function CHECK_STRING_TYPE(value: unknown): void {
  if (typeof value !== "string" && !(value instanceof Uint8Array)) {
    throw new TypeError("instance of String needed");
  }
}

function toBytes(string: string | Uint8Array): Uint8Array {
  if (typeof string !== "string") {
    return string;
  }
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    bytes[i] = string.charCodeAt(i);
  }
  return bytes;
}

function concat(string: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(string.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of string) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

function getPartialReadMethod(io: unknown): string {
  if (io != null && rbObjRespondTo(io, "readpartial")) {
    return "readpartial";
  }
  return "read";
}

function getWriteAllMethod(io: unknown): string {
  if (io != null) {
    if (rbObjRespondTo(io, "write")) {
      return "write";
    } else if (rbObjRespondTo(io, "append")) {
      return "append";
    }
  }
  return "write";
}

export class Buffer {
  /** @internal */
  chunks: Uint8Array[] = [];
  private _io: unknown = null;
  private ioPartialReadMethod = "read";
  private ioWriteAllMethod = "write";
  private writeReferenceThreshold = MSGPACK_BUFFER_STRING_WRITE_REFERENCE_DEFAULT;
  private readReferenceThreshold = MSGPACK_BUFFER_STRING_READ_REFERENCE_DEFAULT;
  private tailMem: ArrayBufferLike | null = null;
  private mappedString = new WeakSet<ArrayBufferLike>();
  private ioBufferSize = MSGPACK_BUFFER_IO_BUFFER_SIZE_DEFAULT;

  constructor(...argv: unknown[]) {
    let io: unknown = null;
    let options: object | null = null;

    if (argv.length === 0 || (argv.length === 1 && argv[0] == null)) {
      io = null;
    } else if (argv.length === 1) {
      const v = argv[0];
      if (rbObjIsKindOf(v, Hash)) {
        options = v as object;
      } else {
        io = v;
      }
    } else if (argv.length === 2) {
      io = argv[0];
      options = argv[1] as object | null;
      if (!rbObjIsKindOf(options, Hash)) {
        throw new ArgumentError(`expected Hash but found ${rbObjClassname(io)}.`);
      }
    } else {
      throw new ArgumentError(`wrong number of arguments (${argv.length} for 0..1)`);
    }

    this.setOptions(io, options);
  }

  /** @internal */
  setOptions(io: unknown, options: object | null): void {
    this._io = io;
    this.ioPartialReadMethod = getPartialReadMethod(io);
    this.ioWriteAllMethod = getWriteAllMethod(io);

    if (options != null) {
      let v = (options as { readReferenceThreshold?: number | null }).readReferenceThreshold;
      if (v != null) {
        this.readReferenceThreshold = Math.max(v, MSGPACK_BUFFER_STRING_READ_REFERENCE_MINIMUM);
      }

      v = (options as { writeReferenceThreshold?: number | null }).writeReferenceThreshold;
      if (v != null) {
        this.writeReferenceThreshold = Math.max(v, MSGPACK_BUFFER_STRING_WRITE_REFERENCE_MINIMUM);
      }

      v = (options as { ioBufferSize?: number | null }).ioBufferSize;
      if (v != null) {
        this.ioBufferSize = Math.max(v, MSGPACK_BUFFER_IO_BUFFER_SIZE_MINIMUM);
      }
    }
  }

  clear(): null {
    this.chunks = [];
    return null;
  }

  size(): number {
    return this.chunks.reduce((size, chunk) => size + chunk.length, 0);
  }

  isEmpty(): boolean {
    return this.topReadableSize() === 0;
  }

  write(stringOrBuffer: string | Uint8Array): number {
    let string = stringOrBuffer;
    if (!(string instanceof Uint8Array)) {
      string = stringValue(string);
    }

    const length = this.appendString(string);

    return length;
  }

  append(stringOrBuffer: string | Uint8Array): this {
    let string = stringOrBuffer;
    if (!(string instanceof Uint8Array)) {
      string = stringValue(string);
    }

    this.appendString(string);

    return this;
  }

  skip(n: number): number {
    if (n === 0) {
      return 0;
    }

    return this.readUntilEof(null, n);
  }

  skipAll(n: number): this {
    if (n === 0) {
      return this;
    }

    if (!this.ensureReadable(n)) {
      throw new EOFError("end of buffer reached");
    }

    this.skipNonblock(n);

    return this;
  }

  readAll(...argv: unknown[]): Uint8Array {
    let out: unknown = null;
    let n = 0;
    let all = false;

    switch (argv.length) {
      case 2:
        out = argv[1];
        n = argv[0] as number;
        break;
      case 1:
        n = argv[0] as number;
        break;
      case 0:
        all = true;
        break;
      default:
        throw new ArgumentError(`wrong number of arguments (${argv.length} for 0..2)`);
    }

    if (out != null) {
      CHECK_STRING_TYPE(out);
    }

    if (all) {
      return this.bufferReadAll(out);
    }

    if (n === 0) {
      return new Uint8Array(0);
    }

    if (!this.ensureReadable(n)) {
      throw new EOFError("end of buffer reached");
    }

    const string: Uint8Array[] = [];
    this.readToStringNonblock(string, n);

    return concat(string);
  }

  read(...argv: unknown[]): Uint8Array | null {
    let out: unknown = null;
    let n = -1;
    let all = false;

    switch (argv.length) {
      case 2:
        out = argv[1];
        n = argv[0] as number;
        break;
      case 1:
        n = argv[0] as number;
        break;
      case 0:
        all = true;
        break;
      default:
        throw new ArgumentError(`wrong number of arguments (${argv.length} for 0..2)`);
    }

    if (out != null) {
      CHECK_STRING_TYPE(out);
    }

    if (all) {
      return this.bufferReadAll(out);
    }

    if (n === 0) {
      return new Uint8Array(0);
    }

    if (this._io == null && out == null && this.size() <= n) {
      const str = this.toStr();
      this.clear();

      if (str.length === 0) {
        return null;
      } else {
        return str;
      }
    }

    const string: Uint8Array[] = [];
    this.readUntilEof(string, n);

    if (string.length === 0) {
      return null;
    } else {
      return concat(string);
    }
  }

  get io(): unknown {
    return this._io;
  }

  flush(): this {
    if (this._io != null) {
      this.flushToIo(this._io, this.ioWriteAllMethod, true);
    }
    return this;
  }

  close(): unknown {
    if (this._io != null) {
      return rbFSend(this._io, "close");
    }
    return null;
  }

  writeTo(io: unknown): number {
    return this.flushToIo(io, "write", true);
  }

  toStr(): Uint8Array {
    if (this.chunks.length === 0) {
      return new Uint8Array(0);
    }
    if (this.chunks.length === 1) {
      return this.chunks[0].slice();
    }
    return concat(this.chunks);
  }

  toS(): Uint8Array {
    return this.toStr();
  }

  toA(): Uint8Array[] {
    if (this.chunks.length === 0) {
      return [this.toStr()];
    }
    return [...this.chunks];
  }

  /** @internal */
  ensureReadable(require: number): boolean {
    let sz = this.size();
    if (sz < require) {
      if (this._io == null) {
        return false;
      }
      do {
        const rl = this.feedFromIo();
        sz += rl;
      } while (sz < require);
    }
    return true;
  }

  /** @internal */
  flushToIo(io: unknown, writeMethod: string, consume: boolean): number {
    if (this.size() === 0) {
      return 0;
    }

    let sz = 0;
    for (const s of this.chunks) {
      rbFSend(io, writeMethod, s);
      sz += s.length;
    }
    if (consume) {
      this.chunks = [];
    }
    return sz;
  }

  private feedFromIo(): number {
    let ioBuffer = rbFSend(this._io, this.ioPartialReadMethod, this.ioBufferSize) as
      | string
      | Uint8Array
      | null;
    if (ioBuffer == null) {
      throw new EOFError("IO reached end of file");
    }
    ioBuffer = toBytes(ioBuffer);

    const len = ioBuffer.length;
    if (len === 0) {
      throw new EOFError("IO reached end of file");
    }

    this.appendImpl(ioBuffer, len, false);

    return len;
  }

  private appendString(string: string | Uint8Array): number {
    const bytes = typeof string === "string" ? new TextEncoder().encode(string) : string;
    const length = bytes.length;

    if (length > this.writeReferenceThreshold) {
      this.appendLongString(bytes, typeof string !== "string");
    } else {
      this.bufferAppend(bytes);
    }

    return length;
  }

  private appendLongString(string: Uint8Array, ascii8bit: boolean): void {
    if (this._io != null) {
      this.flush();
      if (ascii8bit) {
        rbFSend(this._io, this.ioWriteAllMethod, string);
      } else {
        this.bufferAppend(string);
      }
    } else {
      this.appendReference(string);
    }
  }

  private appendReference(string: Uint8Array): void {
    const mappedString = string.slice();

    this.chunks.push(mappedString);
    this.mappedString.add(mappedString.buffer);
  }

  private writableSize(): number {
    if (this.chunks.length === 0) {
      return 0;
    }
    const tail = this.chunks[this.chunks.length - 1];
    if (tail.buffer !== this.tailMem) {
      return 0;
    }
    return tail.buffer.byteLength - (tail.byteOffset + tail.length);
  }

  private bufferAppend(data: Uint8Array): void {
    this.appendImpl(data, data.length, true);
  }

  private appendImpl(data: Uint8Array, length: number, flushToIo: boolean): void {
    if (length === 0) {
      return;
    }

    if (length <= this.writableSize()) {
      const tail = this.chunks[this.chunks.length - 1];
      new Uint8Array(tail.buffer, tail.byteOffset + tail.length, length).set(data);
      this.chunks[this.chunks.length - 1] = new Uint8Array(
        tail.buffer,
        tail.byteOffset,
        tail.length + length,
      );
      return;
    }

    this.expand(data, length, flushToIo);
  }

  private chunkMalloc(requiredSize: number): Uint8Array {
    if (requiredSize <= MSGPACK_RMEM_PAGE_SIZE) {
      return new Uint8Array(MSGPACK_RMEM_PAGE_SIZE);
    }

    return new Uint8Array(requiredSize);
  }

  private chunkRealloc(mem: Uint8Array, requiredSize: number, currentSize: number): Uint8Array {
    let nextSize = currentSize * 2;
    while (nextSize < requiredSize) {
      nextSize *= 2;
    }
    const realloced = new Uint8Array(nextSize);
    realloced.set(mem);
    return realloced;
  }

  private expand(data: Uint8Array, length: number, flushToIo: boolean): void {
    if (flushToIo && this._io != null) {
      this.flush();
      if (this.writableSize() >= length) {
        const tail = this.chunks[this.chunks.length - 1];
        const tailAvail = this.writableSize();
        new Uint8Array(tail.buffer, tail.byteOffset + tail.length, length).set(data);
        this.chunks[this.chunks.length - 1] = new Uint8Array(
          tail.buffer,
          tail.byteOffset,
          tail.length + tailAvail,
        );
        return;
      }
    }

    const tailAvail = this.writableSize();
    if (tailAvail > 0) {
      const tail = this.chunks[this.chunks.length - 1];
      new Uint8Array(tail.buffer, tail.byteOffset + tail.length, tailAvail).set(
        data.subarray(0, tailAvail),
      );
      this.chunks[this.chunks.length - 1] = new Uint8Array(
        tail.buffer,
        tail.byteOffset,
        tail.length + tailAvail,
      );
    }
    data = data.subarray(tailAvail);
    length -= tailAvail;

    const tail = this.chunks.length === 0 ? null : this.chunks[this.chunks.length - 1];
    const capacity = tail == null ? 0 : tail.byteOffset + tail.length;

    if (tail == null || this.mappedString.has(tail.buffer) || capacity <= MSGPACK_RMEM_PAGE_SIZE) {
      const mem = this.chunkMalloc(length);
      mem.set(data);

      this.chunks.push(mem.subarray(0, length));
      this.tailMem = mem.buffer;
    } else {
      const tailFilled = tail.byteOffset + tail.length;
      const first = new Uint8Array(tail.buffer, 0, tailFilled);
      const mem = this.chunkRealloc(first, tailFilled + length, capacity);
      mem.set(data, tailFilled);

      this.chunks[this.chunks.length - 1] = mem.subarray(tail.byteOffset, tailFilled + length);
      this.tailMem = mem.buffer;
    }
  }

  private readUntilEof(out: Uint8Array[] | null, max: number): number {
    if (this._io != null) {
      let sz = 0;
      try {
        while (true) {
          let rl: number;
          if (max === 0) {
            if (out == null) {
              rl = this.bufferSkip(this.ioBufferSize);
            } else {
              rl = this.readToString(out, this.ioBufferSize);
            }
            if (rl === 0) {
              break;
            }
            sz += rl;
          } else {
            if (out == null) {
              rl = this.bufferSkip(max);
            } else {
              rl = this.readToString(out, max);
            }
            if (rl === 0) {
              break;
            }
            sz += rl;
            if (max <= rl) {
              break;
            } else {
              max -= rl;
            }
          }
        }
      } catch (error) {
        if (!(error instanceof EOFError)) throw error;
      }
      return sz;
    } else {
      if (max === 0) {
        max = Number.MAX_SAFE_INTEGER;
      }
      if (out == null) {
        return this.skipNonblock(max);
      } else {
        return this.readToStringNonblock(out, max);
      }
    }
  }

  private bufferReadAll(out: unknown): Uint8Array {
    if (out == null && this._io == null) {
      const str = this.toStr();
      this.clear();
      return str;
    }

    const string: Uint8Array[] = [];
    this.readUntilEof(string, 0);
    return concat(string);
  }

  private topReadableSize(): number {
    return this.chunks.length === 0 ? 0 : this.chunks[0].length;
  }

  private shiftChunk(): boolean {
    this.chunks.shift();
    return this.chunks.length > 0;
  }

  private consumed(length: number): void {
    if (this.chunks.length === 0) {
      return;
    }
    this.chunks[0] = this.chunks[0].subarray(length);
    if (this.chunks[0].length === 0) {
      this.shiftChunk();
    }
  }

  private readToStringNonblock(string: Uint8Array[], length: number): number {
    let avail = this.topReadableSize();

    if (
      length <= avail &&
      string.length === 0 &&
      this.mappedString.has(this.chunks[0].buffer) &&
      length >= this.readReferenceThreshold
    ) {
      string.push(this.chunks[0].subarray(0, length));
      this.consumed(length);
      return length;
    }

    const lengthOrig = length;

    while (true) {
      if (length <= avail) {
        if (length > 0) string.push(this.chunks[0].subarray(0, length));
        this.consumed(length);
        return lengthOrig;
      }

      if (avail > 0) string.push(this.chunks[0]);
      length -= avail;

      if (!this.shiftChunk()) {
        return lengthOrig - length;
      }

      avail = this.topReadableSize();
    }
  }

  private readToString(string: Uint8Array[], length: number): number {
    if (length === 0) {
      return 0;
    }

    const avail = this.topReadableSize();
    if (avail > 0) {
      return this.readToStringNonblock(string, length);
    } else if (this._io != null) {
      return this.readFromIoToString(string, length);
    } else {
      return 0;
    }
  }

  private bufferSkip(length: number): number {
    if (length === 0) {
      return 0;
    }

    const avail = this.topReadableSize();
    if (avail > 0) {
      return this.skipNonblock(length);
    } else if (this._io != null) {
      return this.skipFromIo(length);
    } else {
      return 0;
    }
  }

  private readFromIoToString(string: Uint8Array[], length: number): number {
    const ret = rbFSend(this._io, this.ioPartialReadMethod, Math.min(this.ioBufferSize, length)) as
      | string
      | Uint8Array
      | null;
    if (ret == null) {
      return 0;
    }
    const rl = ret.length;

    if (rl > 0) string.push(toBytes(ret));
    return rl;
  }

  private skipFromIo(length: number): number {
    const ret = rbFSend(this._io, this.ioPartialReadMethod, length) as string | Uint8Array | null;
    if (ret == null) {
      return 0;
    }
    return ret.length;
  }

  private skipNonblock(length: number): number {
    const lengthOrig = length;

    while (true) {
      const avail = this.topReadableSize();

      if (length <= avail) {
        this.consumed(length);
        return lengthOrig;
      }

      length -= avail;

      if (!this.shiftChunk()) {
        return lengthOrig - length;
      }
    }
  }
}

rbModConstSet(MessagePack, "Buffer", Buffer);
