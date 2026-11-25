import { File } from "@blazetrails/ruby-compat/file";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { IO } from "@blazetrails/ruby-compat/io";
import { env as processEnv } from "@blazetrails/ruby-compat/process-adapter";
import { SecureRandom } from "@blazetrails/ruby-compat/secure-random";
import { chomp } from "@blazetrails/ruby-compat/string/chomp";
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
    return SecureRandom.hex(MessageEncryptor.keyLen(CIPHER));
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

  /** @missingRailsName strip — PERMANENT */
  async read(): Promise<string> {
    const key = await this.key();
    const path = await this.resolveContentPath();
    if (key !== null && (await File.isExistAsync(path))) {
      return this.decrypt((await File.readAsync(path)).trim());
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

  private async writing(
    contents: string,
    block: (tmpPath: string) => void | Promise<void>,
  ): Promise<void> {
    const contentPath = await this.resolveContentPath();

    await Tempfile.create(
      ["", "-" + chomp(File.basename(contentPath), ".enc")],
      File.dirname(contentPath),
      async (tmpFile) => {
        const tmpPath = tmpFile.path()!;
        await File.writeAsync(tmpPath, contents);

        await block(tmpPath);

        const updatedContents = await File.readAsync(tmpPath);

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
    this.memoEncryptor = new MessageEncryptor(
      Buffer.from((await this.key()) ?? "", "hex"),
      undefined,
      {
        cipher: CIPHER,
        serializer: "marshal",
      },
    );
    return this.memoEncryptor;
  }

  /** @missingRailsCall presence — PERMANENT */
  private readEnvKey(): string | null {
    const v = processEnv[this.envKey];
    return v && v.length > 0 ? v : null;
  }

  private async readKeyFile(): Promise<string | null> {
    if (this.keyFileContents != null) return this.keyFileContents;
    return (this.keyFileContents = (await File.isExistAsync(this.keyPath))
      ? (await File.readAsync(this.keyPath)).trim()
      : null);
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
    try {
      if (await File.isSymlinkAsync(this.contentPath)) {
        this.resolvedContentPath = await File.realpathAsync(this.contentPath);
      } else {
        this.resolvedContentPath = this.contentPath;
      }
    } catch {
      this.resolvedContentPath = this.contentPath;
    }
    return this.resolvedContentPath;
  }
}
