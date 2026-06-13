/**
 * Minimal MessagePack codec — only the subset Rails' encryption serializer
 * emits: nil, bool, int, str (UTF-8 text), bin (binary blobs) and string-keyed
 * map. Buffers encode as `bin`, JS strings as `str`, matching the msgpack gem's
 * encoding-based dispatch (ASCII-8BIT → bin, UTF-8 → str).
 *
 * Byte-compatible with `ActiveSupport::MessagePack` so a ciphertext written by
 * MRI Rails 8.0.2 with `message_serializer: :message_pack` round-trips here.
 *
 * No third-party deps; `Buffer` is a runtime global, not a `node:*` import.
 */

export class MessagePackError extends Error {}

/** Encode a single value to MessagePack bytes. */
export function encode(value: unknown): Buffer {
  const out: number[] = [];
  encodeValue(out, value);
  return Buffer.from(out);
}

/** @internal Push a format byte plus an `n`-byte big-endian length/value. */
function pushSized(out: number[], tag: number, value: number, n: number): void {
  out.push(tag);
  for (let shift = (n - 1) * 8; shift >= 0; shift -= 8) out.push((value >>> shift) & 0xff);
}

/** @internal */
function encodeValue(out: number[], value: unknown): void {
  if (value === null || value === undefined) out.push(0xc0);
  else if (typeof value === "boolean") out.push(value ? 0xc3 : 0xc2);
  else if (Buffer.isBuffer(value)) encodeBin(out, value);
  else if (typeof value === "string") encodeStr(out, value);
  else if (typeof value === "number") encodeInt(out, value);
  else if (typeof value === "object") encodeMap(out, value as Record<string, unknown>);
  else throw new MessagePackError(`Cannot encode value of type ${typeof value}`);
}

/** @internal */
function encodeStr(out: number[], str: string): void {
  const bytes = Buffer.from(str, "utf-8");
  const len = bytes.length;
  if (len < 32) out.push(0xa0 | len);
  else if (len < 0x100) pushSized(out, 0xd9, len, 1);
  else if (len < 0x10000) pushSized(out, 0xda, len, 2);
  else pushSized(out, 0xdb, len, 4);
  for (const b of bytes) out.push(b);
}

/** @internal */
function encodeBin(out: number[], buf: Buffer): void {
  const len = buf.length;
  if (len < 0x100) pushSized(out, 0xc4, len, 1);
  else if (len < 0x10000) pushSized(out, 0xc5, len, 2);
  else pushSized(out, 0xc6, len, 4);
  for (const b of buf) out.push(b);
}

/** @internal Integers only (the codec never emits floats). */
function encodeInt(out: number[], n: number): void {
  if (!Number.isInteger(n)) throw new MessagePackError("Cannot encode non-integer number");
  if (n >= 0) {
    if (n < 0x80) out.push(n);
    else if (n < 0x100) pushSized(out, 0xcc, n, 1);
    else if (n < 0x10000) pushSized(out, 0xcd, n, 2);
    else pushSized(out, 0xce, n, 4);
  } else if (n >= -32) out.push(0xe0 | (n + 32));
  else if (n >= -0x80) pushSized(out, 0xd0, n & 0xff, 1);
  else if (n >= -0x8000) pushSized(out, 0xd1, n & 0xffff, 2);
  else pushSized(out, 0xd2, n >>> 0, 4);
}

/** @internal */
function encodeMap(out: number[], obj: Record<string, unknown>): void {
  const entries = Object.entries(obj);
  const len = entries.length;
  if (len < 16) out.push(0x80 | len);
  else if (len < 0x10000) pushSized(out, 0xde, len, 2);
  else pushSized(out, 0xdf, len, 4);
  for (const [key, value] of entries) {
    encodeStr(out, key);
    encodeValue(out, value);
  }
}

interface Cursor {
  buf: Buffer;
  pos: number;
}

/** Decode a single MessagePack value from `buf`, starting at `offset`. */
export function decode(buf: Buffer, offset = 0): { value: unknown; offset: number } {
  const cursor: Cursor = { buf, pos: offset };
  const value = decodeValue(cursor);
  return { value, offset: cursor.pos };
}

/** @internal */
function readUint(c: Cursor, n: number): number {
  if (c.pos + n > c.buf.length) throw new MessagePackError("Unexpected end of MessagePack data");
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + c.buf[c.pos++];
  return v;
}

/** @internal */
function readInt(c: Cursor, n: number): number {
  const u = readUint(c, n);
  const bits = n * 8;
  return u >= 2 ** (bits - 1) ? u - 2 ** bits : u;
}

/** @internal */
function decodeValue(c: Cursor): unknown {
  const tag = readUint(c, 1);
  if (tag < 0x80) return tag; // positive fixint
  if (tag >= 0xe0) return tag - 0x100; // negative fixint
  if (tag <= 0x8f) return decodeMap(c, tag & 0x0f); // fixmap
  if (tag >= 0xa0 && tag <= 0xbf) return decodeStr(c, tag & 0x1f); // fixstr

  switch (tag) {
    case 0xc0:
      return null;
    case 0xc2:
      return false;
    case 0xc3:
      return true;
    case 0xc4:
      return decodeBin(c, readUint(c, 1));
    case 0xc5:
      return decodeBin(c, readUint(c, 2));
    case 0xc6:
      return decodeBin(c, readUint(c, 4));
    case 0xcc:
      return readUint(c, 1);
    case 0xcd:
      return readUint(c, 2);
    case 0xce:
      return readUint(c, 4);
    case 0xd0:
      return readInt(c, 1);
    case 0xd1:
      return readInt(c, 2);
    case 0xd2:
      return readInt(c, 4);
    case 0xd9:
      return decodeStr(c, readUint(c, 1));
    case 0xda:
      return decodeStr(c, readUint(c, 2));
    case 0xdb:
      return decodeStr(c, readUint(c, 4));
    case 0xde:
      return decodeMap(c, readUint(c, 2));
    case 0xdf:
      return decodeMap(c, readUint(c, 4));
    default:
      throw new MessagePackError(`Unsupported MessagePack tag 0x${tag.toString(16)}`);
  }
}

/** @internal */
function decodeStr(c: Cursor, len: number): string {
  if (c.pos + len > c.buf.length) throw new MessagePackError("Unexpected end of MessagePack data");
  const s = c.buf.toString("utf-8", c.pos, c.pos + len);
  c.pos += len;
  return s;
}

/** @internal */
function decodeBin(c: Cursor, len: number): Buffer {
  if (c.pos + len > c.buf.length) throw new MessagePackError("Unexpected end of MessagePack data");
  const b = Buffer.from(c.buf.subarray(c.pos, c.pos + len));
  c.pos += len;
  return b;
}

/** @internal */
function decodeMap(c: Cursor, size: number): Record<string, unknown> {
  const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (let i = 0; i < size; i++) {
    const key = decodeValue(c);
    if (typeof key !== "string") throw new MessagePackError("MessagePack map keys must be strings");
    obj[key] = decodeValue(c);
  }
  return obj;
}
