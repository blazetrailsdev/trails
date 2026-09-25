import type { Bytes } from "./fs-adapter.js";

export interface CipherAdapter {
  update(data: string, inputEncoding: string, outputEncoding: string): string;
  update(data: string | Uint8Array, inputEncoding?: string): Bytes;
  final(outputEncoding: string): string;
  final(): Bytes;
  setAAD?(buffer: Uint8Array): this;
  getAuthTag?(): Bytes;
  setAuthTag?(tag: Uint8Array): this;
}

export interface DecipherAdapter {
  update(data: string, inputEncoding: string, outputEncoding: string): string;
  update(data: Uint8Array): Uint8Array;
  final(outputEncoding: string): string;
  final(): Uint8Array;
  setAAD?(buffer: Uint8Array): this;
  setAuthTag?(tag: Uint8Array): void;
}

export interface CryptoAdapter {
  randomBytes(size: number): Bytes;
  createHash(algorithm: string): HashAdapter;
  createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter;
  createCipheriv(
    algorithm: string,
    key: Uint8Array,
    iv: Uint8Array,
    options?: Record<string, unknown>,
  ): CipherAdapter;
  createDecipheriv(
    algorithm: string,
    key: Uint8Array,
    iv: Uint8Array,
    options?: Record<string, unknown>,
  ): DecipherAdapter;
  pbkdf2Sync(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Bytes;
  pbkdf2?(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Bytes>;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  getCipherInfo?(name: string): { keyLength: number; ivLength: number; mode: string } | undefined;
}

/** @noRailsEquivalent PERMANENT */
export function pbkdf2Async(
  adapter: CryptoAdapter,
  password: string | Uint8Array,
  salt: string | Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
): Promise<Bytes> {
  if (typeof adapter.pbkdf2 === "function") {
    return adapter.pbkdf2(password, salt, iterations, keylen, digest);
  }
  return Promise.resolve().then(() =>
    adapter.pbkdf2Sync(password, salt, iterations, keylen, digest),
  );
}

export interface HashAdapter {
  update(data: string | Uint8Array): HashAdapter;
  digest(): Bytes;
  digest(encoding: string): string;
}

export interface HmacAdapter {
  update(data: string | Uint8Array): HmacAdapter;
  digest(): Bytes;
  digest(encoding: string): string;
}

interface NodeCrypto {
  randomBytes(size: number): Bytes;
  createHash(algorithm: string): HashAdapter;
  createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter;
  createCipheriv(
    algorithm: string,
    key: Uint8Array,
    iv: Uint8Array,
    options?: Record<string, unknown>,
  ): CipherAdapter;
  createDecipheriv(
    algorithm: string,
    key: Uint8Array,
    iv: Uint8Array,
    options?: Record<string, unknown>,
  ): DecipherAdapter;
  pbkdf2Sync(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Bytes;
  pbkdf2(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
    callback: (err: Error | null, key: Bytes) => void,
  ): void;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  getCipherInfo(name: string): { keyLength?: number; ivLength?: number; mode?: string } | undefined;
}

function wrapNodeCrypto(nodeCrypto: NodeCrypto): CryptoAdapter {
  return {
    randomBytes(size: number): Bytes {
      return nodeCrypto.randomBytes(size);
    },
    createHash(algorithm: string): HashAdapter {
      return nodeCrypto.createHash(algorithm);
    },
    createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter {
      return nodeCrypto.createHmac(algorithm, key);
    },
    createCipheriv(
      algorithm: string,
      key: Uint8Array,
      iv: Uint8Array,
      options?: Record<string, unknown>,
    ): CipherAdapter {
      return nodeCrypto.createCipheriv(algorithm, key, iv, options);
    },
    createDecipheriv(
      algorithm: string,
      key: Uint8Array,
      iv: Uint8Array,
      options?: Record<string, unknown>,
    ): DecipherAdapter {
      return nodeCrypto.createDecipheriv(algorithm, key, iv, options);
    },
    pbkdf2Sync(password, salt, iterations, keylen, digest): Bytes {
      return nodeCrypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
    },
    pbkdf2(password, salt, iterations, keylen, digest): Promise<Bytes> {
      return new Promise((resolve, reject) => {
        nodeCrypto.pbkdf2(password, salt, iterations, keylen, digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });
    },
    timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
      return nodeCrypto.timingSafeEqual(a, b);
    },
    getCipherInfo(name: string): { keyLength: number; ivLength: number; mode: string } | undefined {
      const info = nodeCrypto.getCipherInfo(name);
      if (!info || info.keyLength == null || info.ivLength == null) return undefined;
      return { keyLength: info.keyLength, ivLength: info.ivLength, mode: info.mode ?? "" };
    },
  };
}

const registry = new Map<string, CryptoAdapter>();
let currentAdapterName: string | null = null;
let resolved: CryptoAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerCryptoAdapter(name: string, adapter: CryptoAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

/** @noRailsEquivalent PERMANENT */
interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    registry.set("node", wrapNodeCrypto(req("node:crypto") as NodeCrypto));
    return true;
  } catch {
    return false;
  }
}

interface WebCrypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
  subtle?: {
    importKey(
      format: string,
      keyData: Uint8Array,
      algorithm: string | { name: string },
      extractable: boolean,
      keyUsages: string[],
    ): Promise<unknown>;
    deriveBits(
      algorithm: { name: string; salt: Uint8Array; iterations: number; hash: string },
      key: unknown,
      length: number,
    ): Promise<ArrayBuffer>;
  };
}

function webCrypto(): WebCrypto | undefined {
  const candidate = (globalThis as { crypto?: WebCrypto }).crypto;
  return typeof candidate?.getRandomValues === "function" ? candidate : undefined;
}

function toBytes(array: Uint8Array): Bytes {
  const bytes = array as Bytes;
  bytes.toString = (encoding?: string): string => {
    switch (encoding) {
      case "hex":
        return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
      case "base64":
        return btoa(String.fromCharCode(...array));
      case "binary":
      case "latin1":
        return String.fromCharCode(...array);
      case undefined:
      case "utf-8":
      case "utf8":
        return new TextDecoder().decode(array);
      default:
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
  };
  return bytes;
}

function subtleHash(digest: string): string {
  const name = digest.toLowerCase().replace("sha", "sha-").replace("--", "-");
  return name.toUpperCase();
}

type Transform = (h: Uint32Array, w: Uint32Array) => void;

const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n));

