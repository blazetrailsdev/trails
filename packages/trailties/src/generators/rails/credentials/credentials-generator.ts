import { File, FileUtils } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { SecureRandom } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";

export interface CredentialsGeneratorOptions extends GeneratorOptions {
  skipSecretKeyBase?: boolean;
}

export class CredentialsGenerator extends GeneratorBase {
  static {
    this.argument("contentPath", { default: "config/credentials.yml.enc" });
    this.argument("keyPath", { default: "config/master.key" });
    this.classOption("skipSecretKeyBase", { type: "boolean" });
    this.methodAdded("addCredentialsFile");
  }

  declare options: CredentialsGeneratorOptions;
  declare contentPath: string;
  declare keyPath: string;
  private memoSecretKeyBase: string | null = null;

  async addCredentialsFile(): Promise<void> {
    await this.inRoot(async () => {
      if (File.isExist(File.join(this.destinationRoot, this.contentPath))) return;
      this.say(`Adding ${this.contentPath} to store encrypted credentials.`);
      this.say("");
      const content = this.renderTemplate();
      await this.encryptedFile().write(content);
      this.say("The following content has been encrypted with the Rails master key:");
      this.say("");
      this.say(content, "on_green");
      this.say("");
      this.say("You can edit encrypted credentials with `bin/rails credentials:edit`.");
      this.say("");
    });
  }

  private encryptedFile(): EncryptedFile {
    const contentPath = File.join(this.destinationRoot, this.contentPath);
    FileUtils.mkdirP(File.dirname(contentPath));
    return new EncryptedFile({
      contentPath,
      keyPath: File.join(this.destinationRoot, this.keyPath),
      envKey: "RAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
  }

  private secretKeyBase(): string {
    return (this.memoSecretKeyBase ??= SecureRandom.hex(64));
  }

  private renderTemplate(): string {
    const lines = [
      "# smtp:",
      "#   user_name: my-smtp-user",
      "#   password: my-smtp-password",
      "#",
      "# aws:",
      "#   access_key_id: 123",
      "#   secret_access_key: 345",
    ];
    if (!this.options.skipSecretKeyBase) {
      lines.push(
        "",
        "# Used as the base secret for all MessageVerifiers in Rails, including the one protecting cookies.",
        `secret_key_base: ${this.secretKeyBase()}`,
      );
    }
    return lines.join("\n") + "\n";
  }
}
