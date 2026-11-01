import { File, getPath } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { GeneratorBase } from "../../base.js";

const DEFAULT_TEMPLATE = `# aws:
#   access_key_id: 123
#   secret_access_key: 345

`;

export class EncryptedFileGenerator extends GeneratorBase {
  static {
    this.methodAdded("addEncryptedFileSilently");
  }

  async addEncryptedFileSilently(
    filePath: string,
    keyPath: string,
    template: string = DEFAULT_TEMPLATE,
  ): Promise<void> {
    if (File.isExist(getPath().resolve(this.destinationRoot, filePath))) return;
    const file = new EncryptedFile({
      contentPath: getPath().resolve(this.destinationRoot, filePath),
      keyPath: getPath().resolve(this.destinationRoot, keyPath),
      envKey: "RAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
    await file.write(template);
  }
}