const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

// vendor/ruby/v3.3.11/ext/digest/md5/md5.c:199 md5_process
const md5Process: Transform = (h, w) => {
  let [a, b, c, d] = h;
  for (let i = 0; i < 64; i++) {
    const r = i >> 4;
    const f = [(b & c) | (~b & d), (d & b) | (~d & c), b ^ c ^ d, c ^ (b | ~d)][r];
    const g = [i, 5 * i + 1, 3 * i + 5, 7 * i][r] & 15;
    const t = d;
    d = c;
    c = b;
    b = (b + rotl((a + f + MD5_K[i] + w[g]) | 0, MD5_S[r * 4 + (i & 3)])) | 0;
    a = t;
  }
  [a, b, c, d].forEach((x, i) => (h[i] = h[i] + x));
};

// vendor/ruby/v3.3.11/ext/digest/sha1/sha1.c:132 SHA1_Transform
const sha1Transform: Transform = (h, block) => {
  const w = [...block];
  for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
  let [a, b, c, d, e] = h;
  for (let t = 0; t < 80; t++) {
    const r = Math.floor(t / 20);
    const f = [(b & c) | (~b & d), b ^ c ^ d, (b & c) | (b & d) | (c & d), b ^ c ^ d][r];
    const k = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6][r];
    const temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
    e = d;
    d = c;
    c = rotl(b, 30);
    b = a;
    a = temp;
  }
  [a, b, c, d, e].forEach((x, i) => (h[i] = h[i] + x));
};

const PRIMES = [...Array(312).keys()].filter(
  (n) => n > 1 && [...Array(n).keys()].slice(2).every((m) => n % m !== 0),
);
const frac = (x: number): number => Math.floor((x - Math.floor(x)) * 2 ** 32);
const SHA256_K = PRIMES.map((p) => frac(Math.cbrt(p)));
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

// vendor/ruby/v3.3.11/ext/digest/sha2/sha2.c:449 SHA256_Transform
const sha256Transform: Transform = (h, block) => {
  const w = [...block];
  for (let j = 16; j < 64; j++) {
    const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
    const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
    w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, hh] = h;
  for (let j = 0; j < 64; j++) {
    const t1 =
      hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[j] + w[j];
    const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
    [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
  }
  [a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = h[i] + x));
};

const WEB_DIGESTS: Record<string, { init: () => number[]; transform: Transform; le: boolean }> = {
  md5: {
    init: () => [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476],
    transform: md5Process,
    le: true,
  },
  sha1: {
    init: () => [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0],
    transform: sha1Transform,
    le: false,
  },
  sha256: {
    init: () => PRIMES.slice(0, 8).map((p) => frac(Math.sqrt(p))),
    transform: sha256Transform,
    le: false,
  },
};

function webDigest(algorithm: string, message: Uint8Array): Uint8Array {
  const { init, transform, le } = WEB_DIGESTS[algorithm];
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(padded.length - (le ? 8 : 4), bits >>> 0, le);
  view.setUint32(padded.length - (le ? 4 : 8), Math.floor(bits / 2 ** 32), le);
  const h = new Uint32Array(init());
  const w = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, le);
    transform(h, w);
  }
  const out = new DataView(new ArrayBuffer(h.length * 4));
  h.forEach((x, i) => out.setUint32(i * 4, x, le));
  return new Uint8Array(out.buffer);
}

