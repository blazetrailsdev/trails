import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  cryptoAdapterConfig,
  getCrypto,
  registerCryptoAdapter,
  type CryptoAdapter,
} from "./crypto-adapter.js";
import { Cipher } from "./openssl.js";

describe("Cipher", () => {
  it("mints a random iv of the cipher's iv length before the underlying cipher exists", () => {
    const cipher = new Cipher("aes-256-gcm");
    cipher.encrypt();
    cipher.key = getCrypto().randomBytes(cipher.keyLen);

    const iv = cipher.randomIv();

    expect(iv.length).toBe(cipher.ivLen);
    expect(cipher.randomIv()).not.toEqual(iv);
  });

  it("round-trips through the iv it minted", () => {
    const key = getCrypto().randomBytes(32);

    const cipher = new Cipher("aes-256-gcm");
    cipher.encrypt();
    cipher.key = key;
    const iv = cipher.randomIv();
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from("some text", "utf-8")),
      cipher.final(),
    ]);
    const authTag = cipher.authTag;

    const decipher = new Cipher("aes-256-gcm");
    decipher.decrypt();
    decipher.key = key;
    decipher.iv = iv;
    decipher.authTag = authTag;

    expect(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8")).toBe(
      "some text",
    );
  });

  it("raises when used before its key or iv is set", () => {
    const cipher = new Cipher("aes-256-gcm");
    cipher.encrypt();

    expect(() => cipher.update(Buffer.from("x"))).toThrow("Cipher key not set");
  });
});

describe("getCrypto", () => {
  it("auto-registers the node adapter under a pure ESM entry module", async () => {
    const module = JSON.stringify(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "crypto-adapter.js"),
    );
    const source =
      `const { getCrypto } = await import(${module});\n` +
      `console.log(getCrypto().randomBytes(10).toString("hex").length);`;

    const { stdout, error } = await new Promise<{ stdout: string; error: string | null }>(
      (resolve) => {
        execFile("node", ["--input-type=module", "-e", source], (err, out) =>
          resolve({ stdout: out.trim(), error: err ? err.message : null }),
        );
      },
    );

    expect(error).toBeNull();
    expect(stdout).toBe("20");
  }, 30_000);
});

describe("registerCryptoAdapter", () => {
  it("fails at the seam naming the member a partial adapter does not implement", () => {
    const partial = {
      randomBytes: (size: number) => new Uint8Array(size),
    } as unknown as CryptoAdapter;

    registerCryptoAdapter("partial", partial);
    const previous = cryptoAdapterConfig.adapter;
    cryptoAdapterConfig.adapter = "partial";
    try {
      expect(getCrypto().randomBytes(4).length).toBe(4);
      expect(() => getCrypto().createHash("sha256")).toThrow(
        'Crypto adapter "partial" does not implement createHash.',
      );
      expect(() => getCrypto().createHmac("sha256", "key")).toThrow(
        'Crypto adapter "partial" does not implement createHmac.',
      );
      expect(() =>
        getCrypto().createCipheriv("aes-256-gcm", new Uint8Array(32), new Uint8Array(12)),
      ).toThrow('Crypto adapter "partial" does not implement createCipheriv.');
      expect(() =>
        getCrypto().createDecipheriv("aes-256-gcm", new Uint8Array(32), new Uint8Array(12)),
      ).toThrow('Crypto adapter "partial" does not implement createDecipheriv.');
      expect(() => getCrypto().pbkdf2Sync("p", "s", 1, 16, "sha256")).toThrow(
        'Crypto adapter "partial" does not implement pbkdf2Sync.',
      );
      expect(() => getCrypto().timingSafeEqual(new Uint8Array(1), new Uint8Array(1))).toThrow(
        'Crypto adapter "partial" does not implement timingSafeEqual.',
      );
    } finally {
      cryptoAdapterConfig.adapter = previous;
    }
  });
});

describe("getCrypto in a browser", () => {
  it("auto-registers a Web Crypto adapter when there is no node process", async () => {
    const module = JSON.stringify(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "crypto-adapter.js"),
    );
    const source =
      `delete globalThis.process;\n` +
      `const { getCrypto, pbkdf2Async } = await import(${module});\n` +
      `const crypto = getCrypto();\n` +
      `console.log(crypto.randomBytes(10).toString("hex").length);\n` +
      `console.log(crypto.timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])));\n` +
      `console.log(crypto.timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])));\n` +
      `try { crypto.timingSafeEqual(new Uint8Array(1), new Uint8Array(2)); } catch (e) { console.log(e.constructor.name + ": " + e.message + " [" + e.code + "]"); }\n` +
      `console.log((await pbkdf2Async(crypto, "password", "salt", 2, 16, "sha256")).length);\n` +
      `console.log(crypto.createHash("md5").update("abc").digest("hex"));\n` +
      `console.log(crypto.createHash("sha1").update("abc").digest("hex"));\n` +
      `console.log(crypto.createHash("sha256").update("a").update("bc").digest("hex"));\n` +
      `console.log(crypto.createHmac("sha256", "key").update("abc").digest("hex"));\n` +
      `try { crypto.createCipheriv("aes-256-gcm", new Uint8Array(32), new Uint8Array(12)); } catch (e) { console.log(e.message); }`;

    const { stdout, error } = await new Promise<{ stdout: string; error: string | null }>(
      (resolve) => {
        execFile("node", ["--input-type=module", "-e", source], (err, out) =>
          resolve({ stdout: out.trim(), error: err ? err.message : null }),
        );
      },
    );

    expect(error).toBeNull();
    expect(stdout.split("\n")).toEqual([
      "20",
      "true",
      "false",
      "RangeError: Input buffers must have the same byte length [ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH]",
      "16",
      "900150983cd24fb0d6963f7d28e17f72",
      "a9993e364706816aba3e25717850c26c9cd0d89d",
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab",
      'Crypto adapter "web" does not implement createCipheriv.',
    ]);
  }, 30_000);
});
