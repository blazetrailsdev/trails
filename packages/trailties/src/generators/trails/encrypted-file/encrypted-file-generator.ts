import { File } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { Base } from "../../base.js";

const DEFAULT_TEMPLATE = `# aws:
#   access_key_id: 123
#   secret_access_key: 345

`;

export class EncryptedFileGenerator extends Base {
  static {
    this.methodAdded("addEncryptedFileSilently");
  }

  async addEncryptedFileSilently(
    filePath: string,
    keyPath: string,
    template: string = DEFAULT_TEMPLATE,
  ): Promise<void> {
    if (File.isExist(filePath)) return;
    const file = new EncryptedFile({
      contentPath: filePath,
      keyPath,
      envKey: "TRAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
    await file.write(template);
  }
}
