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
  ): Bytes;
  pbkdf2?(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Bytes>;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  getCipherInfo?(name: string): { keyLength: number; ivLength: number } | undefined;
}

/** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
export class Cipher {
  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  readonly name: string;

  private mode: "encrypt" | "decrypt" | null = null;
  private currentKey: Uint8Array | null = null;
  private currentIv: Uint8Array | null = null;
  private impl: CipherAdapter | DecipherAdapter | null = null;

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  constructor(name: string) {
    this.name = name;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  get keyLen(): number {
    return this.cipherInfo().keyLength;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  get ivLen(): number {
    return this.cipherInfo().ivLength;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  encrypt(): this {
    this.mode = "encrypt";
    return this;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  decrypt(): this {
    this.mode = "decrypt";
    return this;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  set key(key: Uint8Array) {
    this.currentKey = key;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  set iv(iv: Uint8Array) {
    this.currentIv = iv;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  randomIv(): Bytes {
    const iv = getCrypto().randomBytes(this.ivLen);
    this.currentIv = iv;
    return iv;
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  set authTag(tag: Uint8Array) {
    const impl = this.started();
    if (!impl.setAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (setAuthTag)");
    }
    impl.setAuthTag(tag);
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  get authTag(): Bytes {
    const impl = this.started() as CipherAdapter;
    if (!impl.getAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (getAuthTag)");
    }
    return impl.getAuthTag();
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  set authData(data: Uint8Array | string) {
    const impl = this.started();
    if (!impl.setAAD) {
      throw new Error("Crypto adapter does not support AEAD auth data (setAAD)");
    }
    impl.setAAD(typeof data === "string" ? new TextEncoder().encode(data) : data);
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  update(data: Uint8Array): Bytes {
    return (this.started() as CipherAdapter).update(data);
  }

  /** @noRailsEquivalent CONVERGEABLE redress-crypto-adapter-as-securerandom-digest-and-openssl-cipher */
  final(): Bytes {
    return (this.started() as CipherAdapter).final();
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
  getCipherInfo(name: string): { keyLength?: number; ivLength?: number } | undefined;
}

function wrapNodeCrypto(nodeCrypto: NodeCrypto): CryptoAdapter {
  return {
    randomBytes(size: number): Bytes {
      return nodeCrypto.randomBytes(size);
    },
    randomUUID(): string {
      return nodeCrypto.randomUUID();
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
