/**
 * Crypto adapter — mirrors the Rails adapter pattern.
 */

export interface CipherAdapter {
  update(data: string, inputEncoding: string, outputEncoding: string): string;
  update(data: string | Uint8Array, inputEncoding?: string): Buffer;
  final(outputEncoding: string): string;
  final(): Buffer;
  setAAD?(buffer: Uint8Array): this;
  getAuthTag?(): Buffer;
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
  randomBytes(size: number): Buffer;
  randomUUID(): string;
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
  ): Buffer;
  /**
   * Async PBKDF2 — when implemented, runs on a threadpool so hot
   * per-request paths don't block the event loop. **Optional**: callers
   * should go through `pbkdf2Async(adapter, ...)` below, which falls
   * back to wrapping `pbkdf2Sync` in `Promise.resolve` for adapters that
   * don't ship an async implementation. Marking this optional keeps
   * downstream custom adapters source-compatible.
   */
  pbkdf2?(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Buffer>;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  /**
   * Key and IV sizes for a cipher name. **Optional**: only `Cipher`
   * needs it, so adapters that never mint their own IV stay
   * source-compatible.
   */
  getCipherInfo?(name: string): { keyLength: number; ivLength: number } | undefined;
}

/**
 * An `OpenSSL::Cipher` analogue: a cipher object that exists before its
 * IV does, so a Rails body can build the cipher, ask it for a random IV
 * (`randomIv`, OpenSSL's `random_iv`), and assign the IV afterwards.
 * Node's `createCipheriv` takes key and IV as construction arguments, so
 * the underlying adapter cipher is constructed lazily on first use.
 */
export class Cipher {
  readonly name: string;

  private mode: "encrypt" | "decrypt" | null = null;
  private currentKey: Uint8Array | null = null;
  private currentIv: Uint8Array | null = null;
  private impl: CipherAdapter | DecipherAdapter | null = null;

  constructor(name: string) {
    this.name = name;
  }

  get keyLen(): number {
    return this.cipherInfo().keyLength;
  }

  get ivLen(): number {
    return this.cipherInfo().ivLength;
  }

  encrypt(): this {
    this.mode = "encrypt";
    return this;
  }

  decrypt(): this {
    this.mode = "decrypt";
    return this;
  }

  set key(key: Uint8Array) {
    this.currentKey = key;
  }

  set iv(iv: Uint8Array) {
    this.currentIv = iv;
  }

  /** Mint a random IV of this cipher's IV length and assign it. */
  randomIv(): Buffer {
    const iv = getCrypto().randomBytes(this.ivLen);
    this.currentIv = iv;
    return iv;
  }

  set authTag(tag: Uint8Array) {
    const impl = this.started();
    if (!impl.setAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (setAuthTag)");
    }
    impl.setAuthTag(tag);
  }

  get authTag(): Buffer {
    const impl = this.started() as CipherAdapter;
    if (!impl.getAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (getAuthTag)");
    }
    return Buffer.from(impl.getAuthTag());
  }

  /** Mirrors: `OpenSSL::Cipher#auth_data=` — Node spells it `setAAD`. */
  set authData(data: Uint8Array | string) {
    const impl = this.started();
    if (!impl.setAAD) {
      throw new Error("Crypto adapter does not support AEAD auth data (setAAD)");
    }
    impl.setAAD(typeof data === "string" ? Buffer.from(data, "utf8") : data);
  }

  update(data: Uint8Array): Buffer {
    return Buffer.from((this.started() as CipherAdapter).update(data));
  }

  final(): Buffer {
    return Buffer.from((this.started() as CipherAdapter).final());
  }

  private cipherInfo(): { keyLength: number; ivLength: number } {
    const crypto = getCrypto();
    const info = crypto.getCipherInfo?.(this.name);
    if (!info) {
      throw new Error(`Crypto adapter does not know cipher "${this.name}" (getCipherInfo)`);
    }
    return info;
  }

  private started(): CipherAdapter | DecipherAdapter {
    if (this.impl) return this.impl;
    if (!this.mode) throw new Error("Cipher mode not set: call encrypt() or decrypt() first");
    if (!this.currentKey) throw new Error("Cipher key not set");
    if (!this.currentIv) throw new Error("Cipher iv not set");
    const crypto = getCrypto();
    this.impl =
      this.mode === "encrypt"
        ? crypto.createCipheriv(this.name, this.currentKey, this.currentIv)
        : crypto.createDecipheriv(this.name, this.currentKey, this.currentIv);
    return this.impl;
  }
}

/**
 * Use the adapter's async `pbkdf2` when available, otherwise wrap the
 * sync implementation. Lets call sites prefer the threadpool path
 * without breaking adapters that only implement `pbkdf2Sync`.
 */
