import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";

export class EncryptionKeyFileGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new EncryptionKeyFileGenerator(config);
    generator.addKeyFile(args[0]);
    return generator.getCreatedFiles();
  }

  addKeyFile(keyPath: string): void {
    if (!this.fileExists(keyPath)) {
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

  addKeyFileSilently(keyPath: string, key?: string): void {
    this.createFile(keyPath, key ?? EncryptedFile.generateKey(), { mode: 0o600 });
  }

  ignoreKeyFile(keyPath: string, ignore: string = this.keyIgnore(keyPath)): void {
    if (this.fileExists(".gitignore")) {
      if (!this.readFile(".gitignore").includes(ignore)) {
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

  ignoreKeyFileSilently(keyPath: string, ignore: string = this.keyIgnore(keyPath)): void {
    if (this.fileExists(".gitignore")) this.appendToFile(".gitignore", ignore);
  }

  private keyIgnore = (keyPath: string): string => `\n/${keyPath}\n`;
}
