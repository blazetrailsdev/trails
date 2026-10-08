import {
  ArgumentError,
  EOFError,
  Hash,
  rbFSend,
  rbModConstSet,
  rbObjClassname,
  rbObjIsKindOf,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";

const MSGPACK_BUFFER_IO_BUFFER_SIZE_DEFAULT = 32 * 1024;
const MSGPACK_BUFFER_IO_BUFFER_SIZE_MINIMUM = 1024;

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
      const v = (options as { ioBufferSize?: number | null }).ioBufferSize;
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
    return this.size() === 0;
  }

  write(string: string | Uint8Array): number {
    const bytes = typeof string === "string" ? new TextEncoder().encode(string) : string.slice();
    if (this._io != null && this.size() + bytes.length > this.ioBufferSize) {
      this.flush();
    }
    this.chunks.push(bytes);
    return bytes.length;
  }

  append(string: string | Uint8Array): this {
    this.write(string);
    return this;
  }

  skip(n: number): number {
    return this.skipNonblock(n);
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
    if (this.chunks.length !== 1) {
      const all = new Uint8Array(this.size());
      let offset = 0;
      for (const chunk of this.chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      this.chunks = [all];
    }
    return this.chunks[0];
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
    if (typeof ioBuffer === "string") {
      ioBuffer = Uint8Array.from(ioBuffer, (c) => c.charCodeAt(0));
    }

    const len = ioBuffer.length;
    if (len === 0) {
      throw new EOFError("IO reached end of file");
    }

    this.chunks.push(ioBuffer.slice());

    return len;
  }

  private skipNonblock(length: number): number {
    const all = this.toStr();
    this.chunks = [all.subarray(length)];
    return Math.min(length, all.length);
  }
}

rbModConstSet(MessagePack, "Buffer", Buffer);
