/**
 * EncryptedFile — port of `ActiveSupport::EncryptedFile`.
 *
 * Reads / writes a file whose contents are encrypted with a key sourced
 * from either an env var (`envKey`) or a key file on disk (`keyPath`).
 * Mirrors `vendor/rails/activesupport/lib/active_support/encrypted_file.rb`
 * method-for-method, including the private surface
 * (`writing`, `encrypt`, `decrypt`, `encryptor`, `readEnvKey`,
 * `readKeyFile`, `handleMissingKey`, `checkKeyLength`).
 *
 * Documented divergences from Rails:
 *
 * - **Async API.** Rails is sync; the async surface is required for
 *   trailties' "async fs only" rule and for browser hosts without sync fs.
 * - **Default cipher = `aes-256-cbc`.** Rails uses `aes-128-gcm`. Our
 *   `MessageEncryptor` does not yet handle GCM auth tags; cipher will flip
 *   to `aes-128-gcm` in a follow-up that lands GCM support there.
 * - **Default serializer = `NullSerializer`** (raw string in/out). Rails
 *   uses `Marshal`; we have no Marshal port. The higher-level
 *   `EncryptedConfiguration` parses contents itself.
 * - **Env lookup goes through `processAdapter.env`**, not `process.env`.
 */

import { getCrypto } from "./crypto-adapter.js";
import { getFsAsync, getPathAsync } from "./fs-adapter.js";
import { MessageEncryptor, NullSerializer } from "./message-encryptor.js";
import { env as processEnv } from "./process-adapter.js";

const CIPHER = "aes-256-cbc";
// Bytes of key material consumed by CIPHER. expectedKeyLength() reports the
// hex-encoded length (2 chars per byte), matching Rails' generate_key.length.
const KEY_BYTES = 32;

export class MissingContentError extends Error {
  constructor(contentPath: string) {
    super(`Missing encrypted content file in ${contentPath}.`);
    this.name = "MissingContentError";
  }
}

export class MissingKeyError extends Error {
  constructor(opts: { keyPath: string; envKey: string }) {
    super(
      `Missing encryption key to decrypt file with. ` +
        `Ask your team for your master key and write it to ${opts.keyPath} ` +
        `or put it in the ENV['${opts.envKey}'].`,
    );
    this.name = "MissingKeyError";
  }
}

export class InvalidKeyLengthError extends Error {
  constructor() {
    super(`Encryption key must be exactly ${EncryptedFile.expectedKeyLength()} characters.`);
    this.name = "InvalidKeyLengthError";
  }
}

export interface EncryptedFileOptions {
  contentPath: string;
  keyPath: string;
  envKey: string;
  raiseIfMissingKey: boolean;
}

export class EncryptedFile {
  readonly contentPath: string;
  readonly keyPath: string;
  readonly envKey: string;
  readonly raiseIfMissingKey: boolean;

  private keyFileContents: string | null = null;
  private keyFileChecked = false;
  private resolvedContentPath: string | null = null;
  private memoEncryptor: MessageEncryptor | null = null;

  constructor(opts: EncryptedFileOptions) {
    this.contentPath = opts.contentPath;
    this.keyPath = opts.keyPath;
    this.envKey = opts.envKey;
    this.raiseIfMissingKey = opts.raiseIfMissingKey;
  }

  static generateKey(): string {
    // Rails: SecureRandom.hex(MessageEncryptor.key_len(CIPHER)).
    // Sourced from cryptoAdapter so we never fall back to non-cryptographic
    // randomness. In Node the adapter auto-registers synchronously; browser
    // hosts must register a webcrypto adapter before calling generateKey().
    return Buffer.from(getCrypto().randomBytes(KEY_BYTES)).toString("hex");
  }

  static expectedKeyLength(): number {
    return KEY_BYTES * 2;
  }

  async key(): Promise<string | null> {
    const envValue = this.readEnvKey();
    if (envValue) return envValue;
    const fileValue = await this.readKeyFile();
    if (fileValue) return fileValue;
    return this.handleMissingKey();
  }

  /** Rails: `key?`. */
  async isKey(): Promise<boolean> {
    if (this.readEnvKey()) return true;
    return (await this.readKeyFile()) !== null;
  }

  async read(): Promise<string> {
    const key = await this.key();
    const fs = await getFsAsync();
    const path = await this.resolveContentPath();
    if (key !== null && (await fs.exists!(path))) {
      const raw = (await fs.readFile!(path, "utf8")).trim();
      return this.decrypt(key, raw);
    }
    throw new MissingContentError(path);
  }

