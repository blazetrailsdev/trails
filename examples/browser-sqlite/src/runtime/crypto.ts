import { cbc, gcm } from "@noble/ciphers/aes.js";
import { hmac } from "@noble/hashes/hmac.js";
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import {
  cryptoAdapterConfig,
  registerCryptoAdapter,
  type Bytes,
  type CryptoAdapter,
  type HashAdapter,
} from "@blazetrails/ruby-compat";

/**
 * A synchronous crypto adapter for the browser. Web Crypto is async-only,
 * and trails derives keys (`KeyGenerator`), signs and encrypts cookies
 * (`MessageVerifier`, `MessageEncryptor`, AES-256-GCM) synchronously, as
 * Rails does over OpenSSL; the noble libraries do the same in pure JS.
 */
const HASHES = { md5, sha1, sha256, sha384, sha512 } as const;
type HashName = keyof typeof HASHES;

const encoder = new TextEncoder();

function hashFn(algorithm: string) {
  const name = algorithm.toLowerCase().replace("-", "") as HashName;
  const fn = HASHES[name];
  if (!fn) throw new Error(`Digest method not supported: ${algorithm}`);
  return fn;
}

function bytes(data: Uint8Array): Bytes {
  const out = new Uint8Array(data) as Bytes;
  out.toString = (encoding?: string) => encode(out, encoding);
  return out;
}

function encode(data: Uint8Array, encoding?: string): string {
  switch (encoding) {
    case "hex":
      return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
    case "base64":
      return btoa(String.fromCharCode(...data));
    case "base64url":
      return btoa(String.fromCharCode(...data))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    case "latin1":
    case "binary":
      return String.fromCharCode(...data);
    default:
      return new TextDecoder().decode(data);
  }
}

function decode(data: string | Uint8Array, encoding?: string): Uint8Array {
  if (typeof data !== "string") return data;
  switch (encoding) {
    case "hex":
      return Uint8Array.from(data.match(/../g) ?? [], (h) => parseInt(h, 16));
    case "base64":
    case "base64url": {
      const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
      return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    }
    case "latin1":
    case "binary":
      return Uint8Array.from(data, (c) => c.charCodeAt(0));
    default:
      return encoder.encode(data);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function digester(update: (data: Uint8Array) => void, finish: () => Uint8Array): HashAdapter {
  const adapter = {
    update(data: string | Uint8Array) {
      update(decode(data));
      return adapter;
    },
    digest(encoding?: string) {
      const out = bytes(finish());
      return encoding ? out.toString(encoding) : out;
    },
  };
  return adapter as HashAdapter;
}

function cipherInfo(algorithm: string) {
  const match = /^aes-(128|192|256)-(gcm|cbc)$/.exec(algorithm.toLowerCase());
  if (!match) throw new Error(`Unsupported cipher in the browser: ${algorithm}`);
  return {
    keyLength: Number(match[1]) / 8,
    ivLength: match[2] === "gcm" ? 12 : 16,
    mode: match[2],
  };
}

/**
 * Node's streaming cipher shape over a one-shot noble cipher: `update`
 * buffers, `final` runs the cipher. Callers concatenate `update` and `final`
 * output, so the result is the same bytes.
 */
function streaming(run: (input: Uint8Array) => Uint8Array, extra: Record<string, unknown> = {}) {
  const chunks: Uint8Array[] = [];
  const adapter = {
    update(data: string | Uint8Array, inputEncoding?: string, outputEncoding?: string) {
      chunks.push(decode(data, inputEncoding));
      return outputEncoding ? "" : bytes(new Uint8Array());
    },
    final(outputEncoding?: string) {
      const out = bytes(run(concat(chunks)));
      return outputEncoding ? out.toString(outputEncoding) : out;
    },
    ...extra,
  };
  return adapter;
}

function cipher(algorithm: string, key: Uint8Array, iv: Uint8Array, decrypt: boolean) {
  const { mode } = cipherInfo(algorithm);
  if (mode === "cbc") {
    const aes = cbc(key, iv);
    return streaming((input) => (decrypt ? aes.decrypt(input) : aes.encrypt(input)));
  }
  let aad: Uint8Array | undefined;
  let tag: Uint8Array | undefined;
  const adapter = streaming(
    (input) => {
      const aes = gcm(key, iv, aad);
      if (decrypt) return aes.decrypt(concat([input, tag ?? new Uint8Array()]));
      const sealed = aes.encrypt(input);
      tag = sealed.subarray(sealed.length - 16);
      return sealed.subarray(0, sealed.length - 16);
    },
    {
      setAAD(buffer: Uint8Array) {
        aad = buffer;
        return adapter;
      },
      getAuthTag: () => bytes(tag!),
      setAuthTag(t: Uint8Array) {
        tag = t;
        return adapter;
      },
    },
  );
  return adapter;
}

export function installCrypto(): void {
  const adapter: CryptoAdapter = {
    randomBytes: (size) => bytes(crypto.getRandomValues(new Uint8Array(size))),
    createHash(algorithm) {
      const h = hashFn(algorithm).create();
      return digester(
        (d) => h.update(d),
        () => h.digest(),
      );
    },
    createHmac(algorithm, key) {
      const h = hmac.create(hashFn(algorithm), decode(key));
      return digester(
        (d) => h.update(d),
        () => h.digest(),
      );
    },
    createCipheriv: (algorithm, key, iv) =>
      cipher(algorithm, key, iv, false) as unknown as ReturnType<CryptoAdapter["createCipheriv"]>,
    createDecipheriv: (algorithm, key, iv) =>
      cipher(algorithm, key, iv, true) as unknown as ReturnType<CryptoAdapter["createDecipheriv"]>,
    pbkdf2Sync: (password, salt, iterations, keylen, digest) =>
      bytes(
        pbkdf2(hashFn(digest), decode(password), decode(salt), { c: iterations, dkLen: keylen }),
      ),
    async pbkdf2(password, salt, iterations, keylen, digest) {
      return adapter.pbkdf2Sync(password, salt, iterations, keylen, digest);
    },
    timingSafeEqual(a, b) {
      if (a.length !== b.length)
        throw new RangeError("Input buffers must have the same byte length");
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    },
    getCipherInfo: (name) => {
      try {
        return cipherInfo(name);
      } catch {
        return undefined;
      }
    },
  };
  registerCryptoAdapter("browser", adapter);
  cryptoAdapterConfig.adapter = "browser";
}
