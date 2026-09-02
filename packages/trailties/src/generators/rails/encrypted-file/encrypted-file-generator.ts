import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";

const DEFAULT_TEMPLATE = `# aws:
#   access_key_id: 123
#   secret_access_key: 345

`;

export class EncryptedFileGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new EncryptedFileGenerator(config);
    await generator.addEncryptedFileSilently(args[0], args[1]);
    return generator.getCreatedFiles();
  }

  async addEncryptedFileSilently(
    filePath: string,
    keyPath: string,
    template: string = DEFAULT_TEMPLATE,
  ): Promise<void> {
    if (this.fileExists(filePath)) return;
    const file = new EncryptedFile({
      contentPath: this.path.join(this.cwd, filePath),
      keyPath: this.path.join(this.cwd, keyPath),
      envKey: "RAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
    await file.write(template);
    this.output(`      create  ${filePath}`);
  }
}
