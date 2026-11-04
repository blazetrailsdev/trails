import {
  ArgumentError,
  byteslice,
  constGet,
  include,
  IOError,
  rbObjRespondTo,
  type Included,
} from "@blazetrails/ruby-compat";

type Chunk = Uint8Array;

interface Input {
  read(): string | Uint8Array | null;
  close(): unknown;
}

interface Output {
  write(buffer: unknown): unknown;
  close?(): unknown;
  isEmpty?(): boolean;
}

const encoder = new TextEncoder();

function _binary(chunk: string | Uint8Array): Chunk {
  return typeof chunk === "string" ? encoder.encode(chunk) : chunk;
}

function _append(buffer: Chunk, chunk: string | Uint8Array): Chunk {
  const bytes = _binary(chunk);
  const out = new Uint8Array(buffer.length + bytes.length);
  out.set(buffer, 0);
  out.set(bytes, buffer.length);
  return out;
}

export const Reader = {
  read(this: Stream, length: number | null = null, buffer: Chunk | null = null): Chunk | "" | null {
    if (length === 0) return "";

    if (this._buffer != null) {
      buffer = this._buffer;
      this._buffer = null;
    } else {
      buffer = new Uint8Array(0);
    }

    if (length != null) {
      let chunk;
      while (buffer.length < length && (chunk = this.readNext()) != null) {
        buffer = _append(buffer, chunk);
      }

      this._buffer = byteslice(buffer, length, buffer.length);

      buffer = buffer.slice(0, length);

      if (buffer.length === 0) {
        return null;
      } else {
        return buffer;
      }
    } else {
      let chunk;
      while ((chunk = this.readNext()) != null) {
        buffer = _append(buffer, chunk);
      }

      return buffer;
    }
  },

  readPartial(this: Stream, length: number | null = null): Chunk | null {
    let buffer: Chunk | null;
    if (this._buffer != null) {
      buffer = this._buffer;
      this._buffer = null;
    } else {
      const next = this.readNext();
      buffer = next == null ? null : _binary(next);
    }

    if (buffer != null && length != null) {
      if (buffer.length > length) {
        this._buffer = byteslice(buffer, length, buffer.length);
        buffer = buffer.slice(0, length);
      }
    }

    return buffer;
  },

  gets(this: Stream): Chunk | null {
    return this.readPartial();
  },

  each(this: Stream, block: (chunk: Chunk) => void): void {
    let chunk;
    while ((chunk = this.readPartial()) != null) {
      block(chunk);
    }
  },

  readNonblock(this: Stream, length: number, buffer: Chunk | null = null): Chunk | null {
    if (this._buffer == null) {
      const next = this.readNext();
      this._buffer = next == null ? null : _binary(next);
    }
    let chunk: Chunk | null;

    if (this._buffer == null) {
      return null;
    }

    if (this._buffer.length > length) {
      chunk = byteslice(this._buffer, 0, length)!;
      this._buffer = byteslice(this._buffer, length, this._buffer.length);
    } else {
      chunk = this._buffer;
      this._buffer = null;
    }

    if (buffer != null) {
      buffer = chunk;
    } else {
      buffer = chunk;
    }

    return buffer;
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Stream extends Included<typeof Reader> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Stream {
  /** @internal */
  _input: Input | null;
  /** @internal */
  _output: Output | null;
  /** @internal */
  _buffer: Chunk | null;
  /** @internal */
  _closed: boolean;

  constructor(
    input: Input | null = null,
    output: Output = new (constGet(Stream, "Buffered") as new () => Output)(),
  ) {
    this._input = input;
    this._output = output;

    if (!rbObjRespondTo(output, "write")) throw new ArgumentError("Non-writable output!");

    this._buffer = null;
    this._closed = false;
  }

  get input(): Input | null {
    return this._input;
  }

  get output(): Output | null {
    return this._output;
  }

  write(buffer: string | Uint8Array): number {
    if (this._output != null) {
      this._output.write(buffer);
      return _binary(buffer).length;
    } else {
      throw new IOError("Stream is not writable, output has been closed!");
    }
  }

  writeNonblock(buffer: string | Uint8Array): number {
    return this.write(buffer);
  }

  append(buffer: string | Uint8Array): number {
    return this.write(buffer);
  }

  flush(): void {}

  closeRead(): void {
    this._input?.close();
    this._input = null;
  }

  closeWrite(): void {
    if (rbObjRespondTo(this._output, "close")) {
      this._output?.close!();
    }

    this._output = null;
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  close(error: unknown = null): null {
    try {
      this.closeRead();
      this.closeWrite();

      return null;
    } finally {
      this._closed = true;
    }
  }

  isClosed(): boolean {
    return this._closed;
  }

  isEmpty(): boolean | undefined {
    return this._output!.isEmpty!();
  }

  /** @internal */
  readNext(): string | Uint8Array | null {
    if (this._input != null) {
      return this._input.read();
    } else {
      this._input = null;
      throw new IOError("Stream is not readable, input has been closed!");
    }
  }
}

include(Stream, Reader);
