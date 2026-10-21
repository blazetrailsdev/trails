import { RACK_INPUT } from "./constants.js";
import { Encoding, RUBY_PLATFORM, RuntimeError, Tempfile } from "@blazetrails/ruby-compat";

export class Middleware {
  private app: any;

  constructor(app: any) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    env[RACK_INPUT] = new RewindableInput(env[RACK_INPUT]);
    return this.app.call(env);
  }
}

export class RewindableInput {
  static Middleware: typeof Middleware;

  private io: any;
  private rewindableIo: Tempfile | null;
  private unlinked: boolean;

  constructor(io: any) {
    this.io = io;
    this.rewindableIo = null;
    this.unlinked = false;
  }

  gets(): string | Uint8Array | null {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.gets();
  }

  read(
    ...args: [] | [number | null] | [number | null, Uint8Array | null]
  ): string | Uint8Array | null {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.read(...(args as [number | null, Uint8Array | null]));
  }

  each(block: (line: string | Uint8Array) => void): Tempfile {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.each(block);
  }

  rewind(): number {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.rewind();
  }

  size(): number {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.size();
  }

  close(): null {
    if (this.rewindableIo) {
      if (this.unlinked) {
        this.rewindableIo.close();
      } else {
        this.rewindableIo.closeBang();
      }
      this.rewindableIo = null;
    }
    return null;
  }

  /** @internal */
  private makeRewindable(): void {
    this.rewindableIo = Tempfile.new("RackRewindableInput");
    this.rewindableIo.chmod(0o000);
    this.rewindableIo.setEncoding(Encoding.BINARY);
    this.rewindableIo.binmode();
    if (this.isFilesystemHasPosixSemantics()) {
      if (this.rewindableIo.isClosed()) throw new RuntimeError("Unlink failed. IO closed.");
      this.unlinked = true;
    }

    let buffer = new Uint8Array(1024 * 4);
    let read: string | null;
    while ((read = this.io.read(1024 * 4, buffer)) != null) {
      buffer = buffer.subarray(0, read.length);
      let entireBufferWrittenOut = false;
      while (!entireBufferWrittenOut) {
        const written = this.rewindableIo.write(buffer);
        entireBufferWrittenOut = written === buffer.byteLength;
        if (!entireBufferWrittenOut) {
          buffer = buffer.subarray(written);
        }
      }
      buffer = new Uint8Array(1024 * 4);
    }
    this.rewindableIo.rewind();
  }

  /** @internal */
  private isFilesystemHasPosixSemantics(): boolean {
    return !/(mswin|mingw|cygwin|java)/.test(RUBY_PLATFORM());
  }
}

RewindableInput.Middleware = Middleware;
