import { RACK_INPUT } from "./constants.js";

export class RewindableInput {
  private _io: any;
  private _buffer: Buffer | null = null;
  private _pos = 0;
  private _closed = false;

  constructor(io: any) {
    this._io = io;
  }

  read(length?: number | null, buffer?: Buffer): Buffer | string | null {
    this._bufferData();
    if (this._buffer === null) return length != null ? null : "";

    if (length == null) {
      const result = this._buffer.subarray(this._pos);
      this._pos = this._buffer.length;
      if (buffer) {
        result.copy(buffer);
        return buffer.subarray(0, result.length);
      }
      return result.toString();
    }

    if (this._pos >= this._buffer.length) return null;
    const end = Math.min(this._pos + length, this._buffer.length);
    const slice = this._buffer.subarray(this._pos, end);
    this._pos = end;
    if (buffer) {
      slice.copy(buffer);
      return buffer.subarray(0, slice.length);
    }
    return slice.toString();
  }

  gets(): string | null {
    this._bufferData();
    if (this._buffer === null || this._pos >= this._buffer.length) return null;
    const str = this._buffer.toString("utf8", this._pos);
    const nlIdx = str.indexOf("\n");
    if (nlIdx === -1) {
      this._pos = this._buffer.length;
      return str;
    }
    const line = str.substring(0, nlIdx + 1);
    this._pos += Buffer.byteLength(line);
    return line;
  }

  rewind(): void {
    this._pos = 0;
  }

  get size(): number {
    this._bufferData();
    return this._buffer ? this._buffer.length : 0;
  }

  each(callback: (line: string) => void): void {
    this._bufferData();
    if (!this._buffer) return;
    const str = this._buffer.toString();
    const lines = str.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = i < lines.length - 1 ? lines[i] + "\n" : lines[i];
      if (line) callback(line);
    }
  }

  close(): void {
    this._closed = true;
    this._buffer = null;
  }

  get closed(): boolean {
    return this._closed;
  }

  private _bufferData(): void {
    if (this._buffer !== null || this._closed) return;
    if (!this._io) return;

    let data: string | Buffer = "";
    if (typeof this._io.read === "function") {
      data = this._io.read() || "";
    } else if (typeof this._io === "string") {
      data = this._io;
    }

    this._buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  }
}

export class RewindableInputMiddleware {
  private app: any;

  constructor(app: any) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    if (env[RACK_INPUT]) {
      env[RACK_INPUT] = new RewindableInput(env[RACK_INPUT]);
    }
    return this.app(env);
  }
}
