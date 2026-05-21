import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";

export class EncryptionKeyFileGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  addKeyFile(keyPath: string): void {
    if (this.fileExists(keyPath)) return;
    const key = EncryptedFile.generateKey();
    this.output(`Adding ${keyPath} to store the encryption key: ${key}`);
    this.output("Save this in a password manager your team can access.");
    this.output(
      "If you lose the key, no one, including you, can access anything encrypted with it.",
    );
    this.addKeyFileSilently(keyPath, key);
  }

  addKeyFileSilently(keyPath: string, key?: string): void {
    this.createFile(keyPath, key ?? EncryptedFile.generateKey(), { mode: 0o600 });
  }

  ignoreKeyFile(keyPath: string, ignore: string = this.keyIgnore(keyPath)): void {
    if (!this.fileExists(".gitignore")) {
      this.output(`IMPORTANT: Don't commit ${keyPath}. Add this to your ignore file:${ignore}`);
      return;
    }
    const existing = this.fs.readFileSync(this.path.join(this.cwd, ".gitignore"), "utf-8");
    if (existing.includes(ignore)) return;
    this.output(`Ignoring ${keyPath} so it won't end up in Git history:`);
    this.appendToFile(".gitignore", ignore);
  }

  ignoreKeyFileSilently(keyPath: string, ignore: string = this.keyIgnore(keyPath)): void {
    if (this.fileExists(".gitignore")) this.appendToFile(".gitignore", ignore);
  }

  private keyIgnore = (keyPath: string): string => `\n/${keyPath}\n`;
}
