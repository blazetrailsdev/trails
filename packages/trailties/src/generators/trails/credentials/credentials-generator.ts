import { File } from "@blazetrails/ruby-compat";
import { EncryptedConfiguration } from "@blazetrails/activesupport";
import { SecureRandom } from "@blazetrails/ruby-compat";
import { Base as GeneratorBase, type GeneratorOptions } from "../../base.js";

export interface CredentialsGeneratorOptions extends GeneratorOptions {
  skipSecretKeyBase?: boolean;
}

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class CredentialsGenerator extends GeneratorBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
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
      if (File.isExist(this.contentPath)) return;
      this.say(`Adding ${this.contentPath} to store encrypted credentials.`);
      this.say("");

      const content = await this.renderTemplateToEncryptedFile();

      this.say("The following content has been encrypted with the Trails master key:");
      this.say("");
      this.say(content, "on_green");
      this.say("");
      this.say("You can edit encrypted credentials with `bin/trails credentials:edit`.");
      this.say("");
    });
  }

  private encryptedFile(): EncryptedConfiguration {
    return new EncryptedConfiguration({
      configPath: this.contentPath,
      keyPath: this.keyPath,
      envKey: "TRAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
  }

  private secretKeyBase(): string {
    return (this.memoSecretKeyBase ??= SecureRandom.hex(64));
  }

  private async renderTemplateToEncryptedFile(): Promise<string | null> {
    await this.emptyDirectory(File.dirname(this.contentPath));

    let content: string | null = null;

    await this.encryptedFile().change(async (tmpPath) => {
      await this.template(
        "credentials.yml",
        tmpPath,
        { force: true, verbose: false },
        (rendered: string) => (content = rendered),
      );
    });

    return content;
  }
}
