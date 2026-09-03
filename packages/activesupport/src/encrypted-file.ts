import {
  getCrypto,
  FileUtils,
  IO,
  getFsAsync,
  getPathAsync,
  env as processEnv,
  chomp,
} from "@blazetrails/ruby-compat";
import { MessageEncryptor } from "./message-encryptor.js";
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

  /** @missingRailsCall new — PERMANENT */
  constructor(opts: EncryptedFileOptions) {
    this.contentPath = opts.contentPath;
    this.keyPath = opts.keyPath;
    this.envKey = opts.envKey;
    this.raiseIfMissingKey = opts.raiseIfMissingKey;
  }

  static generateKey(): string {
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
    const path = await this.resolveContentPath();
    IO.binwrite(`${path}.tmp`, await this.encrypt(contents));
    FileUtils.mv(`${path}.tmp`, path);
  }

  async change(block: (tmpPath: string) => void | Promise<void>): Promise<void> {
    await this.writing(await this.readOrEmpty(), block);
  }

  /** @missingRailsArgs chomp — PERMANENT */
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

  /** @missingRailsArgs new — PERMANENT */
  private async encryptor(): Promise<MessageEncryptor> {
    if (this.memoEncryptor) return this.memoEncryptor;
    this.memoEncryptor = new MessageEncryptor(Buffer.from((await this.key()) ?? "", "hex"), {
      cipher: CIPHER,
      serializer: "marshal",
    });
    return this.memoEncryptor;
  }

  /** @missingRailsCall presence — PERMANENT */
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
      this.resolvedContentPath = this.contentPath;
    }
    return this.resolvedContentPath;
  }
}