export function pbkdf2Async(
  adapter: CryptoAdapter,
  password: string | Uint8Array,
  salt: string | Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
): Promise<Buffer> {
  if (typeof adapter.pbkdf2 === "function") {
    return adapter.pbkdf2(password, salt, iterations, keylen, digest);
  }
  // Defer the sync call so a synchronous throw becomes a Promise
  // rejection — keeps the function's async contract intact for `.catch`
  // callers regardless of how the underlying adapter behaves.
  return Promise.resolve().then(() =>
    adapter.pbkdf2Sync(password, salt, iterations, keylen, digest),
  );
}

export interface HashAdapter {
  update(data: string | Uint8Array): HashAdapter;
  digest(): Buffer;
  digest(encoding: string): string;
}

export interface HmacAdapter {
  update(data: string | Uint8Array): HmacAdapter;
  digest(): Buffer;
  digest(encoding: string): string;
}

function wrapNodeCrypto(nodeCrypto: typeof import("node:crypto")): CryptoAdapter {
  return {
    randomBytes(size: number): Buffer {
      return nodeCrypto.randomBytes(size);
    },
    randomUUID(): string {
      return nodeCrypto.randomUUID();
    },
    createHash(algorithm: string): HashAdapter {
      return nodeCrypto.createHash(algorithm) as unknown as HashAdapter;
    },
    createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter {
      return nodeCrypto.createHmac(algorithm, key) as unknown as HmacAdapter;
    },
    createCipheriv(
      algorithm: string,
      key: Uint8Array,
      iv: Uint8Array,
      options?: Record<string, unknown>,
    ): CipherAdapter {
      return nodeCrypto.createCipheriv(
        algorithm,
        key,
        iv,
        options as any,
      ) as unknown as CipherAdapter;
    },
    createDecipheriv(
      algorithm: string,
      key: Uint8Array,
      iv: Uint8Array,
      options?: Record<string, unknown>,
    ): DecipherAdapter {
      return nodeCrypto.createDecipheriv(
        algorithm,
        key,
        iv,
        options as any,
      ) as unknown as DecipherAdapter;
    },
    pbkdf2Sync(password, salt, iterations, keylen, digest): Buffer {
      return nodeCrypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
    },
    pbkdf2(password, salt, iterations, keylen, digest): Promise<Buffer> {
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
    getCipherInfo(name: string): { keyLength: number; ivLength: number } | undefined {
      const info = nodeCrypto.getCipherInfo(name);
      if (!info || info.keyLength == null || info.ivLength == null) return undefined;
      return { keyLength: info.keyLength, ivLength: info.ivLength };
    },
  };
}

const registry = new Map<string, CryptoAdapter>();
let currentAdapterName: string | null = null;
let resolved: CryptoAdapter | null = null;

export function registerCryptoAdapter(name: string, adapter: CryptoAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
      return false;
    }

    // Node >= 22.3 exposes builtins synchronously from ESM, where
    // `require` is undefined and `import()` is a promise. This is the only
    // sync path a pure-ESM entry has to `node:crypto`.
    const builtin = globalThis.process.getBuiltinModule?.("node:crypto") as
      | typeof import("node:crypto")
      | undefined;
    if (builtin) {
      registry.set("node", wrapNodeCrypto(builtin));
      return true;
    }

    const nodeModule =
      typeof require !== "undefined"
        ? // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("node:module")
        : null;
    if (!nodeModule) return false;
    // Only Node builtins are loaded through this require, so the base path is
    // never resolved against — a fixed sentinel keeps the file off `__filename`,
    // which ruby-compat's browser-safe-leaf lint bans outright.
    const req = nodeModule.createRequire("file:///activesupport");
    const nodeCrypto = req("node:crypto") as typeof import("node:crypto");
    registry.set("node", wrapNodeCrypto(nodeCrypto));
    return true;
  } catch {
    return false;
  }
}

function resolve(): CryptoAdapter {
  if (resolved) return resolved;

  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Crypto adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }

  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }

  throw new Error(
    "No crypto adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.cryptoAdapter or register a custom adapter.",
  );
}

export function getCrypto(): CryptoAdapter {
  return resolve();
}

let nodeAsyncPromise: Promise<boolean> | null = null;

function tryAutoRegisterNodeAsync(): Promise<boolean> {
  if (registry.has("node")) return Promise.resolve(true);
  if (!nodeAsyncPromise) {
    nodeAsyncPromise = (async () => {
      try {
        if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
          return false;
        }
        const nodeCrypto = (await import("node:crypto")) as unknown as typeof import("node:crypto");
        registry.set("node", wrapNodeCrypto(nodeCrypto));
        return true;
      } catch {
        return false;
      }
    })();
  }
  return nodeAsyncPromise;
}

export async function getCryptoAsync(): Promise<CryptoAdapter> {
  try {
    return resolve();
  } catch (error) {
    if (currentAdapterName) throw error;
    if (await tryAutoRegisterNodeAsync()) {
      resolved = registry.get("node")!;
      return resolved;
    }
    throw error;
  }
}

export const cryptoAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
