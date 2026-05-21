import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { EncryptionKeyFileGenerator } from "../encryption-key-file/encryption-key-file-generator.js";

const MASTER_KEY_PATH = "config/master.key";

export class MasterKeyGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  addMasterKeyFile(): void {
    if (this.fileExists(MASTER_KEY_PATH)) return;
    const key = EncryptedFile.generateKey();
    this.output(`Adding ${MASTER_KEY_PATH} to store the master encryption key: ${key}`);
    this.output("Save this in a password manager your team can access.");
    this.output(
      "If you lose the key, no one, including you, can access anything encrypted with it.",
    );
    this.addMasterKeyFileSilently(key);
  }

  addMasterKeyFileSilently(key?: string): void {
    if (this.fileExists(MASTER_KEY_PATH)) return;
    this.keyFileGenerator().addKeyFileSilently(MASTER_KEY_PATH, key);
  }

  ignoreMasterKeyFile(): void {
    this.keyFileGenerator().ignoreKeyFile(MASTER_KEY_PATH, this.keyIgnore());
  }

  ignoreMasterKeyFileSilently(): void {
    this.keyFileGenerator().ignoreKeyFileSilently(MASTER_KEY_PATH, this.keyIgnore());
  }

  private keyFileGenerator(): EncryptionKeyFileGenerator {
    return new EncryptionKeyFileGenerator({ cwd: this.cwd, output: this.output });
  }

  private keyIgnore(): string {
    return `\n# Ignore master key for decrypting credentials and more.\n/${MASTER_KEY_PATH}\n`;
  }
}