  async write(contents: string): Promise<void> {
    const key = await this.key();
    if (key === null) {
      // raiseIfMissingKey=false + no key: nothing to encrypt with.
      throw new MissingKeyError({ keyPath: this.keyPath, envKey: this.envKey });
    }
    const fs = await getFsAsync();
    const path = await this.resolveContentPath();
    const tmp = `${path}.tmp`;
    await fs.writeFile!(tmp, this.encrypt(key, contents), { mode: 0o600 });
    await fs.rename!(tmp, path);
  }

  async change(block: (tmpPath: string) => void | Promise<void>): Promise<void> {
    await this.writing(await this.readOrEmpty(), block);
  }

  // ---- private ----

  private async writing(
    contents: string,
    block: (tmpPath: string) => void | Promise<void>,
  ): Promise<void> {
    const fs = await getFsAsync();
    const path = await getPathAsync();
    const resolved = await this.resolveContentPath();
    const base = path.basename(resolved).replace(/\.enc$/, "");
    const dir = await fs.mkdtemp!(`${path.dirname(resolved)}${path.sep}encfile-`);
    const tmpPath = path.join(dir, `-${base}`);
    try {
      // Rails uses Ruby `Tempfile.create`, which defaults to mode 0600.
      // The temp file holds plaintext secrets between the editor write and
      // the re-encrypt step, so it must not be world-readable.
      await fs.writeFile!(tmpPath, contents, { mode: 0o600 });
      await block(tmpPath);
      const updated = await fs.readFile!(tmpPath, "utf8");
      if (updated !== contents) await this.write(updated);
    } finally {
      try {
        await fs.unlink!(tmpPath);
      } catch {
        /* tmp already gone */
      }
      try {
        // Rails' Tempfile cleans both file and (implicit) dir; mkdtemp gives
        // us our own dir, so remove it explicitly to avoid encfile-*/ leaks.
        await fs.rmdir!(dir);
      } catch {
        /* dir already gone */
      }
    }
  }

  private encrypt(key: string, plaintext: string): string {
    this.checkKeyLength(key);
    return this.encryptor(key).encryptAndSign(plaintext);
  }

  private decrypt(key: string, ciphertext: string): string {
    return this.encryptor(key).decryptAndVerify(ciphertext) as string;
  }

  private encryptor(key: string): MessageEncryptor {
    if (this.memoEncryptor) return this.memoEncryptor;
    this.memoEncryptor = new MessageEncryptor(Buffer.from(key, "hex"), {
      cipher: CIPHER,
      serializer: NullSerializer,
    });
    return this.memoEncryptor;
  }

  private readEnvKey(): string | null {
    const v = processEnv[this.envKey];
    return v && v.length > 0 ? v : null;
  }

  private async readKeyFile(): Promise<string | null> {
    if (this.keyFileChecked) return this.keyFileContents;
    this.keyFileChecked = true;
    const fs = await getFsAsync();
    if (!(await fs.exists!(this.keyPath))) return null;
    this.keyFileContents = (await fs.readFile!(this.keyPath, "utf8")).trim();
    return this.keyFileContents;
  }

  private handleMissingKey(): null {
    if (this.raiseIfMissingKey) {
      throw new MissingKeyError({ keyPath: this.keyPath, envKey: this.envKey });
    }
    return null;
  }

  private checkKeyLength(key: string): void {
    if (key.length !== EncryptedFile.expectedKeyLength()) {
      throw new InvalidKeyLengthError();
    }
  }

  private async readOrEmpty(): Promise<string> {
    try {
      return await this.read();
    } catch (e) {
      if (e instanceof MissingContentError) return "";
      throw e;
    }
  }

  /**
   * Rails resolves `content_path` symlinks eagerly in `initialize`
   * (`path.symlink? ? path.realpath : path`). We can't await in a
   * constructor, so the resolution is lazy + memoized on first I/O.
   */
  private async resolveContentPath(): Promise<string> {
    if (this.resolvedContentPath !== null) return this.resolvedContentPath;
    const fs = await getFsAsync();
    try {
      const lstat = fs.lstat ? await fs.lstat(this.contentPath) : null;
      if (lstat?.isSymbolicLink?.() && fs.realpath) {
        this.resolvedContentPath = await fs.realpath(this.contentPath);
      } else {
        this.resolvedContentPath = this.contentPath;
      }
    } catch {
      // ENOENT etc. — leave unresolved; downstream I/O will surface the error.
      this.resolvedContentPath = this.contentPath;
    }
    return this.resolvedContentPath;
  }
}