function webHashAdapter(algorithm: string, finish: (message: Uint8Array) => Uint8Array) {
  const name = algorithm.toLowerCase().replace("-", "");
  if (!(name in WEB_DIGESTS)) throw new Error("Digest method not supported");
  const parts: Uint8Array[] = [];
  const adapter = {
    update(data: string | Uint8Array) {
      parts.push(typeof data === "string" ? new TextEncoder().encode(data) : data);
      return adapter;
    },
    digest(encoding?: string) {
      const message = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
      parts.reduce((offset, part) => (message.set(part, offset), offset + part.length), 0);
      const bytes = toBytes(finish(message));
      return encoding === undefined ? bytes : bytes.toString(encoding);
    },
  };
  return { name, adapter: adapter as HashAdapter & HmacAdapter };
}

function wrapWebCrypto(crypto: WebCrypto): CryptoAdapter {
  const adapter: Partial<CryptoAdapter> = {
    randomBytes(size: number): Bytes {
      return toBytes(crypto.getRandomValues(new Uint8Array(size)));
    },
    timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
      if (a.length !== b.length) {
        const error = new RangeError("Input buffers must have the same byte length");
        (error as { code?: string }).code = "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH";
        throw error;
      }
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    },
    createHash(algorithm: string): HashAdapter {
      const hash = webHashAdapter(algorithm, (message) => webDigest(hash.name, message));
      return hash.adapter;
    },
    createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter {
      const hmac = webHashAdapter(algorithm, (message) => {
        let k = typeof key === "string" ? new TextEncoder().encode(key) : key;
        if (k.length > 64) k = webDigest(hmac.name, k);
        const pad = (byte: number, tail: Uint8Array): Uint8Array => {
          const block = new Uint8Array(64 + tail.length);
          for (let i = 0; i < 64; i++) block[i] = (k[i] ?? 0) ^ byte;
          block.set(tail, 64);
          return block;
        };
        return webDigest(hmac.name, pad(0x5c, webDigest(hmac.name, pad(0x36, message))));
      });
      return hmac.adapter;
    },
    async pbkdf2(
      password: string | Uint8Array,
      salt: string | Uint8Array,
      iterations: number,
      keylen: number,
      digest: string,
    ): Promise<Bytes> {
      const subtle = crypto.subtle;
      if (!subtle) throw new Error('Crypto adapter "web" does not implement pbkdf2.');
      const encoder = new TextEncoder();
      const key = await subtle.importKey(
        "raw",
        typeof password === "string" ? encoder.encode(password) : password,
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const bits = await subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: typeof salt === "string" ? encoder.encode(salt) : salt,
          iterations,
          hash: subtleHash(digest),
        },
        key,
        keylen * 8,
      );
      return toBytes(new Uint8Array(bits));
    },
  };
  return adapter as CryptoAdapter;
}

let webAttempted = false;

function tryAutoRegisterWebCrypto(): boolean {
  if (registry.has("web")) return true;
  if (webAttempted) return false;
  webAttempted = true;
  const crypto = webCrypto();
  if (!crypto) return false;
  registry.set("web", wrapWebCrypto(crypto));
  return true;
}

const REQUIRED_MEMBERS = [
  "randomBytes",
  "createHash",
  "createHmac",
  "createCipheriv",
  "createDecipheriv",
  "pbkdf2Sync",
  "timingSafeEqual",
] as const;

function completeAdapter(name: string, adapter: CryptoAdapter): CryptoAdapter {
  const missing = REQUIRED_MEMBERS.filter(
    (member) => typeof (adapter as unknown as Record<string, unknown>)[member] !== "function",
  );
  if (missing.length === 0) return adapter;

  const completed = { ...adapter } as unknown as Record<string, unknown>;
  for (const member of missing) {
    completed[member] = (): never => {
      throw new Error(`Crypto adapter "${name}" does not implement ${member}.`);
    };
  }
  return completed as unknown as CryptoAdapter;
}

function resolve(): CryptoAdapter {
  if (resolved) return resolved;

  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Crypto adapter "${name}" is not registered.`);
    resolved = completeAdapter(name, reg);
    return resolved;
  }

  if (tryAutoRegisterNode()) {
    resolved = completeAdapter("node", registry.get("node")!);
    return resolved;
  }

  if (tryAutoRegisterWebCrypto()) {
    resolved = completeAdapter("web", registry.get("web")!);
    return resolved;
  }

  throw new Error(
    "No crypto adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; " +
      "otherwise set ActiveSupport.cryptoAdapter or register a custom adapter.",
  );
}

/** @noRailsEquivalent PERMANENT */
export function getCrypto(): CryptoAdapter {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export async function getCryptoAsync(): Promise<CryptoAdapter> {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export const cryptoAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
