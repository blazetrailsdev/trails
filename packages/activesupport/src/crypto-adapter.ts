/**
 * Crypto adapter — mirrors the Rails adapter pattern.
 */

export interface CryptoAdapter {
  randomBytes(size: number): Uint8Array;
  createHash(algorithm: string): HashAdapter;
  createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter;
  pbkdf2Sync(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Uint8Array;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

export interface HashAdapter {
  update(data: string | Uint8Array): HashAdapter;
  digest(encoding: "hex" | "base64"): string;
}

export interface HmacAdapter {
  update(data: string | Uint8Array): HmacAdapter;
  digest(encoding: "hex" | "base64"): string;
}

function wrapNodeCrypto(nodeCrypto: typeof import("node:crypto")): CryptoAdapter {
  return {
    randomBytes(size: number): Uint8Array {
      return new Uint8Array(nodeCrypto.randomBytes(size));
    },
    createHash(algorithm: string): HashAdapter {
      return nodeCrypto.createHash(algorithm);
    },
    createHmac(algorithm: string, key: string | Uint8Array): HmacAdapter {
      return nodeCrypto.createHmac(algorithm, key);
    },
    pbkdf2Sync(password, salt, iterations, keylen, digest): Uint8Array {
      return new Uint8Array(nodeCrypto.pbkdf2Sync(password, salt, iterations, keylen, digest));
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

export const cryptoAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
