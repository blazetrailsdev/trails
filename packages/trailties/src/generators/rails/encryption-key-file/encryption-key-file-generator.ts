import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { File, Pathname } from "@blazetrails/ruby-compat";
import { GeneratorBase } from "../../base.js";

export class EncryptionKeyFileGenerator extends GeneratorBase {
  static {
    this.methodAdded("addKeyFile");
    this.methodAdded("addKeyFileSilently");
    this.methodAdded("ignoreKeyFile");
    this.methodAdded("ignoreKeyFileSilently");
  }

  addKeyFile(keyPath: string | Pathname): void {
    keyPath = new Pathname(keyPath);

    if (!keyPath.isExist()) {
      const key = EncryptedFile.generateKey();

      this.log(`Adding ${keyPath} to store the encryption key: ${key}`);
      this.log("");
      this.log("Save this in a password manager your team can access.");
      this.log("");
      this.log(
        "If you lose the key, no one, including you, can access anything encrypted with it.",
      );

      this.log("");
      this.addKeyFileSilently(keyPath, key);
      this.log("");
    }
  }

  addKeyFileSilently(keyPath: string | Pathname, key?: string): void {
    this.createFile(keyPath, key ?? EncryptedFile.generateKey(), { mode: 0o600 });
  }

  ignoreKeyFile(keyPath: string | Pathname, ignore: string = this.keyIgnore(keyPath)): void {
    if (File.isExist(".gitignore")) {
      if (!File.read(".gitignore").includes(ignore)) {
        this.log(`Ignoring ${keyPath} so it won't end up in Git history:`);
        this.log("");
        this.appendToFile(".gitignore", ignore);
        this.log("");
      }
    } else {
      this.log(`IMPORTANT: Don't commit ${keyPath}. Add this to your ignore file:`);
      this.log(ignore, "on_green");
      this.log("");
    }
  }

  ignoreKeyFileSilently(
    keyPath: string | Pathname,
    ignore: string = this.keyIgnore(keyPath),
  ): void {
    if (File.isExist(".gitignore")) this.appendToFile(".gitignore", ignore);
  }

  private keyIgnore = (keyPath: string | Pathname): string => `\n/${keyPath}\n`;
}
