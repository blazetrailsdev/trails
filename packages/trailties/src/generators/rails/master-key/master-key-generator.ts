import { Pathname } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { GeneratorBase } from "../../base.js";
import { EncryptionKeyFileGenerator } from "../encryption-key-file/encryption-key-file-generator.js";

const MASTER_KEY_PATH = new Pathname("config/master.key");

export class MasterKeyGenerator extends GeneratorBase {
  static {
    this.methodAdded("addMasterKeyFile");
    this.methodAdded("addMasterKeyFileSilently");
    this.methodAdded("ignoreMasterKeyFile");
    this.methodAdded("ignoreMasterKeyFileSilently");
  }

  async addMasterKeyFile(): Promise<void> {
    if (!MASTER_KEY_PATH.isExist()) {
      const key = EncryptedFile.generateKey();

      this.log(`Adding ${MASTER_KEY_PATH} to store the master encryption key: ${key}`);
      this.log("");
      this.log("Save this in a password manager your team can access.");
      this.log("");
      this.log(
        "If you lose the key, no one, including you, can access anything encrypted with it.",
      );

      this.log("");
      await this.addMasterKeyFileSilently(key);
      this.log("");
    }
  }

  async addMasterKeyFileSilently(key?: string): Promise<void> {
    if (MASTER_KEY_PATH.isExist()) return;
    await this.keyFileGenerator().addKeyFileSilently(MASTER_KEY_PATH, key);
  }

  async ignoreMasterKeyFile(): Promise<void> {
    await this.keyFileGenerator().ignoreKeyFile(MASTER_KEY_PATH, this.keyIgnore());
  }

  async ignoreMasterKeyFileSilently(): Promise<void> {
    await this.keyFileGenerator().ignoreKeyFileSilently(MASTER_KEY_PATH, this.keyIgnore());
  }

  private keyFileGenerator(): EncryptionKeyFileGenerator {
    return new EncryptionKeyFileGenerator([], this.options);
  }

  private keyIgnore(): string {
    return `\n# Ignore master key for decrypting credentials and more.\n/${MASTER_KEY_PATH}\n`;
  }
}
