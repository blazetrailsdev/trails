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
 * - **Env lookup goes through `processAdapter.env`**, not `process.env`.
 */

import { getCrypto } from "./crypto-adapter.js";
import { FileUtils, getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { MessageEncryptor } from "./message-encryptor.js";
import { env as processEnv } from "./process-adapter.js";
import { chomp } from "@blazetrails/ruby-compat";
import { Tempfile } from "./tempfile.js";

const CIPHER = "aes-128-gcm";

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
  private static memoExpectedKeyLength?: number;

  readonly contentPath: string;
  readonly keyPath: string;
  readonly envKey: string;
  readonly raiseIfMissingKey: boolean;

  private keyFileContents: string | null = null;
  private keyFileChecked = false;
  private resolvedContentPath: string | null = null;
  private memoEncryptor: MessageEncryptor | null = null;

  /**
   * @missingRailsCall new — PERMANENT. encrypted_file.rb:42-43 `Pathname.new(content_path)`
   *   / `Pathname.new(key_path)` — Ruby's Pathname has no port; trails keeps
   *   paths as strings and reaches the filesystem through the async fs/path
   *   adapters, so there is no Pathname to construct.
   */
  constructor(opts: EncryptedFileOptions) {
    this.contentPath = opts.contentPath;
    this.keyPath = opts.keyPath;
    this.envKey = opts.envKey;
    this.raiseIfMissingKey = opts.raiseIfMissingKey;
  }

  static generateKey(): string {
    // Randomness is sourced from cryptoAdapter so we never fall back to a
    // non-cryptographic RNG. In Node the adapter auto-registers synchronously;
    // browser hosts must register a webcrypto adapter first.
    return Buffer.from(getCrypto().randomBytes(MessageEncryptor.keyLen(CIPHER))).toString("hex");
  }

  static expectedKeyLength(): number {
    this.memoExpectedKeyLength ??= this.generateKey().length;
    return this.memoExpectedKeyLength;
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
    if (key !== null && (await fs.exists(path))) {
      return this.decrypt((await fs.readFile!(path, "utf8")).trim());
    }
    throw new MissingContentError(path);
  }

  async write(contents: string): Promise<void> {
    const fs = await getFsAsync();
    const path = await this.resolveContentPath();
    const tmp = `${path}.tmp`;
    await fs.writeFile!(tmp, await this.encrypt(contents), { mode: 0o600 });
    FileUtils.mv(tmp, path);
  }

  async change(block: (tmpPath: string) => void | Promise<void>): Promise<void> {
    await this.writing(await this.readOrEmpty(), block);
  }

  // ---- private ----

  /**
   * `Tempfile.create` defaults to mode 0600, which is load-bearing here: the
   * temp file holds plaintext secrets between the editor write and the
   * re-encrypt step, so it must not be world-readable.
   *
   * @missingRailsArgs chomp — PERMANENT. encrypted_file.rb:89
   *   `content_path.basename.to_s.chomp(".enc")` — trails ports Ruby's String
   *   methods as free functions rather than String.prototype patches, so the
   *   receiver is argument 1: `chomp(path.basename(contentPath), ".enc")`.
   */
  private async writing(
    contents: string,
    block: (tmpPath: string) => void | Promise<void>,
  ): Promise<void> {
    const fs = await getFsAsync();
    const path = await getPathAsync();
    const contentPath = await this.resolveContentPath();

    await Tempfile.create(
      ["", "-" + chomp(path.basename(contentPath), ".enc")],
      path.dirname(contentPath),
      async (tmpFile) => {
        const tmpPath = tmpFile.path!;
        await fs.writeFile!(tmpPath, contents, { mode: 0o600 });

        await block(tmpPath);

        const updatedContents = await fs.readFile!(tmpPath, "utf8");

        if (updatedContents !== contents) await this.write(updatedContents);
      },
    );
  }

  private async encrypt(contents: string): Promise<string> {
    await this.checkKeyLength();
    return (await this.encryptor()).encryptAndSign(contents);
  }

  private async decrypt(contents: string): Promise<string> {
    return (await this.encryptor()).decryptAndVerify(contents) as string;
  }

  /**
   * @missingRailsArgs new — PERMANENT. encrypted_file.rb:113
   *   `MessageEncryptor.new([key].pack("H*"), cipher: CIPHER, serializer: Marshal)`
   *   — `Buffer.from(key, "hex")` is the `pack("H*")`, and Ruby's `Marshal`
   *   constant is spelled here as the `"marshal"` format key, which is how the
   *   whole package names the trails Marshal-equivalent
   *   (`messages/serializer-with-fallback.ts`). Ruby's Marshal wire format is
   *   excluded project-wide in `scripts/api-compare/unported-files.ts`.
   */
  private async encryptor(): Promise<MessageEncryptor> {
    if (this.memoEncryptor) return this.memoEncryptor;
    this.memoEncryptor = new MessageEncryptor(Buffer.from((await this.key()) ?? "", "hex"), {
      cipher: CIPHER,
      serializer: "marshal",
    });
    return this.memoEncryptor;
  }

  /**
   * @missingRailsCall presence — PERMANENT. Per-entry verified (RFC 0032 wide-entry
   *   verification): Rails encrypted_file.rb:117-119 reads
   *   `ENV[env_key].presence`; trails encrypted-file.ts:192-195 spells presence
   *   as an explicit empty-string check.
   */
  private readEnvKey(): string | null {
    const v = processEnv[this.envKey];
    return v && v.length > 0 ? v : null;
  }

  private async readKeyFile(): Promise<string | null> {
    if (this.keyFileChecked) return this.keyFileContents;
    this.keyFileChecked = true;
    const fs = await getFsAsync();
    if (!(await fs.exists(this.keyPath))) return null;
    this.keyFileContents = (await fs.readFile!(this.keyPath, "utf8")).trim();
    return this.keyFileContents;
  }

  private handleMissingKey(): null {
    if (this.raiseIfMissingKey) {
      throw new MissingKeyError({ keyPath: this.keyPath, envKey: this.envKey });
    }
    return null;
  }

  private async checkKeyLength(): Promise<void> {
    if ((await this.key())?.length !== EncryptedFile.expectedKeyLength()) {
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
