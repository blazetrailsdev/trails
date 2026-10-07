export class Buffer {
  /** @internal */
  chunks: Uint8Array[] = [];
  readonly io: unknown;

  constructor(io: unknown = null) {
    this.io = io;
  }

  clear(): null {
    this.chunks = [];
    return null;
  }

  size(): number {
    return this.chunks.reduce((size, chunk) => size + chunk.length, 0);
  }

  write(string: string | Uint8Array): number {
    const bytes = typeof string === "string" ? new TextEncoder().encode(string) : string.slice();
    this.chunks.push(bytes);
    return bytes.length;
  }

  skip(n: number): number {
    const all = this.toStr();
    this.chunks = [all.subarray(n)];
    return Math.min(n, all.length);
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
}
