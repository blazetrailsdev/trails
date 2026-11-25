const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function record(size: number, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

/** A .zip of text files, stored uncompressed, under a top-level folder. */
export function zip(files: Record<string, string>, folder: string): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = encoder.encode(`${folder}${path}`);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const fields = (view: DataView, at: number) => {
      view.setUint16(at, 20, true);
      view.setUint16(at + 2, 0x0800, true);
      view.setUint32(at + 10, crc, true);
      view.setUint32(at + 14, data.length, true);
      view.setUint32(at + 18, data.length, true);
      view.setUint16(at + 22, name.length, true);
    };
    const local = record(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      fields(view, 4);
    });
    const central = record(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      fields(view, 6);
      view.setUint32(42, offset, true);
    });
    parts.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const size = directory.reduce((n, part) => n + part.length, 0);
  const end = record(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, directory.length / 2, true);
    view.setUint16(10, directory.length / 2, true);
    view.setUint32(12, size, true);
    view.setUint32(16, offset, true);
  });
  return new Blob([...parts, ...directory, end] as BlobPart[], { type: "application/zip" });
}
