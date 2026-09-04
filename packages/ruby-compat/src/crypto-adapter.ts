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
