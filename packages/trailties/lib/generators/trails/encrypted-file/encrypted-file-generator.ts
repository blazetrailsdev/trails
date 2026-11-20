import "../../../constants.trails-encrypted-file-encrypted-file-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { Base } from "../../base.js";

export class EncryptedFileGenerator extends Base {
  static {
    this.methodAdded("addEncryptedFileSilently");
  }

  async addEncryptedFileSilently(
    filePath: string,
    keyPath: string,
    template: string = this.encryptedFileTemplate(),
  ): Promise<void> {
    if (!File.isExist(filePath)) {
      await new EncryptedFile({
        contentPath: filePath,
        keyPath,
        envKey: "TRAILS_MASTER_KEY",
        raiseIfMissingKey: true,
      }).write(template);
    }
  }

  /** @internal */
  private encryptedFileTemplate(): string {
    return `# aws:
#   access_key_id: 123
#   secret_access_key: 345

`;
  }
}
