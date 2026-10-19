import { RACK_INPUT } from "./constants.js";
import {
  Encoding,
  RUBY_PLATFORM,
  RuntimeError,
  Tempfile,
  rbFSend,
  rbStrByteslice,
} from "@blazetrails/ruby-compat";

export class RewindableInput {
  private io: any;
  private rewindableIo: Tempfile | null;
  private unlinked: boolean;

  constructor(io: any) {
    this.io = io;
    this.rewindableIo = null;
    this.unlinked = false;
  }

  gets(): string | null {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.gets();
  }

  read(...args: [length?: number | null, buffer?: Uint8Array | null]): string | null {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.read(...(args as [number | null, Uint8Array | null]));
  }

  each(block: (line: string) => void): unknown {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.each(block);
  }

  rewind(): number {
    if (!this.rewindableIo) this.makeRewindable();
    return this.rewindableIo!.rewind();
  }

  get size(): number {
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

    let buffer: string | null;
    while ((buffer = this.io.read(1024 * 4)) != null) {
      let entireBufferWrittenOut = false;
      while (!entireBufferWrittenOut) {
        const written = this.rewindableIo.write(buffer);
        entireBufferWrittenOut = written === Buffer.byteLength(buffer);
        if (!entireBufferWrittenOut) {
          buffer = rbStrByteslice(buffer, written, Buffer.byteLength(buffer) - written)!;
        }
      }
    }
    this.rewindableIo.rewind();
  }

  /** @internal */
  private isFilesystemHasPosixSemantics(): boolean {
    return !/(mswin|mingw|cygwin|java)/.test(RUBY_PLATFORM());
  }
}

export class RewindableInputMiddleware {
  private app: any;

  constructor(app: any) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    env[RACK_INPUT] = new RewindableInput(env[RACK_INPUT]);
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}
