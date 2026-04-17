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
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
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
    timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
      return nodeCrypto.timingSafeEqual(a, b);
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

    const nodeModule =
      typeof require !== "undefined"
        ? // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("node:module")
        : null;
    if (!nodeModule) return false;
    const req = nodeModule.createRequire(
      typeof __filename !== "undefined" ? __filename : "file:///activesupport",
    );
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
    "No crypto adapter configured. Set ActiveSupport.cryptoAdapter or register a custom adapter.",
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
